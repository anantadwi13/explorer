import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as api from '../../api/client'
import type { GitCommitSummary } from '../../api/types'
import { useGitInfo } from '../../git/GitInfoContext'
import { useGitStatus } from '../../git/GitStatusContext'
import { formatRelative } from '../../components/format'
import './CommitsListPage.css'

// CommitsListPage renders /api/git/commits as a list of commit cards with
// cursor-based pagination. The optional ?ref= query is forwarded to the API
// call so the same view serves any branch/tag. The optional ?path= query
// scopes the response to commits touching that single repo-relative file
// and surfaces a sticky filter banner with a [× clear] affordance.
export default function CommitsListPage() {
  const [params] = useSearchParams()
  const ref = params.get('ref') || undefined
  const path = params.get('path') || undefined
  const { info } = useGitInfo()
  const { status: rawStatus, pathStatus } = useGitStatus()

  const [commits, setCommits] = useState<GitCommitSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Reset list when ref or path changes. The lastKey ref captures both
  // dimensions in one comparator so the render-time reset stays a single
  // ref read/write — matches the pre-existing pattern in this file before
  // path was added.
  const lastKey = useRef(`${ref ?? ''}::${path ?? ''}`)
  const currentKey = `${ref ?? ''}::${path ?? ''}`
  if (lastKey.current !== currentKey) {
    lastKey.current = currentKey
    setCommits([])
    setCursor(null)
    setError(null)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getGitCommits({ ref, path }).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) {
        setCommits(res.data.commits)
        setCursor(res.data.next_cursor)
      } else {
        setError(res.error.error === 'unknown_ref' ? `Unknown ref: ${ref}` : res.error.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [ref, path])

  const loadOlder = async () => {
    if (!cursor || loading) return
    setLoading(true)
    const res = await api.getGitCommits({ ref, cursor, path })
    setLoading(false)
    if (res.ok) {
      setCommits((prev) => [...prev, ...res.data.commits])
      setCursor(res.data.next_cursor)
    }
  }

  if (!info || !info.is_repo) return null

  // Status row visibility is gated on the status fetch having resolved AND
  // a non-clean bucket; pathStatus() returns 'clean' both for genuinely-clean
  // paths and for "status not yet loaded" — we don't render the pill until
  // we have positive evidence, otherwise the row would flash and disappear.
  const status = path && rawStatus !== null ? pathStatus(path) : 'clean'
  const showModifiedPill = status === 'staged' || status === 'unstaged'
  const showUntracked = status === 'untracked'
  const clearHref = ref ? `/git/commits?ref=${encodeURIComponent(ref)}` : '/git/commits'

  if (error) {
    return (
      <div className="commits-page">
        <h2>Commits {ref && <span className="commits-ref">on {ref}</span>}</h2>
        {path && <PathFilterBanner path={path} clearHref={clearHref} />}
        <p className="commits-empty">{error}</p>
      </div>
    )
  }

  const empty = commits.length === 0 && !loading

  return (
    <div className="commits-page">
      <h2>
        Commits {ref && <span className="commits-ref">on {ref}</span>}
      </h2>
      {path && <PathFilterBanner path={path} clearHref={clearHref} />}
      {(showModifiedPill || showUntracked) && (
        <div className="commits-status-row">
          <span className={`commits-status-pill ${showUntracked ? 'pill-untracked' : 'pill-modified'}`}>
            <span className="commits-status-pill-dot" aria-hidden="true">●</span>
            {showUntracked ? 'Untracked' : 'Modified locally'}
          </span>
          {showUntracked && (
            <p className="commits-untracked-info">This file is not yet tracked by git.</p>
          )}
        </div>
      )}
      {empty && !path && (
        <p className="commits-empty">No commits on this branch.</p>
      )}
      {empty && path && !showUntracked && (
        <p className="commits-empty">No commits have touched <code>{path}</code> on this ref.</p>
      )}
      <ul className="commits-list">
        {commits.map((c) => (
          <li key={c.sha} className="commit-card">
            <Link to={`/git/commits/${c.sha}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`} className="commit-subject">
              {c.subject}
            </Link>
            <div className="commit-meta">
              <span className="commit-author">{c.author_name}</span>
              <span className="commit-sep">•</span>
              <span className="commit-sha">{c.short_sha}</span>
              <span className="commit-sep">•</span>
              <span className="commit-time" title={c.author_time}>{formatRelative(c.author_time)}</span>
            </div>
          </li>
        ))}
      </ul>
      {cursor && !showUntracked && (
        <button className="commits-pager" onClick={loadOlder} disabled={loading}>
          {loading ? 'Loading…' : 'Load older commits'}
        </button>
      )}
    </div>
  )
}

function PathFilterBanner({ path, clearHref }: { path: string; clearHref: string }) {
  return (
    <div className="commits-filter-banner">
      <span>
        Commits affecting <code className="commits-filter-path">{path}</code>
      </span>
      <Link to={clearHref} className="commits-filter-clear" aria-label="Clear path filter">
        × clear
      </Link>
    </div>
  )
}
