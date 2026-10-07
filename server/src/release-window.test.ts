import assert from "node:assert/strict"
import test from "node:test"
import { isInReleaseWindow, releaseWindowBounds } from "./release-window.js"

const now = new Date("2026-10-05T21:14:00.000Z")

test("builds a release window covering fourteen calendar days on either side of today", () => {
  assert.deepEqual(releaseWindowBounds(now), {
    start: new Date("2026-09-21T00:00:00.000Z"),
    endExclusive: new Date("2026-10-20T00:00:00.000Z"),
  })
})

test("includes both boundary days and excludes dates outside the release window", () => {
  assert.equal(isInReleaseWindow(new Date("2026-09-21T00:00:00.000Z"), now), true)
  assert.equal(isInReleaseWindow(new Date("2026-10-19T23:59:59.999Z"), now), true)
  assert.equal(isInReleaseWindow(new Date("2026-09-20T23:59:59.999Z"), now), false)
  assert.equal(isInReleaseWindow(new Date("2026-10-20T00:00:00.000Z"), now), false)
})
