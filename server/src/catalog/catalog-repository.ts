import { type MediaType, type Prisma, type PrismaClient } from "@prisma/client"
import {
  providerSourceId,
  resolveMediaIdentity,
  type MediaIdentity,
  type StoredMediaIdentity,
} from "./media-identity.js"

export type CatalogEpisode = {
  tvmazeId: number
  season: number
  number: number
  title: string
  airDate: Date
  runtime: number
  image: string
}

export type CatalogRecord = {
  identity: MediaIdentity
  title: string
  synopsis: string
  releaseDate: Date
  endDate: Date | null
  productionStatus: string | null
  totalSeasons: number | null
  totalEpisodes: number | null
  poster: string
  backdrop: string
  episodes: CatalogEpisode[]
}

export type SavedCatalogRecord = {
  id: string
  created: boolean
  episodeCount: number
}

export interface CatalogRepository {
  findById(id: string): Promise<StoredMediaIdentity | null>
  findRefreshCandidates(staleBefore: Date, limit: number): Promise<StoredMediaIdentity[]>
  save(record: CatalogRecord): Promise<SavedCatalogRecord>
  recordSyncError(id: string, message: string): Promise<void>
}

const identitySelect = {
  id: true,
  type: true,
  tmdbId: true,
  tvmazeId: true,
  imdbId: true,
  thetvdbId: true,
} satisfies Prisma.MediaSelect

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<StoredMediaIdentity | null> {
    return this.prisma.media.findUnique({ where: { id }, select: identitySelect })
  }

  async findRefreshCandidates(staleBefore: Date, limit: number): Promise<StoredMediaIdentity[]> {
    return this.prisma.media.findMany({
      where: {
        tmdbId: { not: null },
        OR: [{ metadataSyncedAt: null }, { metadataSyncedAt: { lt: staleBefore } }],
      },
      orderBy: { metadataSyncedAt: { sort: "asc", nulls: "first" } },
      take: limit,
      select: identitySelect,
    })
  }

  async recordSyncError(id: string, message: string): Promise<void> {
    await this.prisma.media.update({ where: { id }, data: { syncError: message.slice(0, 1_000) } })
  }

  async save(record: CatalogRecord): Promise<SavedCatalogRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const candidates = await transaction.media.findMany({
        where: { OR: identityFilters(record.identity) },
        select: identitySelect,
      })
      const existing = resolveMediaIdentity(record.identity, candidates)
      const data = {
        sourceId: existing ? undefined : providerSourceId(record.identity),
        tmdbId: record.identity.tmdbId ?? null,
        tvmazeId: record.identity.tvmazeId ?? null,
        imdbId: record.identity.imdbId ?? null,
        thetvdbId: record.identity.thetvdbId ?? null,
        title: record.title,
        type: record.identity.type as MediaType,
        synopsis: record.synopsis,
        releaseDate: record.releaseDate,
        endDate: record.endDate,
        productionStatus: record.productionStatus,
        totalSeasons: record.totalSeasons,
        totalEpisodes: record.totalEpisodes,
        poster: record.poster,
        backdrop: record.backdrop,
        metadataSyncedAt: new Date(),
        episodesSyncedAt: record.identity.tvmazeId ? new Date() : null,
        syncError: null,
      }

      const media = existing
        ? await transaction.media.update({ where: { id: existing.id }, data })
        : await transaction.media.create({
            data: { ...data, sourceId: providerSourceId(record.identity) },
          })

      for (const episode of record.episodes) {
        const stored = await transaction.episode.findFirst({
          where: {
            OR: [
              { tvmazeId: episode.tvmazeId },
              { mediaId: media.id, season: episode.season, number: episode.number },
            ],
          },
          select: { id: true, mediaId: true },
        })
        if (stored && stored.mediaId !== media.id) {
          throw new Error(`TVmaze episode ${episode.tvmazeId} belongs to another media record`)
        }

        const episodeData = { ...episode, mediaId: media.id }
        if (stored) {
          await transaction.episode.update({ where: { id: stored.id }, data: episodeData })
        } else {
          await transaction.episode.create({ data: episodeData })
        }
      }

      return { id: media.id, created: existing === null, episodeCount: record.episodes.length }
    })
  }
}

function identityFilters(identity: MediaIdentity): Prisma.MediaWhereInput[] {
  const filters: Prisma.MediaWhereInput[] = []
  if (identity.tmdbId) filters.push({ type: identity.type, tmdbId: identity.tmdbId })
  if (identity.tvmazeId) filters.push({ tvmazeId: identity.tvmazeId })
  if (identity.imdbId) filters.push({ imdbId: identity.imdbId })
  if (identity.thetvdbId) filters.push({ thetvdbId: identity.thetvdbId })
  if (filters.length === 0) throw new Error("At least one provider identifier is required")
  return filters
}
