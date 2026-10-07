import assert from "node:assert/strict"
import test from "node:test"
import { compareReleaseOrder, decodeReleaseCursor, encodeReleaseCursor } from "./release-pagination.js"

test("round-trips an unwatched release cursor", () => {
  const cursor = { date: new Date("2026-10-05T00:00:00.000Z"), kind: "EPISODE" as const, id: "episode-1" }
  assert.deepEqual(decodeReleaseCursor(encodeReleaseCursor(cursor)), cursor)
})

test("rejects malformed unwatched release cursors", () => {
  assert.equal(decodeReleaseCursor("not-a-cursor"), null)
  assert.equal(decodeReleaseCursor(Buffer.from(JSON.stringify(["invalid", "EPISODE", "episode-1"])).toString("base64url")), null)
})

test("sorts releases by date, then kind, then identifier", () => {
  const date = new Date("2026-10-05T00:00:00.000Z")
  const releases = [
    { date, kind: "MOVIE" as const, id: "movie-1" },
    { date, kind: "EPISODE" as const, id: "episode-2" },
    { date: new Date("2026-10-04T00:00:00.000Z"), kind: "MOVIE" as const, id: "movie-2" },
    { date, kind: "EPISODE" as const, id: "episode-1" },
  ]

  assert.deepEqual(releases.sort(compareReleaseOrder).map(({ kind, id }) => `${kind}:${id}`), [
    "MOVIE:movie-2",
    "EPISODE:episode-1",
    "EPISODE:episode-2",
    "MOVIE:movie-1",
  ])
})
