import { createHash, randomBytes } from "node:crypto"

export const passkeyChallengeTtlMs = 5 * 60 * 1000

export function createPasskeyCeremony() {
  const token = randomBytes(32).toString("base64url")
  return {
    token,
    tokenHash: hashPasskeyCeremonyToken(token),
    expiresAt: new Date(Date.now() + passkeyChallengeTtlMs),
  }
}

export function hashPasskeyCeremonyToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function passkeyRelyingParty(webOrigin: string) {
  const origin = new URL(webOrigin).origin
  return { origin, id: new URL(origin).hostname, name: "Telly Tracker" }
}
