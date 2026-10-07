import assert from "node:assert/strict"
import test from "node:test"
import { ProviderRefreshScheduler } from "./refresh-scheduler.js"

test("runs a bounded refresh against the interval-derived stale cutoff", async () => {
  const received: Array<{ staleBefore: Date; limit: number }> = []
  const scheduler = new ProviderRefreshScheduler({
    service: {
      async refreshStale(staleBefore, limit) {
        received.push({ staleBefore, limit })
        return { attempted: 2, succeeded: 2, failed: 0 }
      },
    },
    intervalMs: 21_600_000,
    batchSize: 25,
    now: () => Date.parse("2026-09-26T12:00:00Z"),
  })

  const summary = await scheduler.runOnce()

  assert.deepEqual(summary, { attempted: 2, succeeded: 2, failed: 0 })
  assert.equal(received[0]?.staleBefore.toISOString(), "2026-09-26T06:00:00.000Z")
  assert.equal(received[0]?.limit, 25)
})

test("coalesces overlapping refresh runs", async () => {
  let calls = 0
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  const scheduler = new ProviderRefreshScheduler({
    service: {
      async refreshStale() {
        calls += 1
        await gate
        return { attempted: 1, succeeded: 1, failed: 0 }
      },
    },
    intervalMs: 1_000,
    batchSize: 1,
  })

  const first = scheduler.runOnce()
  const second = scheduler.runOnce()
  assert.strictEqual(second, first)
  release?.()
  await first
  assert.equal(calls, 1)
})

test("allows automatic refresh to be disabled", async () => {
  const scheduler = new ProviderRefreshScheduler({
    service: {
      async refreshStale() {
        throw new Error("should not run")
      },
    },
    intervalMs: 0,
    batchSize: 1,
  })

  scheduler.start()
  await scheduler.stop()
})

test("refreshes stale provider data immediately when automatic refresh starts", async () => {
  let calls = 0
  const scheduler = new ProviderRefreshScheduler({
    service: {
      async refreshStale() {
        calls += 1
        return { attempted: 1, succeeded: 1, failed: 0 }
      },
    },
    intervalMs: 21_600_000,
    batchSize: 25,
  })

  scheduler.start()
  await scheduler.stop()

  assert.equal(calls, 1)
})
