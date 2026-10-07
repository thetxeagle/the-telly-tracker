import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import type { Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import jwt from "jsonwebtoken"

const jwtSecret = "provider-route-test-secret-at-least-32-characters"
process.env.JWT_SECRET = jwtSecret
process.env.NODE_ENV = "test"
process.env.TMDB_ACCESS_TOKEN = ""
process.env.WEB_ORIGIN = "http://localhost:8080"
const webDistDir = mkdtempSync(path.join(tmpdir(), "telly-web-"))
mkdirSync(path.join(webDistDir, "assets"))
writeFileSync(path.join(webDistDir, "index.html"), "<!doctype html><title>Telly test shell</title>")
writeFileSync(path.join(webDistDir, "assets", "app.js"), "console.log('telly')")
process.env.WEB_DIST_DIR = webDistDir

const { app } = await import("./server.js")

test.after(() => rmSync(webDistDir, { recursive: true, force: true }))

async function withServer(run: (origin: string) => Promise<void>) {
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening))
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Test server did not bind to TCP")
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test("provider routes require authentication", async () => {
  await withServer(async (origin) => {
    const search = await fetch(`${origin}/api/providers/search?q=halo`)
    const imported = await fetch(`${origin}/api/providers/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "SHOW", tmdbId: 1 }),
    })
    const refresh = await fetch(`${origin}/api/media/media-1/refresh`, { method: "POST" })

    assert.equal(search.status, 401)
    assert.equal(imported.status, 401)
    assert.equal(refresh.status, 401)
  })
})

test("library management routes require authentication", async () => {
  await withServer(async (origin) => {
    const removed = await fetch(`${origin}/api/library/media-1`, { method: "DELETE" })
    const duplicates = await fetch(`${origin}/api/library/duplicates`, { method: "DELETE" })
    const unwatchedReleases = await fetch(`${origin}/api/releases/unwatched`)
    const bulkProgress = await fetch(`${origin}/api/episodes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: ["episode-1"], watched: true }),
    })

    assert.equal(removed.status, 401)
    assert.equal(duplicates.status, 401)
    assert.equal(unwatchedReleases.status, 401)
    assert.equal(bulkProgress.status, 401)
  })
})

test("administration routes require authentication", async () => {
  await withServer(async (origin) => {
    const overview = await fetch(`${origin}/api/admin/overview`)
    const settings = await fetch(`${origin}/api/admin/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "CLOSED" }),
    })
    const invitation = await fetch(`${origin}/api/admin/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "invitee@example.com", expiresInDays: 7 }),
    })
    const revoke = await fetch(`${origin}/api/admin/invitations/invitation-1`, { method: "DELETE" })
    const setup = await fetch(`${origin}/api/admin/setup`, { method: "POST" })
    const smtp = await fetch(`${origin}/api/admin/smtp`, { method: "PUT" })
    const smtpTest = await fetch(`${origin}/api/admin/smtp/test`, { method: "POST" })
    const resetTotp = await fetch(`${origin}/api/admin/users/user-1/totp`, { method: "DELETE" })

    assert.equal(overview.status, 401)
    assert.equal(settings.status, 401)
    assert.equal(invitation.status, 401)
    assert.equal(revoke.status, 401)
    assert.equal(setup.status, 401)
    assert.equal(smtp.status, 401)
    assert.equal(smtpTest.status, 401)
    assert.equal(resetTotp.status, 401)
  })
})

test("account security routes require authentication", async () => {
  await withServer(async (origin) => {
    const status = await fetch(`${origin}/api/account/security`)
    const createCalendar = await fetch(`${origin}/api/account/calendar`, { method: "POST" })
    const disableCalendar = await fetch(`${origin}/api/account/calendar`, { method: "DELETE" })
    const enrollment = await fetch(`${origin}/api/account/totp/enrollment`, { method: "POST" })
    const confirm = await fetch(`${origin}/api/account/totp/confirm`, { method: "POST" })
    const recovery = await fetch(`${origin}/api/account/totp/recovery-codes`, { method: "POST" })
    const disable = await fetch(`${origin}/api/account/totp`, { method: "DELETE" })

    assert.equal(status.status, 401)
    assert.equal(createCalendar.status, 401)
    assert.equal(disableCalendar.status, 401)
    assert.equal(enrollment.status, 401)
    assert.equal(confirm.status, 401)
    assert.equal(recovery.status, 401)
    assert.equal(disable.status, 401)
  })
})

test("calendar feeds reject invalid bearer tokens without revealing account state", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/calendar/not-a-valid-calendar-token.ics`)

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: "Calendar feed not found" })
  })
})

test("serves built web assets and the SPA fallback without masking unknown API routes", async () => {
  await withServer(async (origin) => {
    const asset = await fetch(`${origin}/assets/app.js`)
    const spaRoute = await fetch(`${origin}/library`)
    const missingApi = await fetch(`${origin}/api/not-a-route`)

    assert.equal(asset.status, 200)
    assert.equal(await asset.text(), "console.log('telly')")
    assert.equal(spaRoute.status, 200)
    assert.match(await spaRoute.text(), /Telly test shell/)
    const contentSecurityPolicy = spaRoute.headers.get("content-security-policy") ?? ""
    assert.doesNotMatch(contentSecurityPolicy, /upgrade-insecure-requests/)
    assert.match(contentSecurityPolicy, /img-src 'self' data: https:\/\/image\.tmdb\.org https:\/\/www\.themoviedb\.org https:\/\/static\.tvmaze\.com/)
    assert.equal(spaRoute.headers.get("strict-transport-security"), null)
    assert.equal(missingApi.status, 404)
  })
})

test("authenticated provider routes report missing server-side TMDB configuration", async () => {
  const session = jwt.sign({ sub: "user-1" }, jwtSecret, { expiresIn: "1m" })
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/providers/search?q=halo`, {
      headers: { Cookie: `telly_session=${session}` },
    })

    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: "TMDB is not configured" })
  })
})
