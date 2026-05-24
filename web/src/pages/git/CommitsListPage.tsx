import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as api from '../../api/client'
import type { GitCommitSummary } from '../../api/types'
import { useGitInfo } from '../../git/GitInfoContext'
import { formatRelative } from '../../components/format'
import './CommitsListPage.css'

// CommitsListPage renders /api/git/commits as a list of commit cards with
// cursor-based pagination. The optional ?ref= query is forwarded to the API
// call so the same view serves any branch/tag.
export default function CommitsListPage() {
  const [params] = useSearchParams()
  const ref = params.get('ref') || undefined
  const { info } = useGitInfo()

  const [commits, setCommits] = useState<GitCommitSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Reset list when ref changes (e.g. user picks a different branch).
  const lastRef = useRef(ref)
  if (lastRef.current !== ref) {
    lastRef.current = ref
    setCommits([])
    setCursor(null)
    setError(null)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getGitCommits({ ref }).then((res) => {
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
  }, [ref])

  const loadOlder = async () => {
    if (!cursor || loading) return
    setLoading(true)
    const res = await api.getGitCommits({ ref, cursor })
    setLoading(false)
    if (res.ok) {
      setCommits((prev) => [...prev, ...res.data.commits])
      setCursor(res.data.next_cursor)
    }
  }

  if (!info || !info.is_repo) return null

  if (error) {
    return (
      <div className="commits-page">
        <h2>Commits {ref && <span className="commits-ref">on {ref}</span>}</h2>
        <p className="commits-empty">{error}</p>
      </div>
    )
  }

  return (
    <div className="commits-page">
      <h2>
        Commits {ref && <span className="commits-ref">on {ref}</span>}
      </h2>
      {commits.length === 0 && !loading && (
        <p className="commits-empty">No commits on this branch.</p>
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
      {cursor && (
        <button className="commits-pager" onClick={loadOlder} disabled={loading}>
          {loading ? 'Loading…' : 'Load older commits'}
        </button>
      )}
    </div>
  )
}
