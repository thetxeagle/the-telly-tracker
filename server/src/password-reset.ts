import { createHash, randomBytes } from "node:crypto"

export const passwordResetLifetimeMs = 60 * 60 * 1_000
export const passwordResetCooldownMs = 5 * 60 * 1_000
export const passwordResetRequestMessage = "If an account matches and email delivery is configured, a reset link is on the way."

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function createPasswordResetToken(now = new Date()) {
  const token = randomBytes(32).toString("hex")
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(now.getTime() + passwordResetLifetimeMs),
  }
}
