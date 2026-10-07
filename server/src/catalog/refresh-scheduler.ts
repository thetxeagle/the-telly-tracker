import type { CatalogRefreshSummary, CatalogService } from "./catalog-service.js"

type RefreshService = Pick<CatalogService, "refreshStale">

type RefreshSchedulerOptions = {
  service: RefreshService
  intervalMs: number
  batchSize: number
  now?: () => number
  onResult?: (summary: CatalogRefreshSummary) => void
  onError?: (error: unknown) => void
}

export class ProviderRefreshScheduler {
  private timer: NodeJS.Timeout | null = null
  private running: Promise<CatalogRefreshSummary> | null = null

  constructor(private readonly options: RefreshSchedulerOptions) {}

  start(): void {
    if (this.timer || this.options.intervalMs === 0) return
    void this.runOnce().catch(() => undefined)
    this.timer = setInterval(() => {
      void this.runOnce().catch(() => undefined)
    }, this.options.intervalMs)
    this.timer.unref()
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    await this.running?.catch(() => undefined)
  }

  runOnce(): Promise<CatalogRefreshSummary> {
    if (this.running) return this.running
    const now = (this.options.now ?? Date.now)()
    const staleBefore = new Date(now - this.options.intervalMs)
    this.running = this.options.service
      .refreshStale(staleBefore, this.options.batchSize)
      .then((summary) => {
        this.options.onResult?.(summary)
        return summary
      })
      .catch((error: unknown) => {
        this.options.onError?.(error)
        throw error
      })
      .finally(() => {
        this.running = null
      })
    return this.running
  }
}
