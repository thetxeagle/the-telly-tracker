import assert from "node:assert/strict"
import test from "node:test"
import type { PrismaClient } from "@prisma/client"
import { PrismaCatalogRepository, type CatalogRecord } from "./catalog-repository.js"

test("refreshes existing media and episode rows without deleting progress-bearing records", async () => {
  const mediaUpdates: unknown[] = []
  const episodeUpdates: Array<{ where: unknown; data: unknown }> = []
  let mediaCreates = 0
  let episodeCreates = 0
  const transaction = {
    media: {
      async findMany() {
        return [
          {
            id: "media-1",
            type: "SHOW",
            tmdbId: 10,
            tvmazeId: 20,
            imdbId: "tt0000010",
            thetvdbId: 30,
          },
        ]
      },
      async update(input: unknown) {
        mediaUpdates.push(input)
        return { id: "media-1" }
      },
      async create() {
        mediaCreates += 1
        return { id: "unexpected" }
      },
    },
    episode: {
      async findFirst() {
        return { id: "episode-with-user-progress", mediaId: "media-1" }
      },
      async update(input: { where: unknown; data: unknown }) {
        episodeUpdates.push(input)
      },
      async create() {
        episodeCreates += 1
      },
    },
  }
  const prisma = {
    async $transaction<T>(operation: (client: typeof transaction) => Promise<T>) {
      return operation(transaction)
    },
  } as unknown as PrismaClient
  const repository = new PrismaCatalogRepository(prisma)
  const record: CatalogRecord = {
    identity: {
      type: "SHOW",
      tmdbId: 10,
      tvmazeId: 20,
      imdbId: "tt0000010",
      thetvdbId: 30,
    },
    title: "Updated title",
    synopsis: "Updated synopsis",
    releaseDate: new Date("2025-01-02T00:00:00Z"),
    endDate: null,
    productionStatus: "Running",
    totalSeasons: 1,
    totalEpisodes: 1,
    poster: "https://image.example.test/poster.jpg",
    backdrop: "https://image.example.test/show.jpg",
    episodes: [
      {
        tvmazeId: 2001,
        season: 1,
        number: 1,
        title: "Updated episode",
        airDate: new Date("2025-01-03T01:00:00Z"),
        runtime: 44,
        image: "https://static.tvmaze.com/episode.jpg",
      },
    ],
  }

  const result = await repository.save(record)

  assert.deepEqual(result, { id: "media-1", created: false, episodeCount: 1 })
  assert.equal(mediaCreates, 0)
  assert.equal(episodeCreates, 0)
  assert.equal(mediaUpdates.length, 1)
  assert.deepEqual(episodeUpdates[0]?.where, { id: "episode-with-user-progress" })
})

test("rejects a TVmaze episode already attached to another title", async () => {
  const transaction = {
    media: {
      async findMany() {
        return []
      },
      async create() {
        return { id: "media-1" }
      },
    },
    episode: {
      async findFirst() {
        return { id: "episode-1", mediaId: "other-media" }
      },
    },
  }
  const prisma = {
    async $transaction<T>(operation: (client: typeof transaction) => Promise<T>) {
      return operation(transaction)
    },
  } as unknown as PrismaClient
  const repository = new PrismaCatalogRepository(prisma)

  await assert.rejects(
    repository.save({
      identity: { type: "SHOW", tmdbId: 10, tvmazeId: 20 },
      title: "Show",
      synopsis: "Synopsis",
      releaseDate: new Date("2025-01-02T00:00:00Z"),
      endDate: null,
      productionStatus: "Ended",
      totalSeasons: 1,
      totalEpisodes: 1,
      poster: "",
      backdrop: "",
      episodes: [
        {
          tvmazeId: 2001,
          season: 1,
          number: 1,
          title: "Episode",
          airDate: new Date("2025-01-03T00:00:00Z"),
          runtime: 44,
          image: "",
        },
      ],
    }),
    /belongs to another media record/
  )
})
