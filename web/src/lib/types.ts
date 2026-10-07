export type Backdrop = string

export type ProviderSearchResult = {
  tmdbId: number
  type: "MOVIE" | "SHOW"
  title: string
  synopsis: string
  releaseDate: string | null
  poster: string
  backdrop: string
  inLibrary: boolean
}

export type Episode = {
  id: string
  season: number
  number: number
  title: string
  runtime: number
  airDate: string
  watched: boolean
}

export type UpcomingItem = {
  id: string
  mediaId: string
  title: string
  date: string
  detail: string
  backdrop: Backdrop
  favorite: boolean
  kind: "EPISODE" | "MOVIE"
  watched: boolean
}

export type ReleaseItem = UpcomingItem

export type UnwatchedReleasePage = {
  items: UpcomingItem[]
  total: number
  nextCursor: string | null
}

export type LibraryStatus = "WATCHED" | "IN_PROGRESS" | "PLANNED"
export type RegistrationMode = "OPEN" | "INVITE_ONLY" | "CLOSED"

export type SetupStatus = {
  requiresOwner: boolean
  setupComplete: boolean
  smtp: Pick<SmtpSettings, "source" | "enabled">
}

export type SmtpSettings = {
  source: "database" | "environment"
  enabled: boolean
  host: string
  port: number
  secure: boolean
  username: string
  hasPassword: boolean
  fromName: string
  fromEmail: string
}

export type AdminOverview = {
  currentUserId: string
  registrationMode: RegistrationMode
  setupComplete: boolean
  smtp: SmtpSettings
  users: Array<{
    id: string
    name: string
    email: string
    isAdmin: boolean
    totpEnabledAt: string | null
    createdAt: string
  }>
  invitations: Array<{
    id: string
    email: string
    expiresAt: string
    usedAt: string | null
    createdAt: string
  }>
}

export type AccountSecurityStatus = {
  totpEnabled: boolean
  totpEnabledAt: string | null
  recoveryCodesRemaining: number
  calendarFeed: {
    enabled: boolean
    url: string | null
  }
}

export type TotpEnrollment = {
  secret: string
  uri: string
  qrCodeDataUrl: string
}

export type LibraryItem = {
  id: string
  title: string
  type: "MOVIE" | "SHOW"
  synopsis: string
  releaseDate: string
  endDate: string | null
  productionStatus: string | null
  poster: string
  backdrop: Backdrop
  imdbId: string | null
  favorite: boolean
  status: LibraryStatus
  watchedCount: number
  totalEpisodes: number
  episodes: Episode[]
}

export type DashboardData = {
  user: { name: string; email: string; isAdmin: boolean }
  library: LibraryItem[]
  newReleases: ReleaseItem[]
  upcoming: UpcomingItem[]
  summary: {
    trackedShows: number
    trackedMovies: number
    watchedEpisodes: number
    watchedMovies: number
    favorites: number
    duplicateGroups: number
    duplicateEntries: number
  }
  discover: Array<{
    id: string
    title: string
    type: "MOVIE" | "SHOW"
    synopsis: string
    releaseDate: string
    poster: string
    backdrop: Backdrop
    imdbId: string | null
    inLibrary: boolean
    providerBacked: boolean
    metadataSyncedAt: string | null
    syncError: string | null
  }>
}
