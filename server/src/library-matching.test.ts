import assert from "node:assert/strict"
import test from "node:test"
import { findDuplicateLibraryGroups, markTrackedSearchResults } from "./library-matching.js"

test("marks provider results tracked by TMDB identity or legacy title, type, and year", () => {
  const results = markTrackedSearchResults(
    [
      { tmdbId: 10, type: "SHOW", title: "The Ark", releaseDate: "2023-02-01" },
      { tmdbId: 20, type: "MOVIE", title: "Dune", releaseDate: "2021-10-22" },
      { tmdbId: 21, type: "MOVIE", title: "Dune", releaseDate: "1984-12-14" },
    ],
    [
      { tmdbId: 10, type: "SHOW", title: "Different title", releaseDate: new Date("2020-01-01") },
      { tmdbId: null, type: "MOVIE", title: "Dune", releaseDate: new Date("2021-01-01") },
    ]
  )

  assert.deepEqual(results.map(({ inLibrary }) => inLibrary), [true, true, false])
})

test("groups only same-title, same-type, same-year library entries and prefers provider records", () => {
  const base = {
    type: "SHOW" as const,
    title: "The Ark",
    releaseDate: new Date("2023-02-01"),
    tvmazeId: null,
    imdbId: null,
    thetvdbId: null,
    addedAt: new Date("2026-01-01"),
  }
  const groups = findDuplicateLibraryGroups([
    { ...base, id: "entry-seed", mediaId: "media-seed", tmdbId: null, episodeCount: 12 },
    { ...base, id: "entry-provider", mediaId: "media-provider", tmdbId: 10, episodeCount: 10 },
    { ...base, id: "entry-remake", mediaId: "media-remake", tmdbId: 11, episodeCount: 8, releaseDate: new Date("2030-01-01") },
  ])

  assert.equal(groups.length, 1)
  assert.equal(groups[0]?.keeper.id, "entry-provider")
  assert.deepEqual(groups[0]?.duplicates.map(({ id }) => id), ["entry-seed"])
})
