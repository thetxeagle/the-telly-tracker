import assert from "node:assert/strict"
import type { Server } from "node:http"
import test from "node:test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { generateTotpToken } from "../src/totp.js"

process.env.JWT_SECRET = "totp-integration-secret-at-least-32-characters"
process.env.SETTINGS_ENCRYPTION_KEY = "totp-integration-encryption-key-32-characters"
process.env.NODE_ENV = "test"
process.env.TMDB_ACCESS_TOKEN = ""

const { app } = await import("../src/server.js")
const prisma = new PrismaClient()
const suffix = `${Date.now()}-${process.pid}`
const email = `totp-${suffix}@telly.test`
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
  await prisma.$disconnect()
})

test("users can enroll TOTP and complete a login with a one-use recovery code", async () => {
  await prisma.user.create({
    data: { name: "TOTP Integration", email, passwordHash: await bcrypt.hash(password, 4) },
  })

  await withServer(async (origin) => {
    const firstLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    assert.equal(firstLogin.status, 200)
    const firstLoginBody = await firstLogin.json() as { requiresTwoFactor: boolean }
    assert.equal(firstLoginBody.requiresTwoFactor, false)
    const firstCookie = firstLogin.headers.get("set-cookie")?.split(";", 1)[0]
    assert.ok(firstCookie)

    const enrollment = await fetch(`${origin}/api/account/totp/enrollment`, {
      method: "POST",
      headers: { Cookie: firstCookie },
    })
    assert.equal(enrollment.status, 200)
    const enrollmentBody = await enrollment.json() as { secret: string; qrCodeDataUrl: string }
    assert.match(enrollmentBody.qrCodeDataUrl, /^data:image\/png;base64,/)

    const confirmation = await fetch(`${origin}/api/account/totp/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: firstCookie },
      body: JSON.stringify({ code: generateTotpToken(enrollmentBody.secret) }),
    })
    assert.equal(confirmation.status, 200)
    const confirmationBody = await confirmation.json() as { recoveryCodes: string[] }
    assert.equal(confirmationBody.recoveryCodes.length, 10)

    await fetch(`${origin}/api/auth/logout`, { method: "POST", headers: { Cookie: firstCookie } })
    const challengedLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    assert.equal(challengedLogin.status, 200)
    assert.equal(challengedLogin.headers.get("set-cookie"), null)
    const challengedBody = await challengedLogin.json() as { requiresTwoFactor: boolean; challengeToken: string }
    assert.equal(challengedBody.requiresTwoFactor, true)

    const verified = await fetch(`${origin}/api/auth/login/totp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken: challengedBody.challengeToken, code: confirmationBody.recoveryCodes[0] }),
    })
    assert.equal(verified.status, 200)
    const verifiedCookie = verified.headers.get("set-cookie")?.split(";", 1)[0]
    assert.ok(verifiedCookie)

    const status = await fetch(`${origin}/api/account/security`, { headers: { Cookie: verifiedCookie } })
    assert.equal(status.status, 200)
    const statusBody = await status.json() as { totpEnabled: boolean; recoveryCodesRemaining: number }
    assert.equal(statusBody.totpEnabled, true)
    assert.equal(statusBody.recoveryCodesRemaining, 9)

    await fetch(`${origin}/api/auth/logout`, { method: "POST", headers: { Cookie: verifiedCookie } })
    const secondChallenge = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const secondChallengeBody = await secondChallenge.json() as { challengeToken: string }
    const reused = await fetch(`${origin}/api/auth/login/totp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken: secondChallengeBody.challengeToken, code: confirmationBody.recoveryCodes[0] }),
    })
    assert.equal(reused.status, 401)
  })
})
