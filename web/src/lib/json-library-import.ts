export type JsonLibraryImportType = "MOVIE" | "SHOW"

export type JsonLibraryImportItem = {
  title: string
  year: string | null
  type: JsonLibraryImportType | null
}

const CONTAINER_TYPES: Record<string, JsonLibraryImportType | null> = {
  entries: null,
  items: null,
  library: null,
  movies: "MOVIE",
  shows: "SHOW",
  titles: null,
  tv: "SHOW",
  tvshows: "SHOW",
  watchlist: null,
}

export function parseJsonLibraryImport(source: string): JsonLibraryImportItem[] {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error("That file is not valid JSON.")
  }

  const collected: JsonLibraryImportItem[] = []
  collectImportItems(value, null, collected)

  const deduplicated = deduplicateImportItems(collected)

  if (deduplicated.length === 0) {
    throw new Error("No titles were found. Use strings or objects with a title or name field.")
  }
  return deduplicated
}

function deduplicateImportItems(items: JsonLibraryImportItem[]) {
  const deduplicated: JsonLibraryImportItem[] = []
  for (const item of items) {
    const title = normalizeTitle(item.title)
    const matchIndex = deduplicated.findIndex((candidate) =>
      normalizeTitle(candidate.title) === title &&
      (!candidate.type || !item.type || candidate.type === item.type) &&
      (!candidate.year || !item.year || candidate.year === item.year)
    )
    if (matchIndex === -1) {
      deduplicated.push(item)
      continue
    }
    const match = deduplicated[matchIndex]
    deduplicated[matchIndex] = {
      title: match.title,
      year: match.year ?? item.year,
      type: match.type ?? item.type,
    }
  }
  return deduplicated
}

function collectImportItems(
  value: unknown,
  inferredType: JsonLibraryImportType | null,
  collected: JsonLibraryImportItem[]
) {
  if (typeof value === "string") {
    const title = value.trim()
    if (title) collected.push({ title, year: null, type: inferredType })
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectImportItems(item, inferredType, collected))
    return
  }

  if (!value || typeof value !== "object") return

  const record = value as Record<string, unknown>
  const wrappedMovie = getCaseInsensitive(record, "movie")
  const wrappedShow = getCaseInsensitive(record, "show")
  if (wrappedMovie && typeof wrappedMovie === "object") {
    collectImportItems(wrappedMovie, "MOVIE", collected)
    return
  }
  if (wrappedShow && typeof wrappedShow === "object") {
    collectImportItems(wrappedShow, "SHOW", collected)
    return
  }

  const title = getString(record, ["title", "name", "originalTitle", "original_name"])
  if (title) {
    collected.push({
      title,
      year: getYear(record),
      type: getMediaType(record) ?? inferredType,
    })
    return
  }

  for (const [key, item] of Object.entries(record)) {
    const containerType = CONTAINER_TYPES[normalizeKey(key)]
    if (Array.isArray(item) && containerType !== undefined) {
      collectImportItems(item, containerType ?? inferredType, collected)
    }
  }
}

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getCaseInsensitive(record, key)
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function getYear(record: Record<string, unknown>) {
  const direct = getCaseInsensitive(record, "year") ?? getCaseInsensitive(record, "releaseYear")
  if (typeof direct === "number" && Number.isInteger(direct) && direct >= 1800 && direct <= 2200) {
    return String(direct)
  }
  if (typeof direct === "string") {
    const match = direct.match(/\b(18|19|20|21|22)\d{2}\b/)
    if (match) return match[0]
  }

  const dated = getString(record, ["releaseDate", "released", "firstAirDate", "first_air_date", "date"])
  return dated?.match(/\b(18|19|20|21|22)\d{2}\b/)?.[0] ?? null
}

function getMediaType(record: Record<string, unknown>): JsonLibraryImportType | null {
  const value = getString(record, ["type", "mediaType", "kind"])
  if (!value) return null
  const normalized = normalizeKey(value)
  if (["movie", "film"].includes(normalized)) return "MOVIE"
  if (["show", "tv", "tvshow", "series", "television"].includes(normalized)) return "SHOW"
  return null
}

function getCaseInsensitive(record: Record<string, unknown>, wantedKey: string) {
  const matchedKey = Object.keys(record).find((key) => normalizeKey(key) === normalizeKey(wantedKey))
  return matchedKey ? record[matchedKey] : undefined
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}
