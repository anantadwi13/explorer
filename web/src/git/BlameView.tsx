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

  const [blame, setBlame] = useState<BlameResponse | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setBlame(null)
    setContent(null)
    setError(null)
    const blamePromise = api.getGitBlame({ path, ref: resolvedRef })
    const rawPromise = fetch('/raw/' + encodeURI(path)).then(async (r) => {
      if (!r.ok) return null
      try {
        const buf = await r.arrayBuffer()
        return new TextDecoder('utf-8', { fatal: false }).decode(buf)
      } catch {
        return null
      }
    })
    Promise.all([blamePromise, rawPromise]).then(([b, c]) => {
      if (cancelled) return
      setLoading(false)
      if (b.ok) {
        setBlame(b.data)
        setContent(c ?? '')
      } else {
        setError(b.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [path, resolvedRef])

  if (loading) return <div className="blame-state">Loading blame…</div>

  if (error) return <BlameError error={error} path={path} />
  if (!blame || content === null) return null

  // Pair blame chunks with the raw file bytes. The blame response is the
  // source of truth for line count (it was computed against the same bytes
  // we just fetched); a content/line mismatch is treated as best-effort and
  // shows empty lines for missing rows rather than crashing.
  const allLines = splitToLines(content)
  const language = extToLanguage(path)
  const useHljs = !!language && lowlight.registered(language)
  const gutterDigits = String(Math.max(1, blame.total_lines)).length

  return (
    <div className={`blame-view ${wrap ? 'wrap-on' : 'wrap-off'}`}>
      {blame.dirty && (
        <div className="blame-dirty-banner">
          <span className="blame-pill pill-modified">
            <span className="blame-pill-dot" aria-hidden="true">●</span>
            Modified locally
          </span>
        </div>
      )}
      <div className="blame-chunks">
        {blame.chunks.map((chunk, idx) => (
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
  chunk: BlameChunk
  lines: string[]
  useHljs: boolean
  language: string | null
  gutterDigits: number
}

function ChunkRow({ chunk, lines, useHljs, language, gutterDigits }: ChunkRowProps) {
  const uncommitted = isUncommittedChunk(chunk)
  const startLine = chunk.start_line
  return (
    <section className={`blame-chunk${uncommitted ? ' blame-chunk-uncommitted' : ''}`}>
      <div className="blame-chunk-meta">
        {uncommitted ? (
          <span className="blame-chunk-uncommitted-label">Working tree · uncommitted</span>
        ) : (
          <CommittedMeta chunk={chunk} />
        )}
      </div>
      <div
        className="blame-chunk-body"
        style={{ ['--blame-gutter-w' as string]: `${Math.max(2, gutterDigits) + 1}ch` }}
      >
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
    </section>
  )
}

function CommittedMeta({ chunk }: { chunk: BlameChunk }) {
  if (isUncommittedChunk(chunk)) return null
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
