export const releaseWindowPastDays = 14
export const releaseWindowFutureDays = 14

function utcDayStart(date: Date, dayOffset: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + dayOffset))
}

export function releaseWindowBounds(now: Date) {
  return {
    start: utcDayStart(now, -releaseWindowPastDays),
    endExclusive: utcDayStart(now, releaseWindowFutureDays + 1),
  }
}

export function isInReleaseWindow(date: Date, now: Date) {
  const { start, endExclusive } = releaseWindowBounds(now)
  return date >= start && date < endExclusive
}
