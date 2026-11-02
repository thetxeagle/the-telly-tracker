import assert from "node:assert/strict"
import test from "node:test"
import { createPasskeyCeremony, hashPasskeyCeremonyToken, passkeyChallengeTtlMs, passkeyRelyingParty } from "./passkeys.js"

test("creates short-lived, hashable single-use ceremony tokens", () => {
  const before = Date.now()
  const ceremony = createPasskeyCeremony()
  assert.match(ceremony.token, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(ceremony.tokenHash, hashPasskeyCeremonyToken(ceremony.token))
  assert.ok(ceremony.expiresAt.getTime() >= before + passkeyChallengeTtlMs)
})

test("derives the WebAuthn origin and relying-party ID from WEB_ORIGIN", () => {
  assert.deepEqual(passkeyRelyingParty("https://telly.example.test/app"), {
    origin: "https://telly.example.test",
    id: "telly.example.test",
    name: "Telly Tracker",
  })
})
