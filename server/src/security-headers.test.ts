import assert from "node:assert/strict"
import test from "node:test"
import { createHelmetOptions } from "./security-headers.js"

test("HTTP origins do not upgrade assets to HTTPS or advertise HSTS", () => {
  const options = createHelmetOptions(false, "https://image.tmdb.org/t/p")
  const directives = options.contentSecurityPolicy && typeof options.contentSecurityPolicy !== "boolean"
    ? options.contentSecurityPolicy.directives
    : undefined

  assert.equal(options.strictTransportSecurity, false)
  assert.equal(directives?.["upgrade-insecure-requests"], null)
})

test("HTTPS origins retain transport security headers", () => {
  const options = createHelmetOptions(true, "https://image.tmdb.org/t/p")
  const directives = options.contentSecurityPolicy && typeof options.contentSecurityPolicy !== "boolean"
    ? options.contentSecurityPolicy.directives
    : undefined

  assert.notEqual(directives?.["upgrade-insecure-requests"], undefined)
  assert.notEqual(options.strictTransportSecurity, false)
})

test("image policy permits the configured TMDB CDN and official attribution logo", () => {
  const options = createHelmetOptions(false, "https://media.example.com/tmdb")
  const directives = options.contentSecurityPolicy && typeof options.contentSecurityPolicy !== "boolean"
    ? options.contentSecurityPolicy.directives
    : undefined

  assert.deepEqual(directives?.["img-src"], [
    "'self'",
    "data:",
    "https://media.example.com",
    "https://www.themoviedb.org",
    "https://static.tvmaze.com",
  ])
})
