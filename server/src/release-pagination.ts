export const unwatchedReleasePageSize = 48

export type ReleaseCursor = {
  date: Date
  kind: "EPISODE" | "MOVIE"
  id: string
}

type ReleaseOrderItem = ReleaseCursor

const releaseKindOrder: Record<ReleaseCursor["kind"], number> = {
  EPISODE: 0,
  MOVIE: 1,
}

export function compareReleaseOrder(left: ReleaseOrderItem, right: ReleaseOrderItem) {
  const dateDifference = left.date.getTime() - right.date.getTime()
  if (dateDifference !== 0) return dateDifference
  const kindDifference = releaseKindOrder[left.kind] - releaseKindOrder[right.kind]
  if (kindDifference !== 0) return kindDifference
  return left.id.localeCompare(right.id)
}

export function encodeReleaseCursor(cursor: ReleaseCursor) {
  return Buffer.from(JSON.stringify([cursor.date.toISOString(), cursor.kind, cursor.id])).toString("base64url")
}

export function decodeReleaseCursor(value: string): ReleaseCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown
    if (!Array.isArray(parsed) || parsed.length !== 3) return null
    const [dateValue, kind, id] = parsed
    if (typeof dateValue !== "string" || (kind !== "EPISODE" && kind !== "MOVIE") || typeof id !== "string" || id.length === 0) return null
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return null
    return { date, kind, id }
  } catch {
    return null
  }
}
