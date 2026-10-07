import assert from "node:assert/strict"
import test from "node:test"
import { TmdbClient } from "./tmdb-client.js"
import { TvmazeClient } from "./tvmaze-client.js"

const tvmazeShow = {
  id: 42,
  name: "Signal Lost",
  status: "Running",
  premiered: "2026-01-01",
  ended: null,
  summary: "A test show.",
  externals: { tvrage: null, thetvdb: 123, imdb: "tt1234567" },
  image: null,
}

test("TMDB sends bearer authentication and encoded search parameters", async () => {
  let requestedUrl = ""
  let authorization = ""
  const client = new TmdbClient({
    accessToken: "test-token-that-is-long-enough",
    baseUrl: "https://tmdb.example.test/3",
    timeoutMs: 1_000,
    maxRetries: 0,
    fetchImplementation: (async (input, init) => {
      requestedUrl = String(input)
      authorization = new Headers(init?.headers).get("authorization") ?? ""
      return Response.json({ page: 1, total_pages: 1, total_results: 0, results: [] })
    }) as typeof fetch,
  })

  await client.searchMovies("Red vs. Blue")

  const url = new URL(requestedUrl)
  assert.equal(url.pathname, "/3/search/movie")
  assert.equal(url.searchParams.get("query"), "Red vs. Blue")
  assert.equal(url.searchParams.get("include_adult"), "false")
  assert.equal(authorization, "Bearer test-token-that-is-long-enough")
})

test("TVmaze looks shows up by stable external identifier", async () => {
  let requestedUrl = ""
  const client = new TvmazeClient({
    baseUrl: "https://tvmaze.example.test",
    timeoutMs: 1_000,
    maxRetries: 0,
    fetchImplementation: (async (input) => {
      requestedUrl = String(input)
      return Response.json(tvmazeShow)
    }) as typeof fetch,
  })

  const show = await client.lookupShow({ imdb: "tt1234567", thetvdb: 123 })

  const url = new URL(requestedUrl)
  assert.equal(url.pathname, "/lookup/shows")
  assert.equal(url.searchParams.get("imdb"), "tt1234567")
  assert.equal(url.searchParams.has("thetvdb"), false)
  assert.equal(show.externals.thetvdb, 123)
})

test("TVmaze refuses ambiguous lookup requests", () => {
  const client = new TvmazeClient({
    baseUrl: "https://tvmaze.example.test",
    timeoutMs: 1_000,
    maxRetries: 0,
  })

  assert.throws(() => client.lookupShow({}), /IMDb or TheTVDB/)
})
