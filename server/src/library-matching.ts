type MediaKind = "MOVIE" | "SHOW"

export type SearchMediaCandidate = {
  tmdbId: number
  type: MediaKind
  title: string
  releaseDate: string | null
}

export type TrackedMediaCandidate = {
  tmdbId: number | null
  type: MediaKind
  title: string
  releaseDate: Date
}

export type DuplicateLibraryCandidate = {
  id: string
  mediaId: string
  title: string
  type: MediaKind
  releaseDate: Date
  tmdbId: number | null
  tvmazeId: number | null
  imdbId: string | null
  thetvdbId: number | null
  episodeCount: number
  addedAt: Date
}

export type DuplicateLibraryGroup = {
  key: string
  keeper: DuplicateLibraryCandidate
  duplicates: DuplicateLibraryCandidate[]
}

export function markTrackedSearchResults<T extends SearchMediaCandidate>(
  results: T[],
  tracked: TrackedMediaCandidate[]
): Array<T & { inLibrary: boolean }> {
  const providerKeys = new Set(
    tracked.flatMap((item) => item.tmdbId === null ? [] : [`${item.type}:${item.tmdbId}`])
  )
  const legacyKeys = new Set(tracked.map(libraryMatchKey))
  return results.map((result) => ({
    ...result,
    inLibrary:
      providerKeys.has(`${result.type}:${result.tmdbId}`) ||
      legacyKeys.has(searchMatchKey(result)),
  }))
}

export function findDuplicateLibraryGroups(
  entries: DuplicateLibraryCandidate[]
): DuplicateLibraryGroup[] {
  const grouped = new Map<string, DuplicateLibraryCandidate[]>()
  for (const entry of entries) {
    const key = libraryMatchKey(entry)
    grouped.set(key, [...(grouped.get(key) ?? []), entry])
  }

  return [...grouped.entries()].flatMap(([key, candidates]) => {
    if (candidates.length < 2) return []
    const ranked = [...candidates].sort(compareDuplicateCandidates)
    return [{ key, keeper: ranked[0], duplicates: ranked.slice(1) }]
  })
}

function compareDuplicateCandidates(left: DuplicateLibraryCandidate, right: DuplicateLibraryCandidate) {
  const providerDifference = providerScore(right) - providerScore(left)
  if (providerDifference !== 0) return providerDifference
  if (right.episodeCount !== left.episodeCount) return right.episodeCount - left.episodeCount
  const addedDifference = left.addedAt.getTime() - right.addedAt.getTime()
  if (addedDifference !== 0) return addedDifference
  return left.mediaId.localeCompare(right.mediaId)
}

function providerScore(candidate: DuplicateLibraryCandidate) {
  return [candidate.tmdbId, candidate.tvmazeId, candidate.imdbId, candidate.thetvdbId]
    .filter((value) => value !== null).length
}

function searchMatchKey(candidate: SearchMediaCandidate) {
  return `${candidate.type}:${normalizeTitle(candidate.title)}:${yearFromString(candidate.releaseDate)}`
}

function libraryMatchKey(candidate: Pick<TrackedMediaCandidate, "type" | "title" | "releaseDate">) {
  return `${candidate.type}:${normalizeTitle(candidate.title)}:${candidate.releaseDate.getUTCFullYear()}`
}

function yearFromString(value: string | null) {
  const year = value?.match(/^\d{4}/)?.[0]
  return year ?? "unknown"
}

function normalizeTitle(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
}
