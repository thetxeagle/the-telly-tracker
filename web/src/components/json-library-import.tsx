import { type ChangeEvent, type FormEvent, useRef, useState } from "react"
import {
  CheckIcon,
  DownloadIcon,
  FileJsonIcon,
  LoaderCircleIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"

import { MediaArtwork } from "@/components/media-artwork"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, ApiError } from "@/lib/api"
import { parseJsonLibraryImport, type JsonLibraryImportItem } from "@/lib/json-library-import"
import type { ProviderSearchResult } from "@/lib/types"

type ReviewItem = JsonLibraryImportItem & {
  id: string
  query: string
  results: ProviderSearchResult[]
  status: "idle" | "searching" | "ready" | "error"
  error: string | null
}

type JsonLibraryImportProps = {
  imported: Set<string>
  importing: string | null
  onTrack: (result: ProviderSearchResult) => Promise<void>
}

const MAX_FILE_SIZE = 2 * 1024 * 1024
const SEARCH_BATCH_SIZE = 25

export function JsonLibraryImport({ imported, importing, onTrack }: JsonLibraryImportProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const generationRef = useRef(0)
  const [fileName, setFileName] = useState("")
  const [items, setItems] = useState<ReviewItem[]>([])
  const [visibleCount, setVisibleCount] = useState(0)
  const [batchSearching, setBatchSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    generationRef.current += 1
    const generation = generationRef.current
    setMessage(null)
    setItems([])
    setVisibleCount(0)
    setBatchSearching(false)
    setFileName(file.name)

    if (file.size > MAX_FILE_SIZE) {
      setMessage("That file is larger than 2 MB. Split it into a smaller title list.")
      return
    }

    try {
      const parsed = parseJsonLibraryImport(await file.text())
      const reviewItems = parsed.map((item, index) => ({
        ...item,
        id: `${generation}-${index}`,
        query: item.title,
        results: [],
        status: "idle" as const,
        error: null,
      }))
      const firstBatch = reviewItems.slice(0, SEARCH_BATCH_SIZE)
      setItems(reviewItems)
      setVisibleCount(firstBatch.length)
      setMessage(`Found ${reviewItems.length} unique ${reviewItems.length === 1 ? "title" : "titles"}. Checking the first ${firstBatch.length} with TMDB.`)
      await searchBatch(firstBatch, generation, firstBatch.length, reviewItems.length)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The JSON file could not be read.")
    }
  }

  async function searchBatch(
    reviewItems: ReviewItem[],
    generation: number,
    reviewedCount: number,
    totalCount: number
  ) {
    setBatchSearching(true)
    let cursor = 0
    async function worker() {
      while (cursor < reviewItems.length) {
        const item = reviewItems[cursor]
        cursor += 1
        await searchItem(item, generation)
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, reviewItems.length) }, () => worker()))
    if (generation === generationRef.current) {
      setBatchSearching(false)
      setMessage(
        reviewedCount < totalCount
          ? `Reviewed ${reviewedCount} of ${totalCount} titles. Review these matches, then search the next batch when ready.`
          : `Reviewed all ${totalCount} titles. Nothing is added until you choose Track title.`
      )
    }
  }

  async function searchNextBatch() {
    const nextVisibleCount = Math.min(items.length, visibleCount + SEARCH_BATCH_SIZE)
    const nextBatch = items.slice(visibleCount, nextVisibleCount)
    setVisibleCount(nextVisibleCount)
    setMessage(`Checking titles ${visibleCount + 1}–${nextVisibleCount} with TMDB.`)
    await searchBatch(nextBatch, generationRef.current, nextVisibleCount, items.length)
  }

  async function searchItem(item: ReviewItem, generation = generationRef.current) {
    const normalized = item.query.trim()
    if (normalized.length < 2) return
    updateItem(item.id, { status: "searching", error: null })
    try {
      const response = await api<{ results: ProviderSearchResult[] }>(
        `/api/providers/search?q=${encodeURIComponent(normalized)}`
      )
      if (generation !== generationRef.current) return
      updateItem(item.id, {
        results: rankResults(response.results, item).slice(0, 4),
        status: "ready",
        error: null,
      })
    } catch (error) {
      if (generation !== generationRef.current) return
      updateItem(item.id, {
        results: [],
        status: "error",
        error: error instanceof ApiError ? error.message : "Provider search failed",
      })
    }
  }

  function submitItem(event: FormEvent, item: ReviewItem) {
    event.preventDefault()
    void searchItem(item)
  }

  function clearImport() {
    generationRef.current += 1
    setItems([])
    setVisibleCount(0)
    setBatchSearching(false)
    setFileName("")
    setMessage(null)
  }

  function updateItem(id: string, patch: Partial<ReviewItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  return (
    <section className="json-import" aria-labelledby="json-import-heading">
      <div className="json-import-heading">
        <div className="json-import-title">
          <span className="json-import-icon" aria-hidden="true"><FileJsonIcon /></span>
          <div>
            <h3 id="json-import-heading">Import a title list</h3>
            <p>Upload JSON, review TMDB matches in batches, then choose exactly what gets tracked.</p>
          </div>
        </div>
        <div className="json-import-actions">
          {items.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={clearImport}>
              <Trash2Icon data-icon="inline-start" />Clear
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <UploadIcon data-icon="inline-start" />{items.length > 0 ? "Choose another file" : "Import JSON"}
          </Button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={loadFile}
            aria-label="Choose a JSON title list"
          />
        </div>
      </div>

      <p className="json-import-help">
        Accepts an array of title strings or objects with <code>title</code>/<code>name</code>, optional <code>year</code>, and optional <code>type</code>. Compatible duplicates are combined automatically.
      </p>
      {message ? <p className="provider-message" role="status">{fileName ? `${fileName}: ` : ""}{message}</p> : null}

      {items.length > 0 ? (
        <div className="json-import-review">
          {items.slice(0, visibleCount).map((item, index) => (
            <article className="json-import-item" key={item.id}>
              <div className="json-import-item-heading">
                <span className="json-import-number">{index + 1}</span>
                <div>
                  <h4>{item.title}</h4>
                  <p>{[item.type === "SHOW" ? "TV show" : item.type === "MOVIE" ? "Movie" : null, item.year].filter(Boolean).join(" · ") || "Type and year not specified"}</p>
                </div>
              </div>
              <form className="json-import-search" onSubmit={(event) => submitItem(event, item)}>
                <Input
                  value={item.query}
                  onChange={(event) => updateItem(item.id, { query: event.target.value })}
                  aria-label={`Search query for ${item.title}`}
                  minLength={2}
                  maxLength={100}
                />
                <Button type="submit" variant="outline" size="sm" disabled={item.status === "searching" || item.query.trim().length < 2}>
                  {item.status === "searching" ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <SearchIcon data-icon="inline-start" />}
                  Search
                </Button>
              </form>

              {item.status === "error" ? <p className="json-import-error" role="alert">{item.error}</p> : null}
              {item.status === "ready" && item.results.length === 0 ? <p className="empty-copy">No close matches. Edit the search above and try again.</p> : null}
              {item.results.length > 0 ? (
                <div className="json-import-matches">
                  {item.results.map((result) => {
                    const key = `${result.type}:${result.tmdbId}`
                    const pending = importing === key
                    const complete = result.inLibrary || imported.has(key)
                    return (
                      <div className="json-import-match" key={key}>
                        <MediaArtwork className="json-import-art" backdrop={result.poster || result.backdrop} title={result.title} />
                        <div className="json-import-match-copy">
                          <Badge variant="outline">
                            {result.type === "SHOW" ? "TV show" : "Movie"}
                            {result.releaseDate ? ` · ${result.releaseDate.slice(0, 4)}` : ""}
                          </Badge>
                          <strong>{result.title}</strong>
                        </div>
                        <Button size="sm" variant={complete ? "secondary" : "outline"} disabled={pending || complete} onClick={() => onTrack(result)}>
                          {pending ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : complete ? <CheckIcon data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
                          {pending ? "Adding" : complete ? "Tracked" : "Track title"}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </article>
          ))}
          {visibleCount < items.length ? (
            <Button className="json-import-next" variant="outline" disabled={batchSearching} onClick={searchNextBatch}>
              {batchSearching ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <SearchIcon data-icon="inline-start" />}
              Search next {Math.min(SEARCH_BATCH_SIZE, items.length - visibleCount)}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function rankResults(results: ProviderSearchResult[], item: JsonLibraryImportItem) {
  const normalizedTitle = normalizeTitle(item.title)
  return results
    .filter((result) => !item.type || result.type === item.type)
    .map((result) => ({ result, score: scoreResult(result, normalizedTitle, item.year, item.type) }))
    .sort((left, right) => right.score - left.score)
    .map(({ result }) => result)
}

function scoreResult(
  result: ProviderSearchResult,
  title: string,
  year: string | null,
  type: JsonLibraryImportItem["type"]
) {
  const candidateTitle = normalizeTitle(result.title)
  let score = candidateTitle === title ? 100 : candidateTitle.startsWith(title) || title.startsWith(candidateTitle) ? 40 : candidateTitle.includes(title) || title.includes(candidateTitle) ? 20 : 0
  if (year && result.releaseDate?.startsWith(year)) score += 50
  if (type && result.type === type) score += 20
  return score
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}
