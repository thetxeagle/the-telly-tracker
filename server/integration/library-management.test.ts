import assert from "node:assert/strict"
import type { Server } from "node:http"
import test from "node:test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

process.env.JWT_SECRET = "library-integration-secret-at-least-32-characters"
process.env.NODE_ENV = "test"
process.env.TMDB_ACCESS_TOKEN = ""

const { app } = await import("../src/server.js")
const prisma = new PrismaClient()
const suffix = `${Date.now()}-${process.pid}`
const email = `library-${suffix}@telly.test`
const sourceId = `library-integration:${suffix}`
const password = "integration-password"

async function withServer(run: (origin: string) => Promise<void>) {
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening))
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Test server did not bind to TCP")
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test.after(async () => {
  await prisma.user.deleteMany({ where: { email } })
  await prisma.media.deleteMany({ where: { sourceId } })
  await prisma.$disconnect()
})

test("users can bulk-update released episodes and remove a title without losing progress", async () => {
  const user = await prisma.user.create({
    data: { name: "Library User", email, passwordHash: await bcrypt.hash(password, 4) },
  })
  const media = await prisma.media.create({
    data: {
      sourceId,
      imdbId: "tt0903747",
      title: "Library Integration Show",
      type: "SHOW",
      synopsis: "Route integration coverage.",
      releaseDate: new Date("2020-01-01T00:00:00Z"),
      totalSeasons: 1,
      totalEpisodes: 4,
      poster: "",
      backdrop: "",
      library: { create: { userId: user.id, status: "PLANNED" } },
      episodes: {
        create: [
          { season: 1, number: 1, title: "Released One", airDate: new Date("2020-01-01T00:00:00Z"), runtime: 42 },
          { season: 1, number: 2, title: "Released Two", airDate: new Date("2020-01-08T00:00:00Z"), runtime: 42 },
          { season: 1, number: 3, title: "Released Three", airDate: new Date("2020-01-15T00:00:00Z"), runtime: 42 },
          { season: 1, number: 4, title: "Upcoming", airDate: new Date("2099-01-01T00:00:00Z"), runtime: 42 },
        ],
      },
    },
    include: { episodes: { orderBy: { number: "asc" } } },
  })

  await withServer(async (origin) => {
    const login = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    assert.equal(login.status, 200)
    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0]
    assert.ok(cookie)

    const dashboard = await fetch(`${origin}/api/dashboard`, { headers: { Cookie: cookie } })
    assert.equal(dashboard.status, 200)
    const initialData = await dashboard.json() as { library: Array<{ imdbId: string | null }> }
    assert.equal(initialData.library[0]?.imdbId, "tt0903747")

    const bulkWatched = await fetch(`${origin}/api/episodes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ episodeIds: [media.episodes[0].id, media.episodes[1].id], watched: true }),
    })
    assert.equal(bulkWatched.status, 200)
    assert.deepEqual(await bulkWatched.json(), { updated: 2, watched: true })

    const updatedProgress = await prisma.episodeProgress.findMany({
      where: { userId: user.id },
      orderBy: { episodeId: "asc" },
    })
    assert.equal(updatedProgress.length, 2)
    assert.ok(updatedProgress.every((progress) => progress.watched))

    const rejectedBatch = await fetch(`${origin}/api/episodes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ episodeIds: [media.episodes[2].id, media.episodes[3].id], watched: true }),
    })
    assert.equal(rejectedBatch.status, 404)
    assert.equal(await prisma.episodeProgress.count({ where: { userId: user.id, episodeId: media.episodes[2].id } }), 0)

    const bulkUnwatched = await fetch(`${origin}/api/episodes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ episodeIds: [media.episodes[0].id, media.episodes[1].id], watched: false }),
    })
    assert.equal(bulkUnwatched.status, 200)
    assert.equal(await prisma.episodeProgress.count({ where: { userId: user.id, watched: false } }), 2)

    const removed = await fetch(`${origin}/api/library/${media.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    })
    assert.equal(removed.status, 204)
    assert.equal(await prisma.libraryEntry.count({ where: { userId: user.id, mediaId: media.id } }), 0)
    assert.equal(await prisma.episodeProgress.count({ where: { userId: user.id } }), 2)

    const removedAgain = await fetch(`${origin}/api/library/${media.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    })
    assert.equal(removedAgain.status, 404)
  })
})
