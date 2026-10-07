import { z } from "zod"
import { ProviderHttpClient } from "./http-client.js"

const movieSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  overview: z.string(),
  release_date: z.string().optional(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
})

const movieDetailSchema = movieSchema.extend({
  imdb_id: z.string().nullable(),
  runtime: z.number().int().nullable(),
})

const showSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  overview: z.string(),
  first_air_date: z.string().optional(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
})

const showDetailSchema = showSchema.extend({
  last_air_date: z.string().nullable(),
  status: z.string(),
  number_of_episodes: z.number().int(),
  number_of_seasons: z.number().int(),
})

const externalIdsSchema = z.object({
  id: z.number().int(),
  imdb_id: z.string().nullable(),
  tvdb_id: z.number().int().nullable(),
})

const movieSearchSchema = z.object({
  page: z.number().int(),
  total_pages: z.number().int(),
  total_results: z.number().int(),
  results: z.array(movieSchema),
})

const showSearchSchema = z.object({
  page: z.number().int(),
  total_pages: z.number().int(),
  total_results: z.number().int(),
  results: z.array(showSchema),
})

type TmdbClientOptions = {
  accessToken: string
  baseUrl: string
  timeoutMs: number
  maxRetries: number
  fetchImplementation?: typeof fetch
  sleepImplementation?: (milliseconds: number) => Promise<void>
}

export type TmdbMovie = z.infer<typeof movieSchema>
export type TmdbShow = z.infer<typeof showSchema>
export type TmdbMovieDetail = z.infer<typeof movieDetailSchema>
export type TmdbShowDetail = z.infer<typeof showDetailSchema>
export type TmdbExternalIds = z.infer<typeof externalIdsSchema>

export class TmdbClient {
  private readonly http: ProviderHttpClient

  constructor(options: TmdbClientOptions) {
    if (options.accessToken.trim().length < 20) throw new Error("TMDB access token is not configured")

    this.http = new ProviderHttpClient({
      provider: "TMDB",
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
      headers: { Authorization: `Bearer ${options.accessToken}` },
      fetchImplementation: options.fetchImplementation,
      sleepImplementation: options.sleepImplementation,
    })
  }

  searchMovies(query: string, page = 1) {
    return this.http.get("search/movie", {
      schema: movieSearchSchema,
      query: { query, page, include_adult: false },
    })
  }

  searchShows(query: string, page = 1) {
    return this.http.get("search/tv", {
      schema: showSearchSchema,
      query: { query, page, include_adult: false },
    })
  }

  getMovie(id: number) {
    return this.http.get(`movie/${id}`, { schema: movieDetailSchema })
  }

  getShow(id: number) {
    return this.http.get(`tv/${id}`, { schema: showDetailSchema })
  }

  getShowExternalIds(id: number) {
    return this.http.get(`tv/${id}/external_ids`, { schema: externalIdsSchema })
  }
}
