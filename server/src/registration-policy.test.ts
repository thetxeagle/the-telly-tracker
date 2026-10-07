import assert from "node:assert/strict"
import test from "node:test"
import { shouldGrantAdministrator } from "./registration-policy.js"

test("the first account is always an administrator", () => {
  assert.equal(shouldGrantAdministrator(true, false), true)
})

test("later accounts require bootstrap administrator configuration", () => {
  assert.equal(shouldGrantAdministrator(false, false), false)
  assert.equal(shouldGrantAdministrator(false, true), true)
})
