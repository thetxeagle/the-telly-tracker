import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FilmIcon,
  HeartIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  LogOutIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TvIcon,
} from "lucide-react"

import { AdminPortal } from "@/components/admin-portal"
import { AccountSecurity } from "@/components/account-security"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MediaArtwork } from "@/components/media-artwork"
import { ProviderDiscovery } from "@/components/provider-discovery"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { api, ApiError } from "@/lib/api"
import type { DashboardData, Episode, LibraryItem, ReleaseItem, UnwatchedReleasePage, UpcomingItem } from "@/lib/types"

type DashboardProps = { data: DashboardData; onRefresh: () => Promise<void>; onLogout: () => void }
type DashboardView = "home" | "library" | "discover" | "release-calendar" | "account" | "admin"
type LibraryMediaFilter = "ALL" | LibraryItem["type"]
type LibrarySort = "TITLE_ASC" | "LATEST_EPISODE_DESC" | "RELEASE_DESC" | "RELEASE_ASC"
type ReleaseWindowFilter = "ALL" | "UNWATCHED"

const emptyUnwatchedReleasePage: UnwatchedReleasePage = { items: [], total: 0, nextCursor: null }

const dashboardViews: Array<{ id: DashboardView; label: string }> = [
  { id: "home", label: "Home" },
  { id: "library", label: "Library" },
  { id: "discover", label: "Discover" },
  { id: "release-calendar", label: "Release Calendar" },
]

function getViewFromLocation(isAdmin: boolean): DashboardView {
  const view = window.location.hash.slice(1).split("/", 1)[0]
  if (view === "upcoming") return "release-calendar"
  if (view === "account") return "account"
  if (view === "admin") return isAdmin ? "admin" : "home"
  return dashboardViews.some((item) => item.id === view) ? view as DashboardView : "home"
}

function getLibraryMediaIdFromLocation() {
  const [view, mediaId] = window.location.hash.slice(1).split("/")
  if (view !== "library" || !mediaId) return null
  try {
    return decodeURIComponent(mediaId)
  } catch {
    return null
  }
}

