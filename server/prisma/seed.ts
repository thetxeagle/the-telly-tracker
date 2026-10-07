import { LibraryStatus, MediaType, PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

// Fictional evaluation data only. Production container startup does not run this seed unless
// DEMO_SEED_DATA=true is explicitly configured.

const mediaSeeds = [
  {
    sourceId: "seed-northern-lights",
    title: "Northern Lights",
    type: MediaType.SHOW,
    synopsis: "A missing signal pulls a remote town into a mystery bigger than the sky.",
    releaseDate: new Date("2026-02-06T00:00:00.000Z"),
    totalSeasons: 1,
    totalEpisodes: 8,
    poster: "aurora",
    backdrop: "aurora",
  },
  {
    sourceId: "seed-second-horizon",
    title: "The Second Horizon",
    type: MediaType.SHOW,
    synopsis: "An archivist follows a map that redraws itself every night.",
    releaseDate: new Date("2025-11-14T00:00:00.000Z"),
    totalSeasons: 2,
    totalEpisodes: 16,
    poster: "horizon",
    backdrop: "horizon",
  },
  {
    sourceId: "seed-echo-ridge",
    title: "Echo Ridge",
    type: MediaType.SHOW,
    synopsis: "A rescue crew discovers the mountain remembers every voice.",
    releaseDate: new Date("2026-08-21T00:00:00.000Z"),
    totalSeasons: 1,
    totalEpisodes: 6,
    poster: "ridge",
    backdrop: "ridge",
  },
  {
    sourceId: "seed-deep-between",
    title: "The Deep Between",
    type: MediaType.MOVIE,
    synopsis: "Two oceanographers find a current that should not exist.",
    releaseDate: new Date("2026-10-09T00:00:00.000Z"),
    totalEpisodes: 1,
    poster: "deep",
    backdrop: "deep",
  },
  {
    sourceId: "seed-harbor-within",
    title: "The Harbor Within",
    type: MediaType.SHOW,
    synopsis: "Every tide returns something the harbor tried to forget.",
    releaseDate: new Date("2026-09-11T00:00:00.000Z"),
    totalSeasons: 1,
    totalEpisodes: 10,
    poster: "harbor",
    backdrop: "harbor",
  },
] as const

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 12)
  const user = await prisma.user.upsert({
    where: { email: "demo@telly.local" },
    update: { name: "Alex", isAdmin: true },
    create: {
      name: "Alex",
      email: "demo@telly.local",
      passwordHash,
      isAdmin: true,
    },
  })
  await prisma.appSettings.upsert({
    where: { id: "global" },
    update: { setupComplete: true },
    create: { id: "global", setupComplete: true },
  })

  const media = new Map<string, { id: string }>()
  for (const seed of mediaSeeds) {
    const item = await prisma.media.upsert({
      where: { sourceId: seed.sourceId },
      update: seed,
      create: seed,
      select: { id: true },
    })
    media.set(seed.sourceId, item)
  }

  const episodeDates = [
    "2026-09-04",
    "2026-09-11",
    "2026-09-18",
    "2026-09-25",
    "2026-10-02",
    "2026-10-09",
    "2026-10-16",
    "2026-10-23",
  ]

  for (const sourceId of ["seed-northern-lights", "seed-second-horizon", "seed-echo-ridge", "seed-harbor-within"]) {
    const item = media.get(sourceId)
    if (!item) continue
    for (let index = 0; index < 8; index += 1) {
      await prisma.episode.upsert({
        where: {
          mediaId_season_number: { mediaId: item.id, season: 1, number: index + 1 },
        },
        update: {},
        create: {
          mediaId: item.id,
          season: 1,
          number: index + 1,
          title: `Chapter ${index + 1}`,
          airDate: new Date(`${episodeDates[index]}T00:00:00.000Z`),
          runtime: 44,
        },
      })
    }
  }

  const librarySeeds = [
    ["seed-northern-lights", LibraryStatus.IN_PROGRESS, true],
    ["seed-second-horizon", LibraryStatus.IN_PROGRESS, false],
    ["seed-echo-ridge", LibraryStatus.IN_PROGRESS, true],
    ["seed-deep-between", LibraryStatus.PLANNED, true],
    ["seed-harbor-within", LibraryStatus.PLANNED, false],
  ] as const

  for (const [sourceId, status, favorite] of librarySeeds) {
    const item = media.get(sourceId)
    if (!item) continue
    await prisma.libraryEntry.upsert({
      where: { userId_mediaId: { userId: user.id, mediaId: item.id } },
      update: { status, favorite },
      create: { userId: user.id, mediaId: item.id, status, favorite },
    })
  }

  const watchedCounts = new Map([
    ["seed-northern-lights", 3],
    ["seed-second-horizon", 5],
    ["seed-echo-ridge", 1],
  ])
  for (const [sourceId, count] of watchedCounts) {
    const item = media.get(sourceId)
    if (!item) continue
    const episodes = await prisma.episode.findMany({
      where: { mediaId: item.id },
      orderBy: [{ season: "asc" }, { number: "asc" }],
      take: count,
    })
    for (const episode of episodes) {
      await prisma.episodeProgress.upsert({
        where: { userId_episodeId: { userId: user.id, episodeId: episode.id } },
        update: { watched: true },
        create: { userId: user.id, episodeId: episode.id, watched: true },
      })
    }
  }
}

main()
  .finally(async () => prisma.$disconnect())
