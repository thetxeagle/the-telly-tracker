import assert from "node:assert/strict"
import test from "node:test"
import { PrismaClient } from "@prisma/client"
import { PrismaCatalogRepository } from "../src/catalog/catalog-repository.js"

const prisma = new PrismaClient()
const repository = new PrismaCatalogRepository(prisma)
const suffix = `${Date.now()}-${process.pid}`
const sourceId = `integration:${suffix}`
const email = `integration-${suffix}@telly.test`

test.after(async () => {
  await prisma.user.deleteMany({ where: { email } })
  await prisma.media.deleteMany({ where: { sourceId } })
  await prisma.$disconnect()
})

test("catalog refresh preserves PostgreSQL episode progress relations", async () => {
  const user = await prisma.user.create({
    data: { name: "Integration User", email, passwordHash: "not-used-in-this-test" },
  })
  const media = await prisma.media.create({
    data: {
      sourceId,
      tmdbId: 2_000_000_001,
      title: "Before Refresh",
      type: "SHOW",
      synopsis: "Before refresh.",
      releaseDate: new Date("2025-01-01T00:00:00Z"),
      totalSeasons: 1,
      totalEpisodes: 1,
      poster: "",
      backdrop: "",
    },
  })
  const episode = await prisma.episode.create({
    data: {
      mediaId: media.id,
      season: 1,
      number: 1,
      title: "Before Refresh",
      airDate: new Date("2025-01-01T00:00:00Z"),
      runtime: 40,
    },
  })
  const progress = await prisma.episodeProgress.create({
    data: { userId: user.id, episodeId: episode.id, watched: true },
  })

  const result = await repository.save({
    identity: { type: "SHOW", tmdbId: 2_000_000_001, tvmazeId: 2_000_000_002 },
    title: "After Refresh",
    synopsis: "After refresh.",
    releaseDate: new Date("2025-01-01T00:00:00Z"),
    endDate: null,
    productionStatus: "Running",
    totalSeasons: 1,
    totalEpisodes: 1,
    poster: "https://image.example.test/poster.jpg",
    backdrop: "https://image.example.test/refreshed.jpg",
    episodes: [
      {
        tvmazeId: 2_000_000_003,
        season: 1,
        number: 1,
        title: "After Refresh",
        airDate: new Date("2025-01-02T00:00:00Z"),
        runtime: 44,
        image: "https://static.tvmaze.com/episode.jpg",
      },
    ],
  })

  const refreshedEpisode = await prisma.episode.findUniqueOrThrow({ where: { id: episode.id } })
  const preservedProgress = await prisma.episodeProgress.findUniqueOrThrow({
    where: { id: progress.id },
  })
  assert.equal(result.id, media.id)
  assert.equal(result.created, false)
  assert.equal(refreshedEpisode.title, "After Refresh")
  assert.equal(refreshedEpisode.tvmazeId, 2_000_000_003)
  assert.equal(refreshedEpisode.image, "https://static.tvmaze.com/episode.jpg")
  assert.equal(preservedProgress.episodeId, episode.id)
  assert.equal(preservedProgress.watched, true)
})
