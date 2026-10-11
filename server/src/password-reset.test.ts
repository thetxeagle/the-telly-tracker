import assert from "node:assert/strict"
import test from "node:test"
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  passwordResetLifetimeMs,
  passwordResetRequestMessage,
} from "./password-reset.js"

test("creates one-hour password reset tokens and stores only their hashes", () => {
  const now = new Date("2026-10-11T18:45:00.000Z")
  const reset = createPasswordResetToken(now)

  assert.match(reset.token, /^[a-f0-9]{64}$/)
  assert.match(reset.tokenHash, /^[a-f0-9]{64}$/)
  assert.notEqual(reset.tokenHash, reset.token)
  assert.equal(reset.tokenHash, hashPasswordResetToken(reset.token))
  assert.equal(reset.expiresAt.getTime(), now.getTime() + passwordResetLifetimeMs)
})

test("uses one generic reset-request response to avoid account discovery", () => {
  assert.equal(
    passwordResetRequestMessage,
    "If an account matches and email delivery is configured, a reset link is on the way."
  )
})
