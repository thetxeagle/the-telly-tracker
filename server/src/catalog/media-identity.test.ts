import assert from "node:assert/strict"
import test from "node:test"
import {
  MediaIdentityConflictError,
  MediaIdentityTypeConflictError,
  providerSourceId,
  resolveMediaIdentity,
  type StoredMediaIdentity,
} from "./media-identity.js"

const catalog: StoredMediaIdentity[] = [
  {
    id: "show-1",
    type: "SHOW",
    tmdbId: 101,
    tvmazeId: 201,
    imdbId: "tt0000101",
    thetvdbId: 301,
  },
  {
    id: "movie-1",
    type: "MOVIE",
    tmdbId: 101,
    tvmazeId: null,
    imdbId: "tt0000102",
    thetvdbId: null,
  },
  {
    id: "show-2",
    type: "SHOW",
    tmdbId: 102,
    tvmazeId: 202,
    imdbId: "tt0000103",
    thetvdbId: 302,
  },
]

test("resolves several provider identifiers to one existing record", () => {
  const match = resolveMediaIdentity(
    { type: "SHOW", tmdbId: 101, tvmazeId: 201, imdbId: "tt0000101" },
    catalog
  )

  assert.equal(match?.id, "show-1")
})

test("scopes TMDB identifiers by media type", () => {
  assert.equal(resolveMediaIdentity({ type: "SHOW", tmdbId: 101 }, catalog)?.id, "show-1")
  assert.equal(resolveMediaIdentity({ type: "MOVIE", tmdbId: 101 }, catalog)?.id, "movie-1")
})

test("rejects identifiers that point at different stored records", () => {
  assert.throws(
    () => resolveMediaIdentity({ type: "SHOW", tmdbId: 101, tvmazeId: 202 }, catalog),
    (error: unknown) =>
      error instanceof MediaIdentityConflictError &&
      error.mediaIds.join(",") === "show-1,show-2"
  )
})

test("rejects a global identifier that belongs to another media type", () => {
  assert.throws(
    () => resolveMediaIdentity({ type: "SHOW", imdbId: "tt0000102" }, catalog),
    MediaIdentityTypeConflictError
  )
})

test("returns null for a new identity and requires an identifier", () => {
  assert.equal(resolveMediaIdentity({ type: "SHOW", tmdbId: 999 }, catalog), null)
  assert.throws(() => resolveMediaIdentity({ type: "SHOW" }, catalog), /provider identifier/)
})

test("builds stable source IDs with provider priority and TMDB namespace", () => {
  assert.equal(providerSourceId({ type: "MOVIE", tmdbId: 101, imdbId: "tt0000102" }), "tmdb:movie:101")
  assert.equal(providerSourceId({ type: "SHOW", tvmazeId: 201 }), "tvmaze:show:201")
})