export function Dashboard({ data, onRefresh, onLogout }: DashboardProps) {
  const [currentDate] = useState(() => new Date())
  const [activeView, setActiveView] = useState<DashboardView>(() => getViewFromLocation(data.user.isAdmin))
  const [libraryMediaId, setLibraryMediaId] = useState<string | null>(getLibraryMediaIdFromLocation)
  const [libraryQuery, setLibraryQuery] = useState("")
  const [libraryMediaType, setLibraryMediaType] = useState<LibraryMediaFilter>("ALL")
  const [librarySort, setLibrarySort] = useState<LibrarySort>("TITLE_ASC")
  const [releaseWindowFilter, setReleaseWindowFilter] = useState<ReleaseWindowFilter>("ALL")
  const [unwatchedReleasePage, setUnwatchedReleasePage] = useState<UnwatchedReleasePage>(emptyUnwatchedReleasePage)
  const [unwatchedLoading, setUnwatchedLoading] = useState(false)
  const [unwatchedError, setUnwatchedError] = useState<string | null>(null)
  const [unwatchedReloadToken, setUnwatchedReloadToken] = useState(0)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [duplicateCleanupOpen, setDuplicateCleanupOpen] = useState(false)
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false)
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null)
  const [recentReleaseDialogOpen, setRecentReleaseDialogOpen] = useState(false)
  const [markingRecentReleases, setMarkingRecentReleases] = useState(false)
  const [releaseWindowMessage, setReleaseWindowMessage] = useState<string | null>(null)
  const visibleLibrary = useMemo(() => {
    const normalizedLibraryQuery = libraryQuery.trim().toLowerCase()
    return [...(data.library ?? [])]
      .filter((item) => libraryMediaType === "ALL" || item.type === libraryMediaType)
      .filter((item) => !normalizedLibraryQuery || item.title.toLowerCase().includes(normalizedLibraryQuery))
      .sort((left, right) => {
        if (librarySort === "LATEST_EPISODE_DESC") return latestLibraryActivityTime(right) - latestLibraryActivityTime(left)
        if (librarySort === "RELEASE_DESC") return new Date(right.releaseDate).getTime() - new Date(left.releaseDate).getTime()
        if (librarySort === "RELEASE_ASC") return new Date(left.releaseDate).getTime() - new Date(right.releaseDate).getTime()
        return left.title.localeCompare(right.title)
      })
  }, [data.library, libraryMediaType, libraryQuery, librarySort])
  const selectedLibraryItem = useMemo(
    () => (data.library ?? []).find((item) => item.id === libraryMediaId) ?? null,
    [data.library, libraryMediaId]
  )
  const nextUpcoming = useMemo(
    () => data.upcoming.filter((item) => new Date(item.date).getTime() > currentDate.getTime()),
    [currentDate, data.upcoming]
  )
  const releaseWindowItems = useMemo(
    () => releaseWindowFilter === "UNWATCHED"
      ? unwatchedReleasePage.items
      : data.upcoming.filter((item) => isInCalendarWindow(item.date, currentDate)),
    [currentDate, data.upcoming, releaseWindowFilter, unwatchedReleasePage.items]
  )
  const recentUnwatchedReleases = useMemo(
    () => data.upcoming.filter((item) => !item.watched && isRecentlyReleased(item.date, currentDate)),
    [currentDate, data.upcoming]
  )
  useEffect(() => {
    const syncView = () => {
      if (window.location.hash.split("/", 1)[0] === "#upcoming") {
        window.history.replaceState(null, "", window.location.hash.replace("#upcoming", "#release-calendar"))
      }
      setActiveView(getViewFromLocation(data.user.isAdmin))
      setLibraryMediaId(getLibraryMediaIdFromLocation())
    }
    syncView()
    window.addEventListener("hashchange", syncView)
    window.addEventListener("popstate", syncView)
    return () => {
      window.removeEventListener("hashchange", syncView)
      window.removeEventListener("popstate", syncView)
    }
  }, [data.user.isAdmin])

  useEffect(() => {
    if (activeView !== "release-calendar" || releaseWindowFilter !== "UNWATCHED") return
    const controller = new AbortController()
    api<UnwatchedReleasePage>(unwatchedReleasePath(), { signal: controller.signal })
      .then((page) => {
        setUnwatchedReleasePage(page)
        setUnwatchedError(null)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setUnwatchedError(error instanceof ApiError ? error.message : "Unwatched releases could not be loaded")
      })
      .finally(() => { if (!controller.signal.aborted) setUnwatchedLoading(false) })
    return () => controller.abort()
  }, [activeView, releaseWindowFilter, unwatchedReloadToken])

  function goToView(view: DashboardView) {
    if (activeView !== view) window.history.pushState(null, "", `#${view}`)
    setActiveView(view)
    setLibraryMediaId(null)
    window.scrollTo({ top: 0, behavior: "auto" })
  }

  function navigate(event: MouseEvent<HTMLAnchorElement>, view: DashboardView) {
    event.preventDefault()
    goToView(view)
  }

  function openLibraryTitle(event: MouseEvent<HTMLAnchorElement>, mediaId: string) {
    event.preventDefault()
    window.history.pushState(null, "", `#library/${encodeURIComponent(mediaId)}`)
    setActiveView("library")
    setLibraryMediaId(mediaId)
    window.scrollTo({ top: 0, behavior: "auto" })
  }

  function closeLibraryTitle() {
    window.history.pushState(null, "", "#library")
    setLibraryMediaId(null)
    window.scrollTo({ top: 0, behavior: "auto" })
  }

  async function toggleFavorite(mediaId: string, favorite: boolean) {
    await api(`/api/library/${mediaId}`, { method: "PATCH", body: JSON.stringify({ favorite: !favorite }) })
    setUnwatchedReleasePage((page) => ({
      ...page,
      items: page.items.map((item) => item.mediaId === mediaId ? { ...item, favorite: !favorite } : item),
    }))
    await onRefresh()
  }

  async function loadMoreUnwatchedReleases() {
    if (!unwatchedReleasePage.nextCursor || unwatchedLoading) return
    setUnwatchedError(null)
    setUnwatchedLoading(true)
    try {
      const nextPage = await api<UnwatchedReleasePage>(unwatchedReleasePath(unwatchedReleasePage.nextCursor))
      setUnwatchedReleasePage((page) => ({
        items: [...page.items, ...nextPage.items],
        total: nextPage.total,
        nextCursor: nextPage.nextCursor,
      }))
    } catch (error) {
      setUnwatchedError(error instanceof ApiError ? error.message : "More unwatched releases could not be loaded")
    } finally {
      setUnwatchedLoading(false)
    }
  }

  async function setEpisodeWatched(episodeId: string, watched: boolean) {
    await api(`/api/episodes/${episodeId}`, { method: "PATCH", body: JSON.stringify({ watched }) })
    await onRefresh()
  }

  async function setEpisodesWatched(episodeIds: string[], watched: boolean) {
    const batchSize = 500
    for (let start = 0; start < episodeIds.length; start += batchSize) {
      await api("/api/episodes", { method: "PATCH", body: JSON.stringify({ episodeIds: episodeIds.slice(start, start + batchSize), watched }) })
    }
    await onRefresh()
  }

  async function setMovieWatched(mediaId: string, watched: boolean) {
    await api(`/api/library/${mediaId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: watched ? "WATCHED" : "PLANNED" }),
    })
    await onRefresh()
  }

  async function setReleaseWatched(item: ReleaseItem) {
    if (item.kind === "EPISODE") await setEpisodeWatched(item.id, !item.watched)
    else await setMovieWatched(item.mediaId, !item.watched)
  }

  async function markRecentReleasesWatched() {
    if (recentUnwatchedReleases.length === 0 || markingRecentReleases) return

    setMarkingRecentReleases(true)
    setReleaseWindowMessage(null)
    try {
      const episodeIds = recentUnwatchedReleases
        .filter((item) => item.kind === "EPISODE")
        .map((item) => item.id)
      const movieIds = [...new Set(
        recentUnwatchedReleases
          .filter((item) => item.kind === "MOVIE")
          .map((item) => item.mediaId)
      )]

      const batchSize = 500
      for (let start = 0; start < episodeIds.length; start += batchSize) {
        await api("/api/episodes", {
          method: "PATCH",
          body: JSON.stringify({ episodeIds: episodeIds.slice(start, start + batchSize), watched: true }),
        })
      }
      for (const mediaId of movieIds) {
        await api(`/api/library/${mediaId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "WATCHED" }),
        })
      }

      const markedCount = recentUnwatchedReleases.length
      await onRefresh()
      if (releaseWindowFilter === "UNWATCHED") {
        setUnwatchedReleasePage(emptyUnwatchedReleasePage)
        setUnwatchedLoading(true)
        setUnwatchedReloadToken((value) => value + 1)
      }
      setReleaseWindowMessage(`Marked ${markedCount} recent ${markedCount === 1 ? "release" : "releases"} watched. Future releases were not changed.`)
    } catch (error) {
      setReleaseWindowMessage(error instanceof ApiError ? error.message : "Recent releases could not be marked watched")
    } finally {
      setMarkingRecentReleases(false)
      setRecentReleaseDialogOpen(false)
    }
  }

  async function addToLibrary(mediaId: string) {
    await api(`/api/library/${mediaId}`, { method: "PATCH", body: JSON.stringify({ status: "PLANNED" }) })
    await onRefresh()
  }

  async function removeFromLibrary(mediaId: string) {
    await api(`/api/library/${mediaId}`, { method: "DELETE" })
    await onRefresh()
  }

  async function removeDuplicateEntries() {
    setCleaningDuplicates(true)
    setLibraryMessage(null)
    try {
      const result = await api<{ removedEntries: number; groups: number; skippedGroups: number; transferredEpisodes: number }>(
        "/api/library/duplicates",
        { method: "DELETE" }
      )
      await onRefresh()
      setDuplicateCleanupOpen(false)
      setLibraryMessage(
        result.removedEntries === 0
          ? result.skippedGroups > 0
            ? `${result.skippedGroups} duplicate ${result.skippedGroups === 1 ? "group was" : "groups were"} left unchanged because its watch history could not be transferred safely.`
            : "No duplicate library entries were found."
          : `Removed ${result.removedEntries} duplicate ${result.removedEntries === 1 ? "entry" : "entries"} across ${result.groups - result.skippedGroups} ${result.groups - result.skippedGroups === 1 ? "title" : "titles"}.${result.skippedGroups > 0 ? ` ${result.skippedGroups} unsafe ${result.skippedGroups === 1 ? "group was" : "groups were"} left unchanged.` : ""}`
      )
    } catch (error) {
      setLibraryMessage(error instanceof ApiError ? error.message : "Duplicate cleanup failed")
    } finally {
      setCleaningDuplicates(false)
    }
  }

  async function refreshMedia(mediaId: string) {
    setRefreshing(mediaId)
    setSyncMessage(null)
    try {
      await api(`/api/media/${mediaId}/refresh`, { method: "POST" })
      await onRefresh()
      setSyncMessage("Provider metadata is up to date.")
    } catch (error) {
      setSyncMessage(error instanceof ApiError ? error.message : "Metadata refresh failed")
    } finally {
      setRefreshing(null)
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" })
    onLogout()
  }

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Telly Tracker home" onClick={(event) => navigate(event, "home")}>
          <img className="brand-logo" src="/telly-tracker-logo.svg" alt="" />
        </a>
        <nav aria-label="Primary navigation">
          {dashboardViews.map((view) => (
            <a key={view.id} className={activeView === view.id ? "nav-active" : undefined} href={`#${view.id}`} aria-current={activeView === view.id ? "page" : undefined} onClick={(event) => navigate(event, view.id)}>
              {view.label}
            </a>
          ))}
        </nav>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button className="profile-trigger" variant="ghost" />} aria-label={`Open account menu for ${data.user.name}`}>
            <Avatar><AvatarFallback>{data.user.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
            <span className="profile-trigger-name">{data.user.name}</span>
            <ChevronDownIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="profile-menu">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="profile-menu-identity">
                <span>{data.user.name}</span>
                <span>{data.user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => goToView("account")}>
                <SettingsIcon />Account settings
              </DropdownMenuItem>
              {data.user.isAdmin ? (
                <DropdownMenuItem onClick={() => goToView("admin")}>
                  <ShieldCheckIcon />Administration settings
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="profile-menu-signout" onClick={logout}>
                <LogOutIcon />Log out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main id={activeView} className="dashboard-main">
        {activeView === "home" ? (
          <>
            <section className="welcome">
              <h1>Good evening, {data.user.name}</h1>
              <p className="welcome-lead">Know what aired. Track what you watched.</p>
              <p>Review recent releases, check what lands next, or update any episode in your library.</p>
            </section>
            <div className="content-split">
              <section aria-labelledby="new-releases-heading">
                <SectionHeading id="new-releases-heading">Released in the last 30 days</SectionHeading>
                <ReleaseList items={data.newReleases ?? []} onWatched={setReleaseWatched} />
              </section>
              <UpcomingPanel items={nextUpcoming.slice(0, 6)} onFavorite={toggleFavorite} />
            </div>
            <Separator />
            <section className="home-summary" aria-labelledby="home-library-heading">
              <SectionHeading id="home-library-heading">Tracking summary</SectionHeading>
              <LibrarySummary data={data} />
            </section>
          </>
        ) : null}

        {activeView === "library" ? (
          <section aria-labelledby="library-heading">
            {selectedLibraryItem ? (
              <LibraryDetail
                item={selectedLibraryItem}
                onBack={closeLibraryTitle}
                onEpisodeWatched={setEpisodeWatched}
                onEpisodesWatched={setEpisodesWatched}
                onFavorite={toggleFavorite}
                onMovieWatched={setMovieWatched}
                onRemove={removeFromLibrary}
              />
            ) : (
              <>
                <ViewHeading id="library-heading" title="Your library" detail="Browse your tracked movies and shows, then open a title to manage its watch history." />
                <LibrarySummary data={data} />
                {libraryMessage ? <p className="library-operation-message" role="status">{libraryMessage}</p> : null}
                <div className="library-toolbar">
                  <label className="library-search">
                    <SearchIcon aria-hidden="true" />
                    <span className="sr-only">Search your library</span>
                    <Input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Search your library" />
                  </label>
                  <div className="library-toolbar-controls">
                    <ToggleGroup value={[libraryMediaType]} onValueChange={(values) => {
                      const next = values[0] as LibraryMediaFilter | undefined
                      if (next) setLibraryMediaType(next)
                    }} variant="outline" spacing={0} aria-label="Filter library by media type">
                      <ToggleGroupItem value="ALL">All</ToggleGroupItem>
                      <ToggleGroupItem value="SHOW">TV shows</ToggleGroupItem>
                      <ToggleGroupItem value="MOVIE">Movies</ToggleGroupItem>
                    </ToggleGroup>
                    <label className="library-sort">
                      <span>Sort by</span>
                      <NativeSelect value={librarySort} onChange={(event) => setLibrarySort(event.target.value as LibrarySort)} aria-label="Sort library">
                        <NativeSelectOption value="TITLE_ASC">Title A–Z</NativeSelectOption>
                        <NativeSelectOption value="LATEST_EPISODE_DESC">Newest episodes</NativeSelectOption>
                        <NativeSelectOption value="RELEASE_DESC">Newest title</NativeSelectOption>
                        <NativeSelectOption value="RELEASE_ASC">Oldest title</NativeSelectOption>
                      </NativeSelect>
                    </label>
                    {data.summary.duplicateEntries > 0 ? (
                      <AlertDialog open={duplicateCleanupOpen} onOpenChange={setDuplicateCleanupOpen}>
                        <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                          <Trash2Icon data-icon="inline-start" />Remove {data.summary.duplicateEntries} duplicate{data.summary.duplicateEntries === 1 ? "" : "s"}
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Clean up duplicate library entries?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Telly Tracker will keep the best provider-backed copy in each same-title, same-type, same-year group. Favorites and watch status are combined, and matching episode history is transferred before {data.summary.duplicateEntries} redundant {data.summary.duplicateEntries === 1 ? "entry is" : "entries are"} removed. Any group whose watch history cannot be transferred safely is left unchanged.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" disabled={cleaningDuplicates} onClick={removeDuplicateEntries}>
                              {cleaningDuplicates ? "Cleaning up…" : "Remove duplicates"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                    <p className="library-result-count" aria-live="polite">{visibleLibrary.length} {visibleLibrary.length === 1 ? "title" : "titles"}</p>
                  </div>
                </div>
                <div className="library-grid">
                  {visibleLibrary.map((item) => <LibraryCoverCard key={item.id} item={item} onOpen={openLibraryTitle} onFavorite={toggleFavorite} />)}
                  {visibleLibrary.length === 0 ? <p className="empty-copy library-empty">No tracked titles match those filters.</p> : null}
                </div>
              </>
            )}
          </section>
        ) : null}

        {activeView === "discover" ? (
          <section aria-labelledby="discover-heading">
            <ViewHeading id="discover-heading" title="Discover" detail="Search TMDB for a title to track, with TVmaze episode schedules when available." />
            <ProviderDiscovery onImported={onRefresh} />
            <h3 className="catalog-heading">From your catalog</h3>
            {syncMessage ? <p className="provider-message" role="status">{syncMessage}</p> : null}
            <div className="discover-rail">
              {data.discover.map((item) => (
                <article className="discover-item" key={item.id}>
                  <MediaArtwork className="discover-art" backdrop={item.backdrop} title={item.title} />
                  <div className="discover-copy">
                    <Badge variant="outline">{item.type === "SHOW" ? "Series" : "Movie"} · {new Date(item.releaseDate).getUTCFullYear()}</Badge>
                    <h3>{item.title}</h3><p>{item.synopsis}</p>
                    {item.syncError ? <p className="sync-error">Last sync failed</p> : null}
                  </div>
                  <div className="discover-actions">
                    {getImdbTitleUrl(item.imdbId) ? (
                      <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={getImdbTitleUrl(item.imdbId) ?? undefined} target="_blank" rel="noreferrer">
                        <ExternalLinkIcon data-icon="inline-start" />IMDb
                      </a>
                    ) : null}
                    {item.providerBacked ? (
                      <Button variant="ghost" size="icon" aria-label={`Refresh ${item.title} metadata`} disabled={refreshing === item.id} onClick={() => refreshMedia(item.id)}>
                        {refreshing === item.id ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
                      </Button>
                    ) : null}
                    <Button variant={item.inLibrary ? "secondary" : "outline"} disabled={item.inLibrary} onClick={() => addToLibrary(item.id)}>
                      {item.inLibrary ? <CheckIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
                      {item.inLibrary ? "Tracked" : "Track title"}
                    </Button>
                  </div>
                </article>
              ))}
              {data.discover.length === 0 ? <p className="empty-copy">No catalog titles are available.</p> : null}
            </div>
          </section>
        ) : null}

        {activeView === "release-calendar" ? (
          <section aria-labelledby="upcoming-page-heading">
            <ViewHeading
              id="upcoming-page-heading"
              title="Release calendar"
              detail={releaseWindowFilter === "UNWATCHED" ? "Every unwatched episode and movie across past, today, and future." : "Tracked episodes and movies from the last two weeks through the next two weeks."}
            />
            <div className="release-window-toolbar" aria-label="Release calendar filters">
              <ToggleGroup variant="outline" size="sm" spacing={0} value={[releaseWindowFilter]} onValueChange={(values) => {
                const next = values[0] as ReleaseWindowFilter | undefined
                if (next) {
                  if (next === "UNWATCHED") {
                    setUnwatchedReleasePage(emptyUnwatchedReleasePage)
                    setUnwatchedError(null)
                    setUnwatchedLoading(true)
                  }
                  setReleaseWindowFilter(next)
                }
              }}>
                <ToggleGroupItem value="ALL">All releases</ToggleGroupItem>
                <ToggleGroupItem value="UNWATCHED">Unwatched</ToggleGroupItem>
              </ToggleGroup>
              <div className="release-window-toolbar-actions">
                <span className="release-window-count">{releaseWindowFilter === "UNWATCHED"
                  ? unwatchedLoading && unwatchedReleasePage.items.length === 0
                    ? "Loading releases"
                    : `${unwatchedReleasePage.items.length} of ${unwatchedReleasePage.total} releases`
                  : `${releaseWindowItems.length} ${releaseWindowItems.length === 1 ? "release" : "releases"}`}</span>
                <AlertDialog open={recentReleaseDialogOpen} onOpenChange={setRecentReleaseDialogOpen}>
                  <AlertDialogTrigger render={<Button variant="outline" size="sm" />} disabled={markingRecentReleases || recentUnwatchedReleases.length === 0}>
                    {markingRecentReleases ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
                    Mark recent watched
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Mark {recentUnwatchedReleases.length} recent {recentUnwatchedReleases.length === 1 ? "release" : "releases"} watched?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This marks every unwatched episode and movie released during the last 14 days through today. Future releases will not change.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction disabled={markingRecentReleases} onClick={markRecentReleasesWatched}>
                        {markingRecentReleases ? "Marking…" : "Mark all watched"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            {releaseWindowMessage ? <p className="release-window-message" role="status">{releaseWindowMessage}</p> : null}
            <ReleaseWindowGrid
              items={releaseWindowItems}
              onFavorite={toggleFavorite}
              referenceDate={currentDate}
              emptyMessage={releaseWindowFilter === "UNWATCHED"
                ? unwatchedLoading
                  ? "Loading unwatched releases…"
                  : unwatchedError ?? "No unwatched releases remain in your tracked library."
                : "No tracked releases match this four-week window."}
            />
            {releaseWindowFilter === "UNWATCHED" && unwatchedError && releaseWindowItems.length > 0
              ? <p className="release-window-error" role="alert">{unwatchedError}</p>
              : null}
            {releaseWindowFilter === "UNWATCHED" && unwatchedReleasePage.nextCursor
              ? <div className="release-window-pagination">
                  <Button variant="outline" disabled={unwatchedLoading} onClick={loadMoreUnwatchedReleases}>
                    {unwatchedLoading ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : null}
                    {unwatchedLoading ? "Loading…" : "Load more"}
                  </Button>
                </div>
              : null}
            {releaseWindowFilter === "UNWATCHED" && unwatchedError && releaseWindowItems.length === 0 && !unwatchedLoading
              ? <div className="release-window-pagination">
                  <Button variant="outline" onClick={() => {
                    setUnwatchedError(null)
                    setUnwatchedLoading(true)
                    setUnwatchedReloadToken((value) => value + 1)
                  }}>Try again</Button>
                </div>
              : null}
          </section>
        ) : null}

        {activeView === "admin" && data.user.isAdmin ? <AdminPortal /> : null}
        {activeView === "account" ? <AccountSecurity /> : null}

        {activeView !== "admin" && activeView !== "account" ? <footer className="provider-credits" aria-label="Media data credits">
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" aria-label="The Movie Database">
            <img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_2-d537fb228cf3ded904ef09b136fe3fec72548ebc1fea3fbbd1ad9e36364db38b.svg" alt="TMDB" />
          </a>
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
          <p>Television episode data provided by <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer">TVmaze</a> under CC BY-SA.</p>
        </footer> : null}
      </main>
    </div>
  )
}

function ViewHeading({ id, title, detail }: { id: string; title: string; detail: string }) {
  return <header className="view-heading"><h1 id={id}>{title}</h1><p>{detail}</p></header>
}

function LibrarySummary({ data }: { data: DashboardData }) {
  return (
    <div className="summary-grid">
      <SummaryCard icon={TvIcon} count={data.summary.trackedShows} label="Series tracked" detail="Complete episode lists" />
      <SummaryCard icon={FilmIcon} count={data.summary.trackedMovies} label="Movies tracked" detail={`${data.summary.watchedMovies} marked watched`} />
      <SummaryCard icon={ListChecksIcon} count={data.summary.watchedEpisodes} label="Episodes watched" detail="Across every tracked series" />
      <SummaryCard icon={HeartIcon} count={data.summary.favorites} label="Favorites" detail="Pinned in your library" />
    </div>
  )
}

function LibraryCoverCard({ item, onOpen, onFavorite }: {
  item: LibraryItem
  onOpen: (event: MouseEvent<HTMLAnchorElement>, mediaId: string) => void
  onFavorite: (id: string, favorite: boolean) => Promise<void>
}) {
  const releasedEpisodes = item.episodes.filter((episode) => hasReleased(episode.airDate))
  const watchedReleased = releasedEpisodes.filter((episode) => episode.watched).length
  const schedule = getShowSchedule(item)
  return (
    <article className="library-cover-card">
      <a className="library-cover-link" href={`#library/${encodeURIComponent(item.id)}`} onClick={(event) => onOpen(event, item.id)} aria-label={`Open ${item.title}`}>
        <MediaArtwork className="library-poster" backdrop={item.poster || item.backdrop} title={item.title} />
        <span className="library-cover-gradient" aria-hidden="true" />
        <Badge className="library-cover-type" variant="secondary">{item.type === "SHOW" ? "TV show" : "Movie"}</Badge>
      </a>
      <Button className="library-cover-favorite" variant="secondary" size="icon" aria-label={`${item.favorite ? "Remove" : "Add"} ${item.title} ${item.favorite ? "from" : "to"} favorites`} onClick={() => onFavorite(item.id, item.favorite)}>
        <HeartIcon className={item.favorite ? "heart-filled" : ""} />
      </Button>
      <div className="library-cover-copy">
        <a href={`#library/${encodeURIComponent(item.id)}`} onClick={(event) => onOpen(event, item.id)}>{item.title}</a>
        <p>{formatYear(item.releaseDate)} · {item.type === "SHOW" ? `${watchedReleased} of ${releasedEpisodes.length} watched` : item.status === "WATCHED" ? "Watched" : "Not watched"}</p>
        {schedule ? <p className="library-cover-status"><CalendarDaysIcon aria-hidden="true" />{schedule.summary}</p> : null}
      </div>
    </article>
  )
}

function LibraryDetail({ item, onBack, onEpisodeWatched, onEpisodesWatched, onFavorite, onMovieWatched, onRemove }: {
  item: LibraryItem
  onBack: () => void
  onEpisodeWatched: (id: string, watched: boolean) => Promise<void>
  onEpisodesWatched: (ids: string[], watched: boolean) => Promise<void>
  onFavorite: (id: string, favorite: boolean) => Promise<void>
  onMovieWatched: (id: string, watched: boolean) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<Set<string>>(() => new Set())
  const selectionAnchorId = useRef<string | null>(null)
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [operationMessage, setOperationMessage] = useState<string | null>(null)
  const seasonGroups = useMemo(() => {
    const groups = new Map<number, Episode[]>()
    for (const episode of item.episodes) groups.set(episode.season, [...(groups.get(episode.season) ?? []), episode])
    return [...groups.entries()]
  }, [item.episodes])
  const releasedEpisodes = item.episodes.filter((episode) => hasReleased(episode.airDate))
  const watchedReleased = releasedEpisodes.filter((episode) => episode.watched).length
  const allReleasedWatched = releasedEpisodes.length > 0 && watchedReleased === releasedEpisodes.length
  const movieWatched = item.status === "WATCHED"
  const movieReleased = hasReleased(item.releaseDate)
  const imdbUrl = getImdbTitleUrl(item.imdbId)
  const schedule = getShowSchedule(item)

  function toggleEpisodeSelection(episodeId: string, selected: boolean, extendRange: boolean) {
    setSelectedEpisodeIds((current) => {
      const next = new Set(current)
      const anchorIndex = selectionAnchorId.current
        ? releasedEpisodes.findIndex((episode) => episode.id === selectionAnchorId.current)
        : -1
      const episodeIndex = releasedEpisodes.findIndex((episode) => episode.id === episodeId)
      if (extendRange && anchorIndex >= 0 && episodeIndex >= 0) {
        const start = Math.min(anchorIndex, episodeIndex)
        const end = Math.max(anchorIndex, episodeIndex)
        for (const episode of releasedEpisodes.slice(start, end + 1)) {
          if (selected) next.add(episode.id)
          else next.delete(episode.id)
        }
      } else {
        if (selected) next.add(episodeId)
        else next.delete(episodeId)
        selectionAnchorId.current = episodeId
      }
      return next
    })
  }

  function selectAllReleasedEpisodes() {
    selectionAnchorId.current = null
    setSelectedEpisodeIds(new Set(releasedEpisodes.map((episode) => episode.id)))
  }

  function clearEpisodeSelection() {
    selectionAnchorId.current = null
    setSelectedEpisodeIds(new Set())
  }

  function toggleSeasonSelection(episodes: Episode[]) {
    const releasedSeasonEpisodes = episodes.filter((episode) => hasReleased(episode.airDate))
    const allSelected = releasedSeasonEpisodes.length > 0 && releasedSeasonEpisodes.every((episode) => selectedEpisodeIds.has(episode.id))
    selectionAnchorId.current = null
    setSelectedEpisodeIds((current) => {
      const next = new Set(current)
      for (const episode of releasedSeasonEpisodes) {
        if (allSelected) next.delete(episode.id)
        else next.add(episode.id)
      }
      return next
    })
  }

  async function updateSelectedEpisodes(watched: boolean) {
    const episodeIds = [...selectedEpisodeIds]
    if (episodeIds.length === 0) return
    setBulkUpdating(true)
    setOperationMessage(null)
    try {
      await onEpisodesWatched(episodeIds, watched)
      clearEpisodeSelection()
      setOperationMessage(`${episodeIds.length} ${episodeIds.length === 1 ? "episode" : "episodes"} marked ${watched ? "watched" : "not watched"}.`)
    } catch (error) {
      setOperationMessage(error instanceof ApiError ? error.message : "Episode update failed")
    } finally {
      setBulkUpdating(false)
    }
  }

  async function markAllReleasedWatched() {
    const episodeIds = releasedEpisodes.filter((episode) => !episode.watched).map((episode) => episode.id)
    if (episodeIds.length === 0) return
    setBulkUpdating(true)
    setOperationMessage(null)
    try {
      await onEpisodesWatched(episodeIds, true)
      clearEpisodeSelection()
      setOperationMessage(`${episodeIds.length} ${episodeIds.length === 1 ? "episode" : "episodes"} marked watched across every aired season.`)
    } catch (error) {
      setOperationMessage(error instanceof ApiError ? error.message : "Episode update failed")
    } finally {
      setBulkUpdating(false)
    }
  }

  async function removeTitle() {
    setRemoving(true)
    setOperationMessage(null)
    try {
      await onRemove(item.id)
      setRemoveOpen(false)
      onBack()
    } catch (error) {
      setOperationMessage(error instanceof ApiError ? error.message : "Library removal failed")
    } finally {
      setRemoving(false)
    }
  }

  return (
    <article className="library-detail">
      <Button className="library-back" variant="ghost" onClick={onBack}><ArrowLeftIcon data-icon="inline-start" />Back to library</Button>
      <div className="library-detail-hero">
        <MediaArtwork className="library-detail-backdrop" backdrop={item.backdrop} />
        <div className="library-detail-shade" aria-hidden="true" />
        <MediaArtwork className="library-detail-poster" backdrop={item.poster || item.backdrop} title={item.title} />
        <div className="library-detail-copy">
          <Badge variant="secondary">{item.type === "SHOW" ? "TV show" : "Movie"} · {formatYear(item.releaseDate)}</Badge>
          <h1 id="library-heading">{item.title}</h1>
          <p className="library-detail-synopsis">{item.synopsis || "No synopsis is available yet."}</p>
          {item.type === "SHOW" ? (
            <>
              <p className="library-detail-progress">{watchedReleased} of {releasedEpisodes.length} released episodes watched · {item.episodes.length} known total</p>
              {schedule ? <p className="library-detail-status"><CalendarDaysIcon aria-hidden="true" /><span>{schedule.label}</span>{schedule.detail ? ` · ${schedule.detail}` : ""}</p> : null}
            </>
          ) : (
            <p className="library-detail-progress">{movieReleased ? `Released ${formatDate(item.releaseDate)}` : `Releases ${formatDate(item.releaseDate)}`}</p>
          )}
        </div>
        <div className="library-detail-actions">
          {imdbUrl ? (
            <a className={buttonVariants({ variant: "outline" })} href={imdbUrl} target="_blank" rel="noreferrer">
              <ExternalLinkIcon data-icon="inline-start" />IMDb
            </a>
          ) : null}
          {item.type === "MOVIE" ? (
            <Button variant={movieWatched ? "secondary" : "outline"} disabled={!movieReleased} onClick={() => onMovieWatched(item.id, !movieWatched)}>
              {movieWatched ? <CheckIcon data-icon="inline-start" /> : null}
              {movieReleased ? movieWatched ? "Watched" : "Mark watched" : "Not released"}
            </Button>
          ) : null}
          <Button variant="outline" aria-label={`${item.favorite ? "Remove" : "Add"} ${item.title} ${item.favorite ? "from" : "to"} favorites`} onClick={() => onFavorite(item.id, item.favorite)}>
            <HeartIcon data-icon="inline-start" className={item.favorite ? "heart-filled" : ""} />{item.favorite ? "Favorited" : "Favorite"}
          </Button>
          <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
            <AlertDialogTrigger render={<Button variant="ghost" />} aria-label={`Remove ${item.title} from library`}>
              <Trash2Icon data-icon="inline-start" />Remove
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {item.title}?</AlertDialogTitle>
                <AlertDialogDescription>This removes the title from your library. Episode watch history is kept in case you add it again.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={removing} onClick={removeTitle}>{removing ? "Removing…" : "Remove title"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {operationMessage ? <p className="library-operation-message" role="status">{operationMessage}</p> : null}
      {item.type === "SHOW" ? (
        <div className="episode-browser library-detail-episodes">
          <div className="episode-browser-heading"><div><span>Episode guide</span><h2>Every known episode</h2></div><p>{watchedReleased} watched · {releasedEpisodes.length - watchedReleased} available</p></div>
          {releasedEpisodes.length > 0 ? (
            <div className="episode-bulk-toolbar" aria-label="Bulk episode actions">
              <span>{selectedEpisodeIds.size} selected</span>
              <Button size="sm" variant="ghost" disabled={bulkUpdating || selectedEpisodeIds.size === releasedEpisodes.length} onClick={selectAllReleasedEpisodes}>Select released</Button>
              <Button size="sm" variant="ghost" disabled={bulkUpdating || selectedEpisodeIds.size === 0} onClick={clearEpisodeSelection}>Clear</Button>
              <p className="episode-range-hint">Shift-click to select a range</p>
              <div className="episode-bulk-actions">
                <Button size="sm" variant="outline" disabled={bulkUpdating || releasedEpisodes.length === 0 || allReleasedWatched} onClick={markAllReleasedWatched}>Mark all aired watched</Button>
                <Button size="sm" variant="outline" disabled={bulkUpdating || selectedEpisodeIds.size === 0} onClick={() => updateSelectedEpisodes(false)}>Mark not watched</Button>
                <Button size="sm" disabled={bulkUpdating || selectedEpisodeIds.size === 0} onClick={() => updateSelectedEpisodes(true)}>
                  {bulkUpdating ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <CheckIcon data-icon="inline-start" />}
                  Mark watched
                </Button>
              </div>
            </div>
          ) : null}
          {seasonGroups.map(([season, episodes]) => (
            <section className="episode-season" key={season} aria-labelledby={`${item.id}-season-${season}`}>
              <div className="episode-season-heading">
                <h4 id={`${item.id}-season-${season}`}>{season === 0 ? "Specials" : `Season ${season}`}</h4>
                {episodes.some((episode) => hasReleased(episode.airDate)) ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={bulkUpdating}
                    aria-label={`${episodes.filter((episode) => hasReleased(episode.airDate)).every((episode) => selectedEpisodeIds.has(episode.id)) ? "Clear" : "Select all released episodes in"} ${season === 0 ? "Specials" : `Season ${season}`}`}
                    onClick={() => toggleSeasonSelection(episodes)}
                  >
                    {episodes.filter((episode) => hasReleased(episode.airDate)).every((episode) => selectedEpisodeIds.has(episode.id)) ? "Clear season" : "Select all"}
                  </Button>
                ) : null}
              </div>
              <div className="episode-list">
                {episodes.map((episode) => (
                  <EpisodeRow
                    key={episode.id}
                    episode={episode}
                    selected={selectedEpisodeIds.has(episode.id)}
                    onSelectedChange={(selected, extendRange) => toggleEpisodeSelection(episode.id, selected, extendRange)}
                    onWatched={onEpisodeWatched}
                  />
                ))}
              </div>
            </section>
          ))}
          {item.episodes.length === 0 ? <p className="empty-copy">No episode schedule is available from TVmaze yet.</p> : null}
        </div>
      ) : null}
    </article>
  )
}

function EpisodeRow({ episode, selected, onSelectedChange, onWatched }: {
  episode: Episode
  selected: boolean
  onSelectedChange: (selected: boolean, extendRange: boolean) => void
  onWatched: (id: string, watched: boolean) => Promise<void>
}) {
  const released = hasReleased(episode.airDate)
  const extendRange = useRef(false)
  return (
    <article className="episode-row">
      <Checkbox
        checked={selected}
        disabled={!released}
        onPointerDown={(event) => { extendRange.current = event.shiftKey }}
        onKeyDown={() => { extendRange.current = false }}
        onCheckedChange={(checked) => {
          onSelectedChange(checked === true, extendRange.current)
          extendRange.current = false
        }}
        aria-label={`Select ${episode.title}`}
      />
      <span className="episode-number">S{episode.season} E{episode.number}</span>
      <div><h5>{episode.title}</h5><time dateTime={episode.airDate}>{formatDate(episode.airDate)}{episode.runtime > 0 ? ` · ${episode.runtime} min` : ""}</time></div>
      <Badge variant={episode.watched ? "secondary" : "outline"}>{episode.watched ? "Watched" : released ? isRecent(episode.airDate) ? "New" : "Available" : "Upcoming"}</Badge>
      <Button size="sm" variant={episode.watched ? "secondary" : "outline"} disabled={!released} onClick={() => onWatched(episode.id, !episode.watched)}>
        {episode.watched ? <CheckIcon data-icon="inline-start" /> : null}
        {released ? episode.watched ? "Watched" : "Mark watched" : "Not aired"}
      </Button>
    </article>
  )
}

function ReleaseList({ items, onWatched }: { items: ReleaseItem[]; onWatched: (item: ReleaseItem) => Promise<void> }) {
  return (
    <div className="release-list">
      {items.map((item) => (
        <article className="release-row" key={`${item.kind}:${item.id}`}>
          <MediaArtwork className="upcoming-art" backdrop={item.backdrop} title={item.title} />
          <div className="upcoming-copy">
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            <time dateTime={item.date}>{formatDate(item.date)}</time>
          </div>
          <Button size="sm" variant={item.watched ? "secondary" : "outline"} onClick={() => onWatched(item)}>
            {item.watched ? <CheckIcon data-icon="inline-start" /> : null}{item.watched ? "Watched" : "Mark watched"}
          </Button>
        </article>
      ))}
      {items.length === 0 ? <p className="empty-copy">No tracked titles were released in the last 30 days.</p> : null}
    </div>
  )
}

function UpcomingPanel({ items, onFavorite }: {
  items: UpcomingItem[]
  onFavorite: (id: string, favorite: boolean) => Promise<void>
}) {
  return (
    <section className="upcoming-panel" aria-labelledby="upcoming-heading">
      <SectionHeading id="upcoming-heading">Coming next</SectionHeading>
      <div className="timeline">
        {items.map((item) => <UpcomingRow key={item.id} item={item} onFavorite={onFavorite} />)}
        {items.length === 0 ? <p className="empty-copy">No upcoming releases are scheduled.</p> : null}
      </div>
    </section>
  )
}

function ReleaseWindowGrid({ items, onFavorite, referenceDate, emptyMessage }: {
  items: UpcomingItem[]
  onFavorite: (id: string, favorite: boolean) => Promise<void>
  referenceDate: Date
  emptyMessage: string
}) {
  return (
    <div className="release-window-grid">
      {items.map((item) => {
        const relative = formatReleaseDistance(item.date, referenceDate)
        return (
          <article className="release-window-card" data-period={relative.period} key={item.id}>
            <div className="release-window-visual">
              <MediaArtwork className="release-window-art" backdrop={item.backdrop} title={item.title} />
              <Badge className="release-window-status" variant={relative.period === "today" ? "default" : "secondary"}>{relative.label}</Badge>
              <Button className="release-window-favorite" variant="ghost" size="icon" aria-label={`${item.favorite ? "Remove" : "Add"} ${item.title} ${item.favorite ? "from" : "to"} favorites`} onClick={() => onFavorite(item.mediaId, item.favorite)}>
                <HeartIcon className={item.favorite ? "heart-filled" : ""} />
              </Button>
            </div>
            <div className="release-window-copy">
              <time dateTime={item.date}>{formatWeekdayDate(item.date)}</time>
              <h2>{item.title}</h2>
              <p>{item.detail}</p>
            </div>
          </article>
        )
      })}
      {items.length === 0 ? <p className="empty-copy release-window-empty">{emptyMessage}</p> : null}
    </div>
  )
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return <h2 id={id} className="section-heading">{children} <ChevronRightIcon aria-hidden="true" /></h2>
}

function UpcomingRow({ item, onFavorite }: { item: UpcomingItem; onFavorite: (id: string, favorite: boolean) => Promise<void> }) {
  const date = new Date(item.date)
  return (
    <article className="upcoming-row">
      <time dateTime={item.date}><span>{date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}</span>{date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</time>
      <div className="timeline-dot" aria-hidden="true" /><MediaArtwork className="upcoming-art" backdrop={item.backdrop} title={item.title} />
      <div className="upcoming-copy"><h3>{item.title}</h3><Badge variant="secondary">{item.detail}</Badge></div>
      <Button variant="ghost" size="icon" aria-label={`${item.favorite ? "Remove" : "Add"} ${item.title} ${item.favorite ? "from" : "to"} favorites`} onClick={() => onFavorite(item.mediaId, item.favorite)}>
        <HeartIcon className={item.favorite ? "heart-filled" : ""} />
      </Button>
    </article>
  )
}

function SummaryCard({ icon: Icon, count, label, detail }: { icon: typeof CalendarDaysIcon; count: number; label: string; detail: string }) {
  return (
    <Card size="sm" className="summary-card">
      <CardHeader>
        <div className="summary-icon"><Icon aria-hidden="true" /></div>
        <div className="summary-copy">
          <CardTitle>{label}</CardTitle>
          <span className="summary-count">{count}</span>
          <CardDescription>{detail}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  )
}

function hasReleased(date: string) {
  return new Date(date).getTime() <= Date.now()
}

function latestLibraryActivityTime(item: LibraryItem) {
  if (item.type === "MOVIE") return new Date(item.releaseDate).getTime()
  let latest = new Date(item.releaseDate).getTime()
  for (const episode of item.episodes) {
    const episodeTime = new Date(episode.airDate).getTime()
    if (episodeTime <= Date.now() && episodeTime > latest) latest = episodeTime
  }
  return latest
}

function getShowSchedule(item: LibraryItem) {
  if (item.type !== "SHOW") return null
  const nextEpisode = item.episodes
    .filter((episode) => !hasReleased(episode.airDate))
    .reduce<Episode | null>((next, episode) => !next || new Date(episode.airDate) < new Date(next.airDate) ? episode : next, null)
  if (nextEpisode) {
    const relative = formatFutureDistance(nextEpisode.airDate)
    return {
      label: "Next episode",
      detail: `${formatDate(nextEpisode.airDate)} · ${relative}`,
      summary: `Next ${formatShortDate(nextEpisode.airDate)} · ${relative}`,
    }
  }

  const status = item.productionStatus?.trim() ?? ""
  const normalizedStatus = status.toLowerCase()
  if (normalizedStatus.includes("ended") || normalizedStatus.includes("cancel")) {
    const label = normalizedStatus.includes("cancel") ? "Canceled" : "Ended"
    return {
      label,
      detail: item.endDate ? formatDate(item.endDate) : null,
      summary: item.endDate ? `${label} · ${formatShortDate(item.endDate)}` : label,
    }
  }
  if (!status && item.episodes.length === 0) {
    return { label: "No schedule data", detail: null, summary: "No schedule data" }
  }

  const latestReleasedEpisode = item.episodes
    .filter((episode) => hasReleased(episode.airDate))
    .reduce<Episode | null>((latest, episode) => !latest || new Date(episode.airDate) > new Date(latest.airDate) ? episode : latest, null)
  const twoYearsAgo = Date.now() - 730 * 24 * 60 * 60 * 1000
  if (latestReleasedEpisode && new Date(latestReleasedEpisode.airDate).getTime() < twoYearsAgo) {
    return {
      label: "Long hiatus",
      detail: `No new episode since ${formatDate(latestReleasedEpisode.airDate)} · status unconfirmed`,
      summary: "Long hiatus · status unconfirmed",
    }
  }

  const label = displayProductionStatus(status)
  return {
    label,
    detail: "No upcoming date announced",
    summary: `${label} · no upcoming date`,
  }
}

function displayProductionStatus(status: string) {
  if (!status) return "No schedule data"
  if (status.toLowerCase() === "to be determined") return "Status pending"
  return status
}

function formatFutureDistance(date: string) {
  const days = Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
  if (days === 0) return "today"
  if (days === 1) return "tomorrow"
  if (days < 14) return `in ${days} days`
  const weeks = Math.round(days / 7)
  return `in ${weeks} ${weeks === 1 ? "week" : "weeks"}`
}

function formatReleaseDistance(date: string, referenceDate: Date): { label: string; period: "past" | "today" | "future" } {
  const days = releaseDayOffset(date, referenceDate)
  if (days === 0) return { label: "Today", period: "today" }
  if (days === -1) return { label: "Yesterday", period: "past" }
  if (days === 1) return { label: "Tomorrow", period: "future" }
  const distance = formatCalendarDistance(Math.abs(days))
  if (days < 0) return { label: `${distance} ago`, period: "past" }
  return { label: `In ${distance}`, period: "future" }
}

function releaseDayOffset(date: string, referenceDate: Date) {
  const release = new Date(date)
  const releaseDay = Date.UTC(release.getUTCFullYear(), release.getUTCMonth(), release.getUTCDate())
  const today = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  return Math.round((releaseDay - today) / (24 * 60 * 60 * 1000))
}

function isInCalendarWindow(date: string, referenceDate: Date) {
  const days = releaseDayOffset(date, referenceDate)
  return days >= -14 && days <= 14
}

function isRecentlyReleased(date: string, referenceDate: Date) {
  const days = releaseDayOffset(date, referenceDate)
  return days >= -14 && days <= 0
}

function formatCalendarDistance(days: number) {
  if (days < 14) return `${days} days`
  if (days < 60) {
    const weeks = Math.round(days / 7)
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`
  }
  if (days < 730) {
    const months = Math.round(days / 30)
    return `${months} ${months === 1 ? "month" : "months"}`
  }
  const years = Math.round(days / 365)
  return `${years} ${years === 1 ? "year" : "years"}`
}

function unwatchedReleasePath(cursor?: string) {
  const parameters = new URLSearchParams()
  if (cursor) parameters.set("cursor", cursor)
  const suffix = parameters.toString()
  return `/api/releases/unwatched${suffix ? `?${suffix}` : ""}`
}

function isRecent(date: string) {
  return new Date(date).getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

function formatShortDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
}

function formatWeekdayDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })
}

function formatYear(date: string) {
  return new Date(date).getUTCFullYear()
}

function getImdbTitleUrl(imdbId: string | null) {
  return imdbId && /^tt\d+$/.test(imdbId) ? `https://www.imdb.com/title/${imdbId}/` : null
}
