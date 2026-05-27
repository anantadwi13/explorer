import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as api from '../api/client'
import type { ApiError, BlameResponse, BlameChunk } from '../api/types'
import { isUncommittedChunk } from '../api/types'
import { lowlight } from '../components/syntax/grammars'
import { extToLanguage } from '../components/syntax/grammars'
import { formatRelative } from '../components/format'
import type { Element, Root, Text } from 'hast'
import './BlameView.css'

// PendingChunk fills the metadata column while go-git's blame walk is still
// running. The blame call dominates wall-clock time (typically several
// seconds on a moderately-aged file because it traverses the commit DAG
// line-by-line), so the view shows the file content the moment /raw/
// resolves and overlays per-chunk attribution as it arrives. Distinct from
// BlameChunk so the renderer can branch on `loading: true` without
// pretending the chunk is uncommitted.
type PendingChunk = { start_line: number; line_count: number; loading: true }
type RenderChunk = BlameChunk | PendingChunk

function isPendingChunk(c: RenderChunk): c is PendingChunk {
  return (c as PendingChunk).loading === true
}

// Stale-while-revalidate state for /api/git/blame, keyed by `path::ref`.
//
//   • `blameCache`  — last-known-good results. Synchronously consulted on
//     mount, so a Code ↔ Blame tab swap renders the previously-fetched
//     chunks immediately (no "Computing blame…" flash, no re-pay of go-
//     git's multi-second walk).
//   • `inFlight`    — promises for requests that haven't settled yet. A
//     remount that lands while the originating fetch is still pending
//     awaits the SAME promise instead of firing a duplicate. This keeps
//     the contract "at most one /api/git/blame in flight per (path, ref)"
//     across the whole SPA, including across the unmount-while-pending
//     case (open Blame → instantly switch to Code → switch back; the
//     request started by the first open still completes and populates the
//     cache, and the second open awaits it).
//
// Cache invariants:
//   • In-memory only, lives as long as the SPA tab is open.
//   • Never auto-evicted — typical file count per session is small and the
//     payload is a few KB per file.
//   • Errors do NOT poison the cache: if a background fetch fails and we
//     have a cached entry, the cached entry stays and is shown. If the
//     fetch fails with no cache entry, the error placeholder renders.
const blameCache = new Map<string, BlameResponse>()
type BlameApiResult = Awaited<ReturnType<typeof api.getGitBlame>>
const inFlight = new Map<string, Promise<BlameApiResult>>()

function cacheKey(path: string, ref: string | undefined): string {
  return `${path}::${ref ?? 'HEAD'}`
}

// fetchBlame is the de-duplicating entry point for /api/git/blame. Multiple
// concurrent callers for the same key get the same Promise — the underlying
// HTTP request goes out once. The Promise is removed from `inFlight` the
// moment it settles (success or failure) so the *next* mount will trigger
// a fresh background refresh, matching the stale-while-revalidate intent.
function fetchBlame(path: string, ref: string | undefined): Promise<BlameApiResult> {
  const key = cacheKey(path, ref)
  const existing = inFlight.get(key)
  if (existing) return existing
  const p = api.getGitBlame({ path, ref }).then((res) => {
    if (res.ok) blameCache.set(key, res.data)
    return res
  }).finally(() => {
    // Clear *after* the cache write so a remount that arrives in the
    // micro-task between resolution and finalisation observes the result
    // through the cache rather than re-firing.
    inFlight.delete(key)
  })
  inFlight.set(key, p)
  return p
}

// __resetBlameCacheForTests is exported so test files can clear the module-
// level cache + in-flight maps between cases. NOT for production use —
// there is no in-app invalidation trigger today (the spec's "no live
// updates" non-goal stands; a page reload re-mounts the SPA and
// reinitialises both maps).
export function __resetBlameCacheForTests(): void {
  blameCache.clear()
  inFlight.clear()
}

interface Props {
  path: string
  // Optional explicit ref — pulled from the existing branch-picker state via
  // `?ref=` on the route. Absent → HEAD (the server defaults).
  ref?: string
  // Shared wrap preference from the file viewer's existing `useWrap` hook.
  // When false, lines scroll horizontally inside the code cell and the
  // line-number gutter (plus, on desktop, the metadata column) stay sticky
  // -left — mirrors the diff hunk gutter pattern.
  wrap?: boolean
}

