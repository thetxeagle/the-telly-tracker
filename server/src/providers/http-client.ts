import type { ZodType } from "zod"

type FetchImplementation = typeof fetch
type SleepImplementation = (milliseconds: number) => Promise<void>

export class ProviderHttpError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number,
    public readonly retryable: boolean,
    message: string
  ) {
    super(message)
    this.name = "ProviderHttpError"
  }
}

export class ProviderResponseError extends Error {
  constructor(
    public readonly provider: string,
    public readonly cause: unknown
  ) {
    super(`${provider} returned an invalid response`)
    this.name = "ProviderResponseError"
  }
}

type ProviderHttpClientOptions = {
  provider: string
  baseUrl: string
  timeoutMs: number
  maxRetries: number
  headers?: HeadersInit
  fetchImplementation?: FetchImplementation
  sleepImplementation?: SleepImplementation
}

type JsonRequestOptions<T> = {
  schema: ZodType<T>
  query?: Record<string, string | number | boolean | undefined>
  headers?: HeadersInit
}

const sleep: SleepImplementation = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

export class ProviderHttpClient {
  private readonly fetchImplementation: FetchImplementation
  private readonly sleepImplementation: SleepImplementation

  constructor(private readonly options: ProviderHttpClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.sleepImplementation = options.sleepImplementation ?? sleep
  }

  async get<T>(path: string, request: JsonRequestOptions<T>): Promise<T> {
    const url = new URL(`${this.options.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`)
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs)

      try {
        const response = await this.fetchImplementation(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "TellyTracker/0.1",
            ...this.options.headers,
            ...request.headers,
          },
          signal: controller.signal,
        })

        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500
          const error = new ProviderHttpError(
            this.options.provider,
            response.status,
            retryable,
            `${this.options.provider} request failed with status ${response.status}`
          )

          if (!retryable || attempt === this.options.maxRetries) throw error
          await this.sleepImplementation(retryDelay(response.headers.get("retry-after"), attempt))
          continue
        }

        const body: unknown = await response.json()
        const parsed = request.schema.safeParse(body)
        if (!parsed.success) throw new ProviderResponseError(this.options.provider, parsed.error)
        return parsed.data
      } catch (error) {
        if (error instanceof ProviderHttpError || error instanceof ProviderResponseError) throw error
        if (attempt === this.options.maxRetries) {
          throw new ProviderHttpError(
            this.options.provider,
            0,
            true,
            `${this.options.provider} request failed: ${error instanceof Error ? error.message : "network error"}`
          )
        }
        await this.sleepImplementation(retryDelay(null, attempt))
      } finally {
        clearTimeout(timeout)
      }
    }

    throw new Error(`${this.options.provider} request exhausted without a response`)
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
  }
  return 250 * 2 ** attempt
}
