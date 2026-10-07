import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import nodemailer from "nodemailer"
import type { EnvironmentSmtpSettings } from "./config.js"

export type StoredSmtpSettings = {
  smtpEnabled: boolean
  smtpHost: string | null
  smtpPort: number | null
  smtpSecure: boolean
  smtpUsername: string | null
  smtpPasswordEncrypted: string | null
  smtpFromName: string | null
  smtpFromEmail: string | null
}

export type PublicSmtpSettings = {
  source: "database" | "environment"
  enabled: boolean
  host: string
  port: number
  secure: boolean
  username: string
  hasPassword: boolean
  fromName: string
  fromEmail: string
}

type EffectiveSmtpSettings = {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  fromName: string
  fromEmail: string
}

function encryptionKey(secret: string) {
  return createHash("sha256").update(secret).digest()
}

export function encryptSmtpPassword(password: string, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()])
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`
}

export function decryptSmtpPassword(value: string, secret: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(":")
  if (version !== "v1" || !ivValue || !tagValue || encryptedValue === undefined) throw new Error("SMTP password cannot be decrypted")
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(ivValue, "base64url"))
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8")
}

export function publicSmtpSettings(settings: StoredSmtpSettings, environment?: EnvironmentSmtpSettings): PublicSmtpSettings {
  if (environment) {
    return {
      source: "environment",
      enabled: environment.enabled,
      host: environment.host,
      port: environment.port,
      secure: environment.secure,
      username: environment.username,
      hasPassword: Boolean(environment.password),
      fromName: environment.fromName,
      fromEmail: environment.fromEmail,
    }
  }
  return {
    source: "database",
    enabled: settings.smtpEnabled,
    host: settings.smtpHost ?? "",
    port: settings.smtpPort ?? 587,
    secure: settings.smtpSecure,
    username: settings.smtpUsername ?? "",
    hasPassword: Boolean(settings.smtpPasswordEncrypted),
    fromName: settings.smtpFromName ?? "Telly Tracker",
    fromEmail: settings.smtpFromEmail ?? "",
  }
}

function effectiveSmtpSettings(settings: StoredSmtpSettings, secret: string, environment?: EnvironmentSmtpSettings): EffectiveSmtpSettings {
  if (environment) return environment
  return {
    enabled: settings.smtpEnabled,
    host: settings.smtpHost ?? "",
    port: settings.smtpPort ?? 587,
    secure: settings.smtpSecure,
    username: settings.smtpUsername ?? "",
    password: settings.smtpPasswordEncrypted ? decryptSmtpPassword(settings.smtpPasswordEncrypted, secret) : "",
    fromName: settings.smtpFromName ?? "Telly Tracker",
    fromEmail: settings.smtpFromEmail ?? "",
  }
}

function smtpTransport(settings: StoredSmtpSettings, secret: string, environment?: EnvironmentSmtpSettings) {
  const effective = effectiveSmtpSettings(settings, secret, environment)
  if (!effective.enabled || !effective.host || !effective.port || !effective.fromEmail) {
    throw new Error("SMTP is not fully configured")
  }
  return nodemailer.createTransport({
    host: effective.host,
    port: effective.port,
    secure: effective.secure,
    auth: effective.username ? { user: effective.username, pass: effective.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
}

export async function verifySmtp(settings: StoredSmtpSettings, secret: string, environment?: EnvironmentSmtpSettings) {
  await smtpTransport(settings, secret, environment).verify()
}

export async function sendSmtpMail(
  settings: StoredSmtpSettings,
  secret: string,
  message: { to: string; subject: string; text: string; html: string },
  environment?: EnvironmentSmtpSettings
) {
  const effective = effectiveSmtpSettings(settings, secret, environment)
  const transport = smtpTransport(settings, secret, environment)
  await transport.sendMail({
    from: { name: effective.fromName, address: effective.fromEmail },
    ...message,
  })
}
