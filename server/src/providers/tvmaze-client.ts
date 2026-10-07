import { z } from "zod"
import { ProviderHttpClient } from "./http-client.js"

const showSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  status: z.string(),
  premiered: z.string().nullable(),
  ended: z.string().nullable(),
  summary: z.string().nullable(),
  externals: z.object({
    tvrage: z.number().int().nullable(),
    thetvdb: z.number().int().nullable(),
    imdb: z.string().nullable(),
  }),
  image: z.object({ medium: z.string(), original: z.string() }).nullable(),
})

const searchResultSchema = z.object({ score: z.number(), show: showSchema })

const episodeSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  season: z.number().int(),
  number: z.number().int().nullable(),
  type: z.string(),
  airdate: z.string(),
  airtime: z.string(),
  airstamp: z.string().nullable(),
  runtime: z.number().int().nullable(),
  summary: z.string().nullable(),
  image: z.object({ medium: z.string(), original: z.string() }).nullable().optional(),
})

type TvmazeClientOptions = {
  baseUrl: string
  timeoutMs: number
  maxRetries: number
  fetchImplementation?: typeof fetch
  sleepImplementation?: (milliseconds: number) => Promise<void>
}

export type TvmazeShow = z.infer<typeof showSchema>
export type TvmazeEpisode = z.infer<typeof episodeSchema>

export class TvmazeClient {
  private readonly http: ProviderHttpClient

  constructor(options: TvmazeClientOptions) {
    this.http = new ProviderHttpClient({
      provider: "TVmaze",
      ...options,
    })
  }

  searchShows(query: string) {
    return this.http.get("search/shows", {
      schema: z.array(searchResultSchema),
      query: { q: query },
    })
  }

  lookupShow(externalId: { imdb?: string; thetvdb?: number }) {
    if (!externalId.imdb && externalId.thetvdb === undefined) {
      throw new Error("An IMDb or TheTVDB identifier is required")
    }

    return this.http.get("lookup/shows", {
      schema: showSchema,
      query: externalId.imdb ? { imdb: externalId.imdb } : { thetvdb: externalId.thetvdb },
    })
  }

  getShow(id: number) {
    return this.http.get(`shows/${id}`, { schema: showSchema })
  }

  getEpisodes(showId: number, includeSpecials = true) {
    return this.http.get(`shows/${showId}/episodes`, {
      schema: z.array(episodeSchema),
      query: { specials: includeSpecials ? 1 : 0 },
    })
  }
}
