import { ProviderHttpError } from "../providers/http-client.js"
import type { TmdbClient } from "../providers/tmdb-client.js"
import type { TvmazeClient, TvmazeEpisode, TvmazeShow } from "../providers/tvmaze-client.js"
import type { CatalogRecord, CatalogRepository, SavedCatalogRecord } from "./catalog-repository.js"
import type { MediaIdentity, MediaKind } from "./media-identity.js"

type TmdbProvider = Pick<
  TmdbClient,
  "getMovie" | "getShow" | "getShowExternalIds" | "searchMovies" | "searchShows"
>
type TvmazeProvider = Pick<TvmazeClient, "lookupShow" | "getEpisodes">

type CatalogServiceOptions = {
  repository: CatalogRepository
  tmdb: TmdbProvider
  tvmaze: TvmazeProvider
  tmdbImageBaseUrl: string
  searchCacheTtlMs?: number
  now?: () => number
}

export type CatalogSearchResult = {
  tmdbId: number
  type: MediaKind
  title: string
  synopsis: string
  releaseDate: string | null
  poster: string
  backdrop: string
}

export type CatalogRefreshSummary = {
  attempted: number
  succeeded: number
  failed: number
}

export class CatalogService {
  private readonly searchCache = new Map<string, { expiresAt: number; results: CatalogSearchResult[] }>()

  constructor(private readonly options: CatalogServiceOptions) {}

  async search(query: string): Promise<CatalogSearchResult[]> {
    const normalizedQuery = query.trim().toLowerCase()
    if (normalizedQuery.length < 2) throw new Error("Search query must contain at least two characters")
    const now = (this.options.now ?? Date.now)()
    const cached = this.searchCache.get(normalizedQuery)
    if (cached && cached.expiresAt > now) return cached.results

    const [movies, shows] = await Promise.all([
      this.options.tmdb.searchMovies(query.trim()),
      this.options.tmdb.searchShows(query.trim()),
    ])
    const results = [
      ...movies.results.map((movie) => ({
        tmdbId: movie.id,
        type: "MOVIE" as const,
        title: movie.title,
        synopsis: movie.overview,
        releaseDate: movie.release_date || null,
        poster: this.posterUrl(movie),
        backdrop: this.imageUrl(movie),
      })),
      ...shows.results.map((show) => ({
        tmdbId: show.id,
        type: "SHOW" as const,
        title: show.name,
        synopsis: show.overview,
        releaseDate: show.first_air_date || null,
        poster: this.posterUrl(show),
        backdrop: this.imageUrl(show),
      })),
    ]
    this.searchCache.set(normalizedQuery, {
      expiresAt: now + (this.options.searchCacheTtlMs ?? 300_000),
      results,
    })
    return results
  }

  async importTmdb(type: MediaKind, tmdbId: number): Promise<SavedCatalogRecord> {
    const record =
      type === "MOVIE" ? await this.buildMovie(tmdbId) : await this.buildShow(tmdbId)
    return this.options.repository.save(record)
  }

  async refresh(mediaId: string): Promise<SavedCatalogRecord> {
    const identity = await this.options.repository.findById(mediaId)
    if (!identity) throw new Error("Media record not found")
    if (!identity.tmdbId) throw new Error("Media record has no TMDB identifier")
    try {
      return await this.importTmdb(identity.type, identity.tmdbId)
    } catch (error) {
      await this.options.repository.recordSyncError(mediaId, errorMessage(error))
      throw error
    }
  }

  async refreshStale(staleBefore: Date, limit: number): Promise<CatalogRefreshSummary> {
    const candidates = await this.options.repository.findRefreshCandidates(staleBefore, limit)
    let succeeded = 0
    let failed = 0
    for (const candidate of candidates) {
      try {
        await this.refresh(candidate.id)
        succeeded += 1
      } catch {
        failed += 1
      }
    }
    return { attempted: candidates.length, succeeded, failed }
  }

  private async buildMovie(tmdbId: number): Promise<CatalogRecord> {
    const movie = await this.options.tmdb.getMovie(tmdbId)
    return {
      identity: { type: "MOVIE", tmdbId: movie.id, imdbId: movie.imdb_id },
      title: movie.title,
      synopsis: movie.overview,
      releaseDate: requiredDate(movie.release_date, `TMDB movie ${movie.id} has no release date`),
      endDate: null,
      productionStatus: null,
      totalSeasons: null,
      totalEpisodes: 1,
      poster: this.posterUrl(movie),
      backdrop: this.imageUrl(movie),
      episodes: [],
    }
  }

  private async buildShow(tmdbId: number): Promise<CatalogRecord> {
    const [show, externalIds] = await Promise.all([
      this.options.tmdb.getShow(tmdbId),
      this.options.tmdb.getShowExternalIds(tmdbId),
    ])
    const tvmaze = await this.findTvmazeShow(externalIds.imdb_id, externalIds.tvdb_id)
    const episodes = tvmaze ? await this.options.tvmaze.getEpisodes(tvmaze.id, true) : []
    const identity: MediaIdentity = {
      type: "SHOW",
      tmdbId: show.id,
      tvmazeId: tvmaze?.id,
      imdbId: externalIds.imdb_id,
      thetvdbId: externalIds.tvdb_id,
    }

    return {
      identity,
      title: show.name,
      synopsis: show.overview,
      releaseDate: requiredDate(show.first_air_date, `TMDB show ${show.id} has no air date`),
      endDate: optionalDate(show.last_air_date),
      productionStatus: tvmaze?.status ?? show.status,
      totalSeasons: show.number_of_seasons,
      totalEpisodes: show.number_of_episodes,
      poster: this.posterUrl(show),
      backdrop: this.imageUrl(show),
      episodes: episodes.flatMap(mapEpisode),
    }
  }

  private async findTvmazeShow(
    imdbId: string | null,
    thetvdbId: number | null
  ): Promise<TvmazeShow | null> {
    if (!imdbId && !thetvdbId) return null
    try {
      return await this.options.tvmaze.lookupShow({
        imdb: imdbId ?? undefined,
        thetvdb: thetvdbId ?? undefined,
      })
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 404) return null
      throw error
    }
  }

  private imageUrl(media: {
    backdrop_path?: string | null
    poster_path?: string | null
  }): string {
    const path = media.backdrop_path ?? media.poster_path
    return path ? `${this.options.tmdbImageBaseUrl.replace(/\/$/, "")}/w780${path}` : ""
  }

  private posterUrl(media: {
    backdrop_path?: string | null
    poster_path?: string | null
  }): string {
    const path = media.poster_path ?? media.backdrop_path
    return path ? `${this.options.tmdbImageBaseUrl.replace(/\/$/, "")}/w500${path}` : ""
  }
}

function mapEpisode(episode: TvmazeEpisode) {
  if (episode.number === null) return []
  const airDate = optionalDate(episode.airstamp || episode.airdate)
  if (!airDate) return []
  return [
    {
      tvmazeId: episode.id,
      season: episode.season,
      number: episode.number,
      title: episode.name,
      airDate,
      runtime: episode.runtime ?? 0,
      image: episode.image?.medium ?? episode.image?.original ?? "",
    },
  ]
}

function requiredDate(value: string | undefined, message: string): Date {
  const date = optionalDate(value)
  if (!date) throw new Error(message)
  return date
}

function optionalDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown provider synchronization error"
}
