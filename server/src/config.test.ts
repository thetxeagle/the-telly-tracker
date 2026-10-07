import assert from "node:assert/strict"
import test from "node:test"
import { z } from "zod"
import { parseConfig } from "./config.js"

const baseEnvironment = {
  JWT_SECRET: "a-secure-test-secret-with-32-characters",
}

test("parseConfig applies provider defaults and treats a blank TMDB token as absent", () => {
  const config = parseConfig({ ...baseEnvironment, TMDB_ACCESS_TOKEN: "" })

  assert.equal(config.tmdbAccessToken, undefined)
  assert.equal(config.tmdbApiBaseUrl, "https://api.themoviedb.org/3")
  assert.equal(config.tvmazeApiBaseUrl, "https://api.tvmaze.com")
  assert.equal(config.sessionCookieSecure, false)
  assert.equal(config.calendarPublicUrl, "http://localhost:5173")
  assert.equal(config.settingsEncryptionKey, baseEnvironment.JWT_SECRET)
  assert.deepEqual(config.adminEmails, [])
  assert.equal(config.smtpEnvironment, undefined)
  assert.equal(config.providerTimeoutMs, 8_000)
  assert.equal(config.providerMaxRetries, 2)
  assert.equal(config.providerSearchCacheTtlMs, 300_000)
  assert.equal(config.providerRefreshIntervalMs, 21_600_000)
  assert.equal(config.providerRefreshBatchSize, 25)
})

test("parseConfig accepts deployment-managed SMTP settings", () => {
  const config = parseConfig({
    ...baseEnvironment,
    SMTP_ENABLED: "true",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USERNAME: "mailer",
    SMTP_PASSWORD: "secret",
    SMTP_FROM_NAME: "Telly Tracker",
    SMTP_FROM_EMAIL: "telly@example.com",
  })

  assert.deepEqual(config.smtpEnvironment, {
    enabled: true,
    host: "smtp.example.com",
    port: 465,
    secure: true,
    username: "mailer",
    password: "secret",
    fromName: "Telly Tracker",
    fromEmail: "telly@example.com",
  })
})

test("parseConfig normalizes bootstrap administrator emails", () => {
  const config = parseConfig({ ...baseEnvironment, ADMIN_EMAILS: " Eagle@Example.com, admin@example.com ,," })

  assert.deepEqual(config.adminEmails, ["eagle@example.com", "admin@example.com"])
})

test("parseConfig accepts a dedicated settings encryption key", () => {
  const settingsEncryptionKey = "a-separate-settings-encryption-key-123"
  const config = parseConfig({ ...baseEnvironment, SETTINGS_ENCRYPTION_KEY: settingsEncryptionKey })

  assert.equal(config.settingsEncryptionKey, settingsEncryptionKey)
})

test("parseConfig coerces numeric settings and removes trailing provider slashes", () => {
  const config = parseConfig({
    ...baseEnvironment,
    PORT: "4100",
    PROVIDER_TIMEOUT_MS: "5000",
    PROVIDER_MAX_RETRIES: "3",
    PROVIDER_SEARCH_CACHE_TTL_MS: "60000",
    PROVIDER_REFRESH_INTERVAL_MS: "0",
    PROVIDER_REFRESH_BATCH_SIZE: "10",
    TMDB_API_BASE_URL: "https://tmdb.example.test/3/",
  })

  assert.equal(config.port, 4100)
  assert.equal(config.providerTimeoutMs, 5_000)
  assert.equal(config.providerMaxRetries, 3)
  assert.equal(config.providerSearchCacheTtlMs, 60_000)
  assert.equal(config.providerRefreshIntervalMs, 0)
  assert.equal(config.providerRefreshBatchSize, 10)
  assert.equal(config.tmdbApiBaseUrl, "https://tmdb.example.test/3")
})

test("parseConfig derives session-cookie security from the browser origin", () => {
  const httpConfig = parseConfig({
    ...baseEnvironment,
    NODE_ENV: "production",
    WEB_ORIGIN: "http://telly.example.test:7234",
  })
  const httpsConfig = parseConfig({
    ...baseEnvironment,
    NODE_ENV: "production",
    WEB_ORIGIN: "https://telly.example.test",
  })

  assert.equal(httpConfig.sessionCookieSecure, false)
  assert.equal(httpsConfig.sessionCookieSecure, true)
})

test("parseConfig accepts a separate public calendar URL and treats a blank override as absent", () => {
  const config = parseConfig({
    ...baseEnvironment,
    WEB_ORIGIN: "http://telly.example.test:7234",
    CALENDAR_PUBLIC_URL: "https://telly.example.com/",
  })

  assert.equal(config.webOrigin, "http://telly.example.test:7234")
  assert.equal(config.calendarPublicUrl, "https://telly.example.com")
  assert.equal(config.sessionCookieSecure, false)
  assert.equal(parseConfig({ ...baseEnvironment, CALENDAR_PUBLIC_URL: "" }).calendarPublicUrl, "http://localhost:5173")
})

test("parseConfig rejects weak secrets and invalid provider URLs", () => {
  assert.throws(() => parseConfig({ JWT_SECRET: "too-short" }), z.ZodError)
  assert.throws(
    () => parseConfig({ ...baseEnvironment, TVMAZE_API_BASE_URL: "not-a-url" }),
    z.ZodError
  )
  assert.throws(() => parseConfig({ ...baseEnvironment, CALENDAR_PUBLIC_URL: "not-a-url" }), z.ZodError)
  assert.throws(() => parseConfig({ ...baseEnvironment, SMTP_ENABLED: "true" }), z.ZodError)
})
