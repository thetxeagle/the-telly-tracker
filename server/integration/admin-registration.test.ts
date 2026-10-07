import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import type { Server } from "node:http"
import test from "node:test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

process.env.JWT_SECRET = "admin-integration-secret-at-least-32-characters"
process.env.NODE_ENV = "test"
process.env.TMDB_ACCESS_TOKEN = ""

const { app } = await import("../src/server.js")
const prisma = new PrismaClient()
const suffix = `${Date.now()}-${process.pid}`
const adminEmail = `admin-${suffix}@telly.test`
const inviteeEmail = `invitee-${suffix}@telly.test`
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
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, inviteeEmail] } } })
  await prisma.appSettings.upsert({
    where: { id: "global" },
    update: { registrationMode: "OPEN" },
    create: { id: "global", registrationMode: "OPEN" },
  })
  await prisma.$disconnect()
})

test("administrators can require and issue a single-use email invitation", async () => {
  await prisma.user.create({
    data: { name: "Integration Admin", email: adminEmail, passwordHash: await bcrypt.hash(password, 4), isAdmin: true },
  })

  await withServer(async (origin) => {
    const login = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password }),
    })
    assert.equal(login.status, 200)
    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0]
    assert.ok(cookie)

    const settings = await fetch(`${origin}/api/admin/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ mode: "INVITE_ONLY" }),
    })
    assert.equal(settings.status, 200)

    const blocked = await fetch(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Invitee", email: inviteeEmail, password }),
    })
    assert.equal(blocked.status, 403)

    const issued = await fetch(`${origin}/api/admin/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ email: inviteeEmail, expiresInDays: 7 }),
    })
    assert.equal(issued.status, 201)
    const invitation = await issued.json() as { token: string }
    assert.match(invitation.token, /^[a-f0-9]{64}$/)

    const registered = await fetch(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Invitee", email: inviteeEmail, password, inviteToken: invitation.token }),
    })
    assert.equal(registered.status, 201)

    const storedInvitation = await prisma.invitation.findUniqueOrThrow({
      where: { tokenHash: createHash("sha256").update(invitation.token).digest("hex") },
    })
    assert.ok(storedInvitation.usedAt)
    assert.notEqual(storedInvitation.tokenHash, invitation.token)

    const reused = await fetch(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Another Invitee", email: `other-${inviteeEmail}`, password, inviteToken: invitation.token }),
    })
    assert.equal(reused.status, 403)
  })
})
