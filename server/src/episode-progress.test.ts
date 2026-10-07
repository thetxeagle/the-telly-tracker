import assert from "node:assert/strict"
import test from "node:test"
import { bulkEpisodeLimit, bulkProgressSchema } from "./episode-progress.js"

function episodeIds(count: number) {
  return Array.from({ length: count }, (_, index) => `episode-${index + 1}`)
}

test("accepts a bulk episode update at the configured limit", () => {
  const result = bulkProgressSchema.safeParse({ episodeIds: episodeIds(bulkEpisodeLimit), watched: true })

  assert.equal(result.success, true)
})

test("rejects a bulk episode update above the configured limit", () => {
  const result = bulkProgressSchema.safeParse({ episodeIds: episodeIds(bulkEpisodeLimit + 1), watched: false })

  assert.equal(result.success, false)
})
