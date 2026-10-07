import assert from "node:assert/strict"
import test from "node:test"
import { ProviderHttpError } from "../providers/http-client.js"
import type { CatalogRecord, CatalogRepository } from "./catalog-repository.js"
import { CatalogService } from "./catalog-service.js"

class CapturingRepository implements CatalogRepository {
  records: CatalogRecord[] = []
  errors: Array<{ id: string; message: string }> = []
  refreshCandidates: Awaited<ReturnType<CatalogRepository["findRefreshCandidates"]>> = []

  async findById(id: string) {
    return id === "stored-show"
      ? {
          id,
          type: "SHOW" as const,
          tmdbId: 10,
          tvmazeId: 20,
          imdbId: "tt0000010",
          thetvdbId: 30,
        }
      : null
  }

  async save(record: CatalogRecord) {
    this.records.push(record)
    return { id: record.identity.type === "SHOW" ? "stored-show" : "stored-movie", created: true, episodeCount: record.episodes.length }
  }

  async findRefreshCandidates() {
    return this.refreshCandidates
  }

  async recordSyncError(id: string, message: string) {
    this.errors.push({ id, message })
  }
}

const movieDetail = {
  id: 11,
  title: "The Test Movie",
  overview: "A deterministic movie.",
  release_date: "2026-02-03",
  poster_path: "/poster.jpg",
  backdrop_path: "/movie.jpg",
  imdb_id: "tt0000011",
  runtime: 121,
}

const showDetail = {
  id: 10,
  name: "The Test Show",
  overview: "A deterministic show.",
  first_air_date: "2025-01-02",
  last_air_date: null,
  status: "Returning Series",
  poster_path: "/poster.jpg",
  backdrop_path: "/show.jpg",
  number_of_episodes: 8,
  number_of_seasons: 1,
}

const tvmazeShow = {
  id: 20,
  name: "The Test Show",
  status: "Running",
  premiered: "2025-01-02",
  ended: null,
  summary: "A deterministic show.",
  externals: { tvrage: null, thetvdb: 30, imdb: "tt0000010" },
  image: null,
}

function providers(options: { tvmazeMissing?: boolean; onSearch?: () => void } = {}) {
  return {
    tmdb: {
      async getMovie() {
        return movieDetail
      },
      async getShow() {
        return showDetail
      },
      async getShowExternalIds() {
        return { id: 10, imdb_id: "tt0000010", tvdb_id: 30 }
      },
      async searchMovies() {
        options.onSearch?.()
        return { page: 1, total_pages: 1, total_results: 1, results: [movieDetail] }
      },
      async searchShows() {
        options.onSearch?.()
        return { page: 1, total_pages: 1, total_results: 1, results: [showDetail] }
      },
    },
    tvmaze: {
      async lookupShow() {
        if (options.tvmazeMissing) throw new ProviderHttpError("TVmaze", 404, false, "missing")
        return tvmazeShow
      },
      async getEpisodes() {
        return [
          {
            id: 2001,
            name: "Arrival",
            season: 1,
            number: 1,
            type: "regular",
            airdate: "2025-01-02",
            airtime: "20:00",
            airstamp: "2025-01-03T01:00:00Z",
            runtime: 44,
            summary: null,
            image: {
              medium: "https://static.tvmaze.com/uploads/images/medium_landscape/1/episode.jpg",
              original: "https://static.tvmaze.com/uploads/images/original_untouched/1/episode.jpg",
            },
          },
          {
            id: 2002,
            name: "Unnumbered Special",
            season: 0,
            number: null,
            type: "significant_special",
            airdate: "2025-01-03",
            airtime: "",
            airstamp: "2025-01-03T00:00:00Z",
            runtime: null,
            summary: null,
          },
        ]
      },
    },
  }
}

test("imports TMDB shows with TVmaze identities and numbered episodes", async () => {
  const repository = new CapturingRepository()
  const service = new CatalogService({
    repository,
    ...providers(),
    tmdbImageBaseUrl: "https://image.example.test/t/p/",
  })

  const result = await service.importTmdb("SHOW", 10)
  const saved = repository.records[0]

  assert.equal(result.episodeCount, 1)
  assert.deepEqual(saved.identity, {
    type: "SHOW",
    tmdbId: 10,
    tvmazeId: 20,
    imdbId: "tt0000010",
    thetvdbId: 30,
  })
  assert.equal(saved.backdrop, "https://image.example.test/t/p/w780/show.jpg")
  assert.equal(saved.poster, "https://image.example.test/t/p/w500/poster.jpg")
  assert.equal(saved.productionStatus, "Running")
  assert.equal(saved.episodes[0]?.tvmazeId, 2001)
  assert.equal(saved.episodes[0]?.airDate.toISOString(), "2025-01-03T01:00:00.000Z")
  assert.equal(saved.episodes[0]?.image, "https://static.tvmaze.com/uploads/images/medium_landscape/1/episode.jpg")
})

