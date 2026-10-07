import jwt from "jsonwebtoken"

const calendarPurpose = "calendar-feed"
const calendarIssuer = "telly-tracker"

export type CalendarTokenPayload = {
  userId: string
  version: number
}

export type CalendarFeedItem = {
  uid: string
  startDate: Date
  summary: string
  description: string
  url: string
}

export function createCalendarToken(userId: string, version: number, secret: string) {
  return jwt.sign(
    { sub: userId, purpose: calendarPurpose, version },
    secret,
    { algorithm: "HS256", issuer: calendarIssuer, noTimestamp: true }
  )
}

export function verifyCalendarToken(token: string, secret: string): CalendarTokenPayload | null {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: calendarIssuer,
    })
    if (
      typeof payload === "string" ||
      payload.purpose !== calendarPurpose ||
      typeof payload.sub !== "string" ||
      typeof payload.version !== "number" ||
      !Number.isInteger(payload.version) ||
      payload.version < 1
    ) return null
    return { userId: payload.sub, version: payload.version }
  } catch {
    return null
  }
}

export function calendarFeedUrl(webOrigin: string, token: string) {
  return new URL(`/api/calendar/${encodeURIComponent(token)}.ics`, webOrigin).toString()
}

export function buildCalendarFeed(calendarName: string, items: CalendarFeedItem[], generatedAt = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Telly Tracker//Release Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeCalendarText(calendarName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ]

  for (const item of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeCalendarText(item.uid)}`,
      `DTSTAMP:${formatTimestamp(generatedAt)}`,
      `DTSTART;VALUE=DATE:${formatDate(item.startDate)}`,
      `DTEND;VALUE=DATE:${formatDate(addUtcDays(item.startDate, 1))}`,
      `SUMMARY:${escapeCalendarText(item.summary)}`,
      `DESCRIPTION:${escapeCalendarText(item.description)}`,
      `URL:${escapeCalendarText(item.url)}`,
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    )
  }

  lines.push("END:VCALENDAR")
  return `${lines.flatMap(foldCalendarLine).join("\r\n")}\r\n`
}

function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
}

function formatDate(value: Date) {
  return [
    value.getUTCFullYear().toString().padStart(4, "0"),
    (value.getUTCMonth() + 1).toString().padStart(2, "0"),
    value.getUTCDate().toString().padStart(2, "0"),
  ].join("")
}

function formatTimestamp(value: Date) {
  return `${formatDate(value)}T${[
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
  ].map((part) => part.toString().padStart(2, "0")).join("")}Z`
}

function addUtcDays(value: Date, days: number) {
  const result = new Date(value)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function foldCalendarLine(line: string) {
  if (Buffer.byteLength(line, "utf8") <= 75) return [line]
  const folded: string[] = []
  let current = ""
  for (const character of line) {
    const limit = folded.length === 0 ? 75 : 74
    if (current && Buffer.byteLength(current + character, "utf8") > limit) {
      folded.push(folded.length === 0 ? current : ` ${current}`)
      current = character
    } else {
      current += character
    }
  }
  if (current) folded.push(folded.length === 0 ? current : ` ${current}`)
  return folded
}