// BlameView renders /api/git/blame paired with /raw/<path> line-by-line.
// Chunks group consecutive lines sharing one attribution; committed chunks
// link their sha and subject to /git/commits/<sha>; uncommitted chunks
// render the muted "Working tree · uncommitted" label.
//
// Per design.md Decision 8, the layout is three columns at ≥768px (metadata
// | gutter | code) and stacks the metadata above the line range below the
// breakpoint. Per-line syntax highlighting reuses the shared lowlight
// instance + extToLanguage helper, matching the diff renderer's
// per-line-approximation pattern.
export default function BlameView({ path, ref, wrap = true }: Props) {
  const [params] = useSearchParams()
  // Per design Decision 7, the route doesn't carry blame state — only the
  // active branch-picker ref. Honour it when the caller didn't override.
  const resolvedRef = ref ?? params.get('ref') ?? undefined

  // Seed blame state from the cache synchronously on mount so a re-open of
  // the Blame tab paints the previous chunks immediately. lazy-init form of
  // useState — runs once per (path, ref) combination, not on every render.
  const [blame, setBlame] = useState<BlameResponse | null>(
    () => blameCache.get(cacheKey(path, resolvedRef)) ?? null,
  )
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  // True iff we're showing cached chunks AND a background fetch is still
  // in flight. The "Refetching blame…" status row exposes that to the user
  // — they can otherwise mistake the cached chunks for the freshest state.
  // We deliberately do NOT set this on cold mounts: the "Computing blame…"
  // placeholder already tells them work is happening.
  const [refetching, setRefetching] = useState(false)

  // Two-track loading: /raw/ is local-disk-cheap and resolves in milliseconds;
  // /api/git/blame walks the commit DAG and routinely takes several seconds.
  // We render the file as soon as content is in hand and overlay the blame
  // chunks once the API call returns. The user can scroll, scroll-into-view
  // a line, and even copy text while the metadata is still computing.
  //
  // Blame uses a stale-while-revalidate cache (`blameCache`): if the key is
  // already cached we keep showing those chunks and fire a background fetch
  // that overwrites them on success. If not cached, the metadata column
  // renders the "Computing blame…" placeholder until the first fetch lands.
  useEffect(() => {
    let cancelled = false
    const key = cacheKey(path, resolvedRef)
    const cached = blameCache.get(key) ?? null
    // Reset to cached value (or null) so switching paths doesn't bleed the
    // previous file's chunks into the new file's view.
    setBlame(cached)
    setContent(null)
    // Clear error only when the cache has data to fall back on. A miss +
    // previous error would otherwise flicker the placeholder before the
    // fetch reports the new error.
    if (cached) setError(null)
    // "Refetching" status is shown only on warm mounts — on a cold mount the
    // chunk-level "Computing blame…" placeholder already conveys progress.
    setRefetching(cached !== null)
    fetch('/raw/' + encodeURI(path))
      .then(async (r) => {
        if (cancelled) return
        if (!r.ok) {
          setContent('')
          return
        }
        try {
          const buf = await r.arrayBuffer()
          setContent(new TextDecoder('utf-8', { fatal: false }).decode(buf))
        } catch {
          setContent('')
        }
      })
      .catch(() => {
        if (!cancelled) setContent('')
      })
    // `fetchBlame` de-dupes against any still-pending request for this key
    // — if the user just unmounted Blame mid-flight and re-mounted, they
    // join the original promise instead of triggering a duplicate. The
    // cache write happens inside fetchBlame on success; we only mirror to
    // local state here.
    fetchBlame(path, resolvedRef).then((b) => {
      if (cancelled) return
      setRefetching(false)
      if (b.ok) {
        setBlame(b.data)
        setError(null)
      } else if (!cached) {
        // No cached fallback — surface the error. Skip when we have cached
        // data so a transient backend hiccup doesn't blow away the view.
        setError(b.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [path, resolvedRef])

  // Untracked / timeout / oversize errors short-circuit the whole view — even
  // if /raw/ succeeded, the blame surface is the wrong place to render the
  // bytes alone. Surface the empty-state with a History pivot instead.
  if (error) return <BlameError error={error} path={path} />
  // Still waiting on the raw bytes — the chunk grid can't render without them.
  if (content === null) return <div className="blame-state">Loading file…</div>

  const allLines = splitToLines(content)
  const language = extToLanguage(path)
  const useHljs = !!language && lowlight.registered(language)
  // While blame is still pending we synthesize a single placeholder chunk
  // covering the entire file. The metadata column reads "Computing blame…"
  // and the line gutter + code render normally, so the user sees the file
  // immediately and watches the metadata fill in once the API returns.
  const chunks: RenderChunk[] = blame
    ? blame.chunks
    : [{ start_line: 1, line_count: allLines.length, loading: true }]
  const totalLines = blame ? blame.total_lines : allLines.length
  const gutterDigits = String(Math.max(1, totalLines)).length

  // The status bar groups the two "what's happening to this view" pills:
  // a Modified-locally indicator from the response itself, and a Refetching
  // indicator owned by this component while a background SWR call runs.
  // Rendered only when at least one pill applies, so a clean fully-loaded
  // view doesn't grow an empty header row.
  const showStatusBar = blame?.dirty || refetching

  return (
    <div className={`blame-view ${wrap ? 'wrap-on' : 'wrap-off'}`}>
      {showStatusBar && (
        <div className="blame-dirty-banner" role="status" aria-live="polite">
          {blame?.dirty && (
            <span className="blame-pill pill-modified">
              <span className="blame-pill-dot" aria-hidden="true">●</span>
              Modified locally
            </span>
          )}
          {refetching && (
            <span className="blame-pill pill-refetching">
              <span className="blame-pill-spinner" aria-hidden="true" />
              Refetching blame…
            </span>
          )}
        </div>
      )}
      <div className="blame-chunks" aria-busy={blame ? undefined : true}>
        {chunks.map((chunk, idx) => (
          <ChunkRow
            key={idx}
            chunk={chunk}
            lines={allLines.slice(chunk.start_line - 1, chunk.start_line - 1 + chunk.line_count)}
            useHljs={useHljs}
            language={language}
            gutterDigits={gutterDigits}
          />
        ))}
      </div>
    </div>
  )
}

interface ChunkRowProps {
  chunk: RenderChunk
  lines: string[]
  useHljs: boolean
  language: string | null
  gutterDigits: number
}

function ChunkRow({ chunk, lines, useHljs, language, gutterDigits }: ChunkRowProps) {
  const pending = isPendingChunk(chunk)
  const uncommitted = !pending && isUncommittedChunk(chunk)
  const startLine = chunk.start_line
  return (
    <section
      className={`blame-chunk${uncommitted ? ' blame-chunk-uncommitted' : ''}${pending ? ' blame-chunk-pending' : ''}`}
    >
      <div className="blame-chunk-meta">
        {pending ? (
          <span className="blame-chunk-pending-label" aria-busy="true">Computing blame…</span>
        ) : uncommitted ? (
          <span className="blame-chunk-uncommitted-label">Working tree · uncommitted</span>
        ) : (
          <CommittedMeta chunk={chunk} />
        )}
      </div>
      <div
        className="blame-chunk-body"
        style={{ ['--blame-gutter-w' as string]: `${Math.max(2, gutterDigits) + 1}ch` }}
      >
        {/* Single grid container per chunk so sticky-left applies relative
            to the scrolling body, not to each line's max-content bbox.
            `.blame-line` uses `subgrid` to inherit the parent's columns —
            matches the DiffHunk pattern and is what keeps the gutter pinned
            when the user scrolls horizontally in wrap-off mode. */}
        <div className="blame-chunk-lines">
          {lines.map((text, i) => {
            const n = startLine + i
            const content = useHljs && language ? highlightLine(text, language) : text || ' '
            return (
              <div key={i} className="blame-line">
                <span className="blame-gutter" aria-hidden="true">{n}</span>
                <span className={useHljs ? 'blame-line-text hljs' : 'blame-line-text'}>{content}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function CommittedMeta({ chunk }: { chunk: RenderChunk }) {
  if (isPendingChunk(chunk) || isUncommittedChunk(chunk)) return null
  const c = chunk.commit
  return (
    <div className="blame-chunk-meta-row">
      <Link to={`/git/commits/${c.sha}`} className="blame-meta-sha">{c.short_sha}</Link>
      <span className="blame-meta-sep" aria-hidden="true">·</span>
      <Link to={`/git/commits/${c.sha}`} className="blame-meta-subject" title={c.subject}>
        {c.subject}
      </Link>
      <span className="blame-meta-sep" aria-hidden="true">·</span>
      <span className="blame-meta-author">{c.author_name}</span>
      <span className="blame-meta-sep" aria-hidden="true">·</span>
      <span className="blame-meta-time" title={c.author_time}>{formatRelative(c.author_time)}</span>
    </div>
  )
}

function BlameError({ error, path }: { error: ApiError; path: string }) {
  if (error.error === 'not_found') {
    return (
      <div className="blame-state blame-empty">
        <p>This file is untracked. No blame available.</p>
        <Link to={`/git/commits?path=${encodeURIComponent(path)}`} className="blame-empty-cta">
          Open History
        </Link>
      </div>
    )
  }
  if (error.error === 'blame_timeout') {
    return (
      <div className="blame-state blame-empty">
        <p>Blame took too long for this file. Try the History view.</p>
        <Link to={`/git/commits?path=${encodeURIComponent(path)}`} className="blame-empty-cta">
          Open History
        </Link>
      </div>
    )
  }
  if (error.error === 'too_large') {
    return (
      <div className="blame-state blame-empty">
        <p>This file is too large to blame inline (over 5 MB).</p>
      </div>
    )
  }
  return (
    <div className="blame-state blame-empty" role="alert">
      <p>{error.message || 'Blame failed.'}</p>
    </div>
  )
}

// splitToLines mirrors the per-line rendering in `<CodeBlock>`: split on \n
// and drop a trailing empty entry caused by a file ending in `\n` so the
// rendered line count matches what the blame response reports.
function splitToLines(s: string): string[] {
  const out = s.split('\n')
  if (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

type HastNode = Root['children'][number]

function highlightLine(text: string, language: string): React.ReactNode {
  if (text === '') return ' '
  try {
    const result = lowlight.highlight(language, text)
    return result.children.map((child, i) => renderHast(child as HastNode, i))
  } catch {
    return text
  }
}

function renderHast(node: HastNode, key: number): React.ReactNode {
  if (node.type === 'text') return (node as Text).value
  if (node.type === 'element') {
    const el = node as Element
    const className = Array.isArray(el.properties?.className)
      ? (el.properties.className as string[]).join(' ')
      : undefined
    const children = el.children.map((child, i) => renderHast(child as HastNode, i))
    return <span key={key} className={className}>{children}</span>
  }
  return null
}
