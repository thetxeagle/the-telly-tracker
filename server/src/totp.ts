import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto"
import * as OTPAuth from "otpauth"
import QRCode from "qrcode"

const TOTP_ISSUER = "Telly Tracker"
const TOTP_PERIOD_SECONDS = 30
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function encryptionKey(secret: string) {
  return createHash("sha256").update(`telly-totp:${secret}`).digest()
}

export function encryptTotpSecret(value: string, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`
}

export function decryptTotpSecret(value: string, secret: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(":")
  if (version !== "v1" || !ivValue || !tagValue || encryptedValue === undefined) {
    throw new Error("TOTP secret cannot be decrypted")
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(ivValue, "base64url"))
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8")
}

function totp(secret: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secret),
  })
}

export async function createTotpEnrollment(label: string) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32
  const uri = totp(secret, label).toString()
  const qrCodeDataUrl = await QRCode.toDataURL(uri, {
    width: 256,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#08111d", light: "#ffffff" },
  })
  return { secret, uri, qrCodeDataUrl }
}

export function validateTotpToken(secret: string, token: string, timestamp = Date.now()) {
  if (!/^\d{6}$/.test(token)) return null
  const authenticator = totp(secret, "account")
  const delta = authenticator.validate({ token, timestamp, window: 1 })
  return delta === null ? null : authenticator.counter({ timestamp }) + delta
}

export function generateTotpToken(secret: string, timestamp = Date.now()) {
  return totp(secret, "account").generate({ timestamp })
}

export function normalizeRecoveryCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z2-9]/g, "")
}

export function hashRecoveryCode(userId: string, code: string, secret: string) {
  return createHmac("sha256", encryptionKey(secret))
    .update(`${userId}:${normalizeRecoveryCode(code)}`)
    .digest("hex")
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(12)
    const raw = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join("")
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
  })
}

export function createLoginChallenge(now = Date.now()) {
  const token = randomBytes(32).toString("base64url")
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(now + 5 * 60 * 1_000),
  }
}

export function hashLoginChallenge(token: string) {
  return createHash("sha256").update(token).digest("hex")
}
