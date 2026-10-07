import assert from "node:assert/strict"
import test from "node:test"
import { z } from "zod"
import { ProviderHttpClient, ProviderHttpError, ProviderResponseError } from "./http-client.js"

test("retries rate-limited requests using Retry-After", async () => {
  let calls = 0
  const delays: number[] = []
  const client = new ProviderHttpClient({
    provider: "test-provider",
    baseUrl: "https://provider.example.test",
    timeoutMs: 1_000,
    maxRetries: 2,
    fetchImplementation: (async () => {
      calls += 1
      return calls === 1
        ? new Response(null, { status: 429, headers: { "Retry-After": "2" } })
        : Response.json({ id: 7 })
    }) as typeof fetch,
    sleepImplementation: async (milliseconds) => {
      delays.push(milliseconds)
    },
  })

  const result = await client.get("shows", { schema: z.object({ id: z.number() }) })

  assert.deepEqual(result, { id: 7 })
  assert.equal(calls, 2)
  assert.deepEqual(delays, [2_000])
})

test("does not retry non-retryable HTTP errors", async () => {
  let calls = 0
  const client = new ProviderHttpClient({
    provider: "test-provider",
    baseUrl: "https://provider.example.test",
    timeoutMs: 1_000,
    maxRetries: 2,
    fetchImplementation: (async () => {
      calls += 1
      return new Response(null, { status: 404 })
    }) as typeof fetch,
  })

  await assert.rejects(
    client.get("missing", { schema: z.unknown() }),
    (error: unknown) => error instanceof ProviderHttpError && error.status === 404 && !error.retryable
  )
  assert.equal(calls, 1)
})

test("rejects successful responses that do not match the schema", async () => {
  const client = new ProviderHttpClient({
    provider: "test-provider",
    baseUrl: "https://provider.example.test",
    timeoutMs: 1_000,
    maxRetries: 0,
    fetchImplementation: (async () => Response.json({ id: "wrong" })) as typeof fetch,
  })

  await assert.rejects(
    client.get("shows", { schema: z.object({ id: z.number() }) }),
    ProviderResponseError
  )
})

test("aborts timed-out requests and retries them", async () => {
  let calls = 0
  const client = new ProviderHttpClient({
    provider: "test-provider",
    baseUrl: "https://provider.example.test",
    timeoutMs: 5,
    maxRetries: 1,
    fetchImplementation: ((_input, init) => {
      calls += 1
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")))
      })
    }) as typeof fetch,
    sleepImplementation: async () => undefined,
  })

  await assert.rejects(
    client.get("slow", { schema: z.unknown() }),
    (error: unknown) => error instanceof ProviderHttpError && error.status === 0 && error.retryable
  )
  assert.equal(calls, 2)
})
