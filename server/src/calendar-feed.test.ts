import assert from "node:assert/strict"
import test from "node:test"
import {
  buildCalendarFeed,
  calendarFeedUrl,
  createCalendarToken,
  verifyCalendarToken,
} from "./calendar-feed.js"

const secret = "calendar-feed-test-secret-at-least-32-characters"

test("creates stable purpose-scoped calendar tokens that can be versioned", () => {
  const token = createCalendarToken("user-1", 3, secret)
  assert.equal(createCalendarToken("user-1", 3, secret), token)
  assert.deepEqual(verifyCalendarToken(token, secret), { userId: "user-1", version: 3 })
  assert.equal(verifyCalendarToken(token, `${secret}-wrong`), null)
})

test("builds an escaped all-day ICS feed with stable event identifiers", () => {
  const feed = buildCalendarFeed("Alex's Telly Tracker", [{
    uid: "episode-1@telly-tracker",
    startDate: new Date("2026-10-09T00:00:00.000Z"),
    summary: "The Show — S03E07: Trouble, Again",
    description: "A finale; probably.\nProvider date from TVmaze.",
    url: "https://telly.example/#library/media-1",
  }], new Date("2026-10-04T21:55:00.000Z"))

  assert.match(feed, /^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/)
  assert.match(feed, /UID:episode-1@telly-tracker/)
  assert.match(feed, /DTSTAMP:20261004T215500Z/)
  assert.match(feed, /DTSTART;VALUE=DATE:20261009/)
  assert.match(feed, /DTEND;VALUE=DATE:20261010/)
  assert.match(feed, /Trouble\\, Again/)
  assert.match(feed, /A finale\\; probably\.\\nProvider date from TVmaze\./)
  assert.ok(feed.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75))
  assert.match(feed, /\r\nEND:VCALENDAR\r\n$/)
})

test("builds a subscription URL under the configured web origin", () => {
  const url = calendarFeedUrl("https://telly.example", "header.payload.signature")
  assert.equal(url, "https://telly.example/api/calendar/header.payload.signature.ics")
})
