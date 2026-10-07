import assert from "node:assert/strict"
import test from "node:test"
import {
  createLoginChallenge,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpToken,
  hashLoginChallenge,
  hashRecoveryCode,
  normalizeRecoveryCode,
  validateTotpToken,
} from "./totp.js"

const encryptionSecret = "totp-test-encryption-secret-at-least-32-characters"

test("TOTP secrets use authenticated encryption", () => {
  const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", encryptionSecret)
  assert.notEqual(encrypted, "JBSWY3DPEHPK3PXP")
  assert.equal(decryptTotpSecret(encrypted, encryptionSecret), "JBSWY3DPEHPK3PXP")
  assert.throws(() => decryptTotpSecret(encrypted, `${encryptionSecret}-wrong`))
})

test("TOTP validation returns the accepted time step and rejects malformed tokens", () => {
  const secret = "JBSWY3DPEHPK3PXP"
  const timestamp = Date.UTC(2026, 9, 1, 12, 0, 0)
  const token = generateTotpToken(secret, timestamp)

  assert.equal(validateTotpToken(secret, token, timestamp), Math.floor(timestamp / 30_000))
  assert.equal(validateTotpToken(secret, token.slice(0, 5), timestamp), null)
  assert.equal(validateTotpToken(secret, "000000", timestamp), null)
})

test("recovery codes are display-friendly, unique, and hash normalized input", () => {
  const codes = generateRecoveryCodes()
  assert.equal(codes.length, 10)
  assert.equal(new Set(codes).size, 10)
  for (const code of codes) assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.equal(normalizeRecoveryCode(codes[0].toLowerCase()), codes[0].replaceAll("-", ""))
  assert.equal(
    hashRecoveryCode("user-1", codes[0], encryptionSecret),
    hashRecoveryCode("user-1", codes[0].toLowerCase().replaceAll("-", " "), encryptionSecret)
  )
})

test("login challenges store only a stable hash and expire after five minutes", () => {
  const now = Date.UTC(2026, 9, 1, 12, 0, 0)
  const challenge = createLoginChallenge(now)
  assert.notEqual(challenge.token, challenge.tokenHash)
  assert.equal(hashLoginChallenge(challenge.token), challenge.tokenHash)
  assert.equal(challenge.expiresAt.getTime(), now + 300_000)
})
