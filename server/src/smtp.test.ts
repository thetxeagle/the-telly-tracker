import assert from "node:assert/strict"
import test from "node:test"
import { decryptSmtpPassword, encryptSmtpPassword, publicSmtpSettings } from "./smtp.js"

const encryptionSecret = "smtp-test-encryption-secret-at-least-32-characters"

test("SMTP passwords are encrypted with authenticated encryption", () => {
  const encrypted = encryptSmtpPassword("correct horse battery staple", encryptionSecret)

  assert.notEqual(encrypted, "correct horse battery staple")
  assert.equal(decryptSmtpPassword(encrypted, encryptionSecret), "correct horse battery staple")
  assert.throws(() => decryptSmtpPassword(encrypted, `${encryptionSecret}-wrong`))
})

test("public SMTP settings never expose encrypted credentials", () => {
  const settings = publicSmtpSettings({
    smtpEnabled: true,
    smtpHost: "smtp.example.com",
    smtpPort: 465,
    smtpSecure: true,
    smtpUsername: "mailer",
    smtpPasswordEncrypted: "encrypted-value",
    smtpFromName: "Telly Tracker",
    smtpFromEmail: "telly@example.com",
  })

  assert.deepEqual(settings, {
    source: "database",
    enabled: true,
    host: "smtp.example.com",
    port: 465,
    secure: true,
    username: "mailer",
    hasPassword: true,
    fromName: "Telly Tracker",
    fromEmail: "telly@example.com",
  })
  assert.equal("password" in settings, false)
})

test("environment SMTP settings take precedence without exposing the password", () => {
  const settings = publicSmtpSettings({
    smtpEnabled: false,
    smtpHost: null,
    smtpPort: null,
    smtpSecure: false,
    smtpUsername: null,
    smtpPasswordEncrypted: null,
    smtpFromName: null,
    smtpFromEmail: null,
  }, {
    enabled: true,
    host: "smtp.environment.test",
    port: 465,
    secure: true,
    username: "deployer",
    password: "environment-secret",
    fromName: "Telly Tracker",
    fromEmail: "telly@example.com",
  })

  assert.equal(settings.source, "environment")
  assert.equal(settings.host, "smtp.environment.test")
  assert.equal(settings.hasPassword, true)
  assert.equal("password" in settings, false)
})