test("searches both TMDB media types and caches normalized queries", async () => {
  let searches = 0
  let now = 1_000
  const repository = new CapturingRepository()
  const service = new CatalogService({
    repository,
    ...providers({ onSearch: () => { searches += 1 } }),
    tmdbImageBaseUrl: "https://image.example.test/t/p",
    searchCacheTtlMs: 500,
    now: () => now,
  })

  const first = await service.search("  Test  ")
  const cached = await service.search("test")
  now = 1_501
  await service.search("TEST")

  assert.equal(first.length, 2)
  assert.equal(first[0]?.type, "MOVIE")
  assert.equal(first[1]?.type, "SHOW")
  assert.equal(first[1]?.backdrop, "https://image.example.test/t/p/w780/show.jpg")
  assert.equal(first[1]?.poster, "https://image.example.test/t/p/w500/poster.jpg")
  assert.strictEqual(cached, first)
  assert.equal(searches, 4)
})

test("imports a TMDB show without episodes when TVmaze has no external-ID match", async () => {
  const repository = new CapturingRepository()
  const service = new CatalogService({
    repository,
    ...providers({ tvmazeMissing: true }),
    tmdbImageBaseUrl: "https://image.example.test/t/p",
  })

  await service.importTmdb("SHOW", 10)

  assert.equal(repository.records[0]?.productionStatus, "Returning Series")

  assert.equal(repository.records[0]?.identity.tvmazeId, undefined)
  assert.deepEqual(repository.records[0]?.episodes, [])
})

test("imports movies and refreshes stored media through its TMDB identity", async () => {
  const repository = new CapturingRepository()
  const service = new CatalogService({
    repository,
    ...providers(),
    tmdbImageBaseUrl: "https://image.example.test/t/p",
  })

  await service.importTmdb("MOVIE", 11)
  const refresh = await service.refresh("stored-show")

  assert.equal(repository.records[0]?.identity.imdbId, "tt0000011")
  assert.equal(repository.records[0]?.totalEpisodes, 1)
  assert.equal(refresh.id, "stored-show")
  assert.equal(repository.records[1]?.identity.tmdbId, 10)
})

test("refuses to refresh records without a usable TMDB identity", async () => {
  const repository = new CapturingRepository()
  const service = new CatalogService({
    repository: {
      ...repository,
      async findById() {
        return { id: "legacy", type: "SHOW", tmdbId: null }
      },
      save: repository.save.bind(repository),
      findRefreshCandidates: repository.findRefreshCandidates.bind(repository),
      recordSyncError: repository.recordSyncError.bind(repository),
    },
    ...providers(),
    tmdbImageBaseUrl: "https://image.example.test/t/p",
  })

  await assert.rejects(service.refresh("legacy"), /no TMDB identifier/)
})

test("records provider failures during refresh", async () => {
  const repository = new CapturingRepository()
  const configured = providers()
  const service = new CatalogService({
    repository,
    tmdb: {
      ...configured.tmdb,
      async getShow() {
        throw new Error("TMDB unavailable")
      },
    },
    tvmaze: configured.tvmaze,
    tmdbImageBaseUrl: "https://image.example.test/t/p",
  })

  await assert.rejects(service.refresh("stored-show"), /TMDB unavailable/)
  assert.deepEqual(repository.errors, [{ id: "stored-show", message: "TMDB unavailable" }])
})

test("refreshes a bounded stale batch and reports per-title failures", async () => {
  const repository = new CapturingRepository()
  repository.refreshCandidates = [
    { id: "stored-show", type: "SHOW", tmdbId: 10 },
    { id: "missing", type: "SHOW", tmdbId: 12 },
  ]
  const service = new CatalogService({
    repository,
    ...providers(),
    tmdbImageBaseUrl: "https://image.example.test/t/p",
  })

  const summary = await service.refreshStale(new Date("2026-01-01T00:00:00Z"), 25)

  assert.deepEqual(summary, { attempted: 2, succeeded: 1, failed: 1 })
})
