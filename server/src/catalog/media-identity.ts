export type MediaKind = "MOVIE" | "SHOW"

export type MediaIdentity = {
  type: MediaKind
  tmdbId?: number | null
  tvmazeId?: number | null
  imdbId?: string | null
  thetvdbId?: number | null
}

export type StoredMediaIdentity = MediaIdentity & {
  id: string
}

type IdentityKey = "tmdbId" | "tvmazeId" | "imdbId" | "thetvdbId"

export class MediaIdentityConflictError extends Error {
  constructor(
    public readonly identity: MediaIdentity,
    public readonly mediaIds: string[]
  ) {
    super(`Provider identifiers resolve to multiple media records: ${mediaIds.join(", ")}`)
    this.name = "MediaIdentityConflictError"
  }
}

export class MediaIdentityTypeConflictError extends Error {
  constructor(
    public readonly identity: MediaIdentity,
    public readonly mediaId: string,
    public readonly storedType: MediaKind
  ) {
    super(`Provider identifier belongs to ${storedType.toLowerCase()} record ${mediaId}`)
    this.name = "MediaIdentityTypeConflictError"
  }
}

export function resolveMediaIdentity(
  identity: MediaIdentity,
  candidates: StoredMediaIdentity[]
): StoredMediaIdentity | null {
  const identifiers = definedIdentifiers(identity)
  if (identifiers.length === 0) throw new Error("At least one provider identifier is required")

  const matches = candidates.filter((candidate) =>
    identifiers.some(([key, value]) => key !== "tmdbId" && candidate[key] === value)
  )
  const tmdbMatches =
    identity.tmdbId === null || identity.tmdbId === undefined
      ? []
      : candidates.filter(
          (candidate) => candidate.type === identity.type && candidate.tmdbId === identity.tmdbId
        )
  matches.push(...tmdbMatches)
  const uniqueMatches = [...new Map(matches.map((candidate) => [candidate.id, candidate])).values()]

  if (uniqueMatches.length > 1) {
    throw new MediaIdentityConflictError(
      identity,
      uniqueMatches.map(({ id }) => id).sort()
    )
  }

  if (uniqueMatches[0] && uniqueMatches[0].type !== identity.type) {
    throw new MediaIdentityTypeConflictError(identity, uniqueMatches[0].id, uniqueMatches[0].type)
  }

  return uniqueMatches[0] ?? null
}

export function providerSourceId(identity: MediaIdentity): string {
  if (identity.tmdbId) return `tmdb:${identity.type.toLowerCase()}:${identity.tmdbId}`
  if (identity.tvmazeId) return `tvmaze:show:${identity.tvmazeId}`
  if (identity.imdbId) return `imdb:${identity.imdbId}`
  if (identity.thetvdbId) return `thetvdb:${identity.thetvdbId}`
  throw new Error("At least one provider identifier is required")
}

function definedIdentifiers(identity: MediaIdentity): Array<[IdentityKey, number | string]> {
  const identifiers: Array<[IdentityKey, number | string]> = []
  if (identity.tmdbId) identifiers.push(["tmdbId", identity.tmdbId])
  if (identity.tvmazeId) identifiers.push(["tvmazeId", identity.tvmazeId])
  if (identity.imdbId) identifiers.push(["imdbId", identity.imdbId])
  if (identity.thetvdbId) identifiers.push(["thetvdbId", identity.thetvdbId])
  return identifiers
}
