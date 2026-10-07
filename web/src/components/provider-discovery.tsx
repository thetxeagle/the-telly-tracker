import { type FormEvent, useMemo, useState } from "react"
import { CheckIcon, DownloadIcon, ExternalLinkIcon, LoaderCircleIcon, SearchIcon } from "lucide-react"

import { MediaArtwork } from "@/components/media-artwork"
import { JsonLibraryImport } from "@/components/json-library-import"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api, ApiError } from "@/lib/api"
import type { ProviderSearchResult } from "@/lib/types"

type ProviderDiscoveryProps = {
  onImported: () => Promise<void>
}

type MediaTypeFilter = "ALL" | ProviderSearchResult["type"]

export function ProviderDiscovery({ onImported }: ProviderDiscoveryProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProviderSearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [imported, setImported] = useState<Set<string>>(() => new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<MediaTypeFilter>("ALL")
  const [releaseYear, setReleaseYear] = useState("ALL")
  const releaseYearItems = useMemo(() => {
    const years = Array.from(new Set(results.flatMap((result) => result.releaseDate ? [result.releaseDate.slice(0, 4)] : [])))
      .sort((left, right) => Number(right) - Number(left))
    return [{ label: "Any year", value: "ALL" }, ...years.map((year) => ({ label: year, value: year }))]
  }, [results])
  const filteredResults = useMemo(
    () => results.filter((result) => {
      const matchesType = mediaType === "ALL" || result.type === mediaType
      const matchesYear = releaseYear === "ALL" || result.releaseDate?.startsWith(releaseYear)
      return matchesType && matchesYear
    }),
    [mediaType, releaseYear, results]
  )

  async function search(event: FormEvent) {
    event.preventDefault()
    const normalized = query.trim()
    if (normalized.length < 2) return
    setSearching(true)
    setMessage(null)
    try {
      const response = await api<{ results: ProviderSearchResult[] }>(
        `/api/providers/search?q=${encodeURIComponent(normalized)}`
      )
      setResults(response.results)
      setReleaseYear("ALL")
      setSearched(true)
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Provider search failed")
    } finally {
      setSearching(false)
    }
  }

  async function importResult(result: ProviderSearchResult) {
    const key = `${result.type}:${result.tmdbId}`
    setImporting(key)
    setMessage(null)
    try {
      await api("/api/providers/import", {
        method: "POST",
        body: JSON.stringify({ type: result.type, tmdbId: result.tmdbId }),
      })
      setImported((current) => new Set(current).add(key))
      setMessage(`${result.title} is now being tracked.`)
      await onImported()
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Import failed")
    } finally {
      setImporting(null)
    }
  }

  return (
    <div className="provider-discovery">
      <JsonLibraryImport imported={imported} importing={importing} onTrack={importResult} />

      <div className="provider-search-divider"><span>or search one title</span></div>
      <form onSubmit={search}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="provider-search">Find movies and shows</FieldLabel>
            <div className="provider-search-row">
              <Input
                id="provider-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search TMDB"
                minLength={2}
                maxLength={100}
              />
              <Button type="submit" disabled={searching || query.trim().length < 2}>
                {searching ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <SearchIcon data-icon="inline-start" />}
                {searching ? "Searching" : "Search"}
              </Button>
            </div>
            <FieldDescription>Movies and shows come from TMDB; matchable episode schedules come from TVmaze.</FieldDescription>
          </Field>
        </FieldGroup>
      </form>

      {message ? <p className="provider-message" role="status">{message}</p> : null}
      {searched && results.length === 0 ? <p className="empty-copy">No provider titles matched that search.</p> : null}
      {results.length > 0 ? (
        <>
          <div className="provider-filter-bar">
            <FieldSet className="provider-filter-set">
              <FieldLegend variant="label">Type</FieldLegend>
              <ToggleGroup
                className="provider-type-toggle"
                value={[mediaType]}
                onValueChange={(values) => {
                  const next = values[0] as MediaTypeFilter | undefined
                  if (next) setMediaType(next)
                }}
                variant="outline"
                spacing={0}
                aria-label="Filter results by media type"
              >
                <ToggleGroupItem value="ALL">All</ToggleGroupItem>
                <ToggleGroupItem value="SHOW">TV shows</ToggleGroupItem>
                <ToggleGroupItem value="MOVIE">Movies</ToggleGroupItem>
              </ToggleGroup>
            </FieldSet>
            <Field className="provider-year-filter">
              <FieldLabel htmlFor="provider-release-year">Release year</FieldLabel>
              <NativeSelect
                id="provider-release-year"
                value={releaseYear}
                onChange={(event) => setReleaseYear(event.target.value)}
              >
                {releaseYearItems.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <p className="provider-result-count" aria-live="polite">
              Showing {filteredResults.length} of {results.length} {results.length === 1 ? "result" : "results"}
            </p>
          </div>
          {filteredResults.length === 0 ? <p className="empty-copy">No titles match those filters.</p> : (
            <div className="provider-results" aria-live="polite">
              {filteredResults.map((result) => {
                const key = `${result.type}:${result.tmdbId}`
                const pending = importing === key
                const complete = result.inLibrary || imported.has(key)
                return (
                  <article className="provider-result" key={key}>
                    <MediaArtwork className="provider-art" backdrop={result.backdrop} title={result.title} />
                    <div className="provider-result-copy">
                      <Badge variant="outline">
                        {result.type === "SHOW" ? "TV show" : "Movie"}
                        {result.releaseDate ? ` · ${result.releaseDate.slice(0, 4)}` : ""}
                      </Badge>
                      <h3>{result.title}</h3>
                      <p>{result.synopsis || "No synopsis is available yet."}</p>
                    </div>
                    <div className="provider-result-actions">
                      <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={getImdbSearchUrl(result)} target="_blank" rel="noreferrer">
                        <ExternalLinkIcon data-icon="inline-start" />Find on IMDb
                      </a>
                      <Button variant={complete ? "secondary" : "outline"} disabled={pending || complete} onClick={() => importResult(result)}>
                        {pending ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : complete ? <CheckIcon data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
                        {pending ? "Adding" : complete ? "Tracked" : "Track title"}
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

function getImdbSearchUrl(result: ProviderSearchResult) {
  const year = result.releaseDate?.slice(0, 4)
  return `https://www.imdb.com/find/?q=${encodeURIComponent(`${result.title}${year ? ` ${year}` : ""}`)}&s=tt`
}
