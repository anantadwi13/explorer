import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import * as api from '../../api/client'
import type { GitCommit, GitFileHeader } from '../../api/types'
import { useGitInfo } from '../../git/GitInfoContext'
import FileDiffCard from '../../git/FileDiffCard'
import { formatRelative } from '../../components/format'
import { WrapIcon } from '../../components/icons'
import { useWrap } from '../../hooks/useWrap'
import './CommitDetailPage.css'

// CommitDetailPage renders /api/git/commit. The header carries metadata
// (subject, body, author/committer, parents, summary). The file list shows
// up to 50 file-header cards; the first 3 auto-expand with pre-fetched hunks.
export default function CommitDetailPage() {
  const { sha = '' } = useParams()
  const [params] = useSearchParams()
  const ref = params.get('ref')
  const { info } = useGitInfo()
  const [wrap, setWrap] = useWrap()

  const [commit, setCommit] = useState<GitCommit | null>(null)
  const [files, setFiles] = useState<GitFileHeader[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setCommit(null)
    setFiles([])
    setError(null)
    api.getGitCommit({ sha, fileLimit: 50 }).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) {
        setCommit(res.data)
        setFiles(res.data.files)
        setNextOffset(res.data.next_file_offset)
      } else {
        setError(res.error.error === 'unknown_ref' ? `Unknown commit: ${sha}` : res.error.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [sha])

  const loadMoreFiles = async () => {
    if (nextOffset === null || loading) return
    setLoading(true)
    const res = await api.getGitCommit({ sha, fileOffset: nextOffset, fileLimit: 50 })
    setLoading(false)
    if (res.ok) {
      setFiles((prev) => [...prev, ...res.data.files])
      setNextOffset(res.data.next_file_offset)
    }
  }

  if (!info || !info.is_repo) return null

  if (error) {
    return (
      <div className="commit-detail-page">
        <p className="commit-detail-empty">{error}</p>
        <p>
          <Link to={`/git/commits${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`}>
            Back to commits
          </Link>
        </p>
      </div>
    )
  }

  if (!commit) {
    return <div className="commit-detail-page commit-detail-loading">Loading…</div>
  }

  const refQS = ref ? `?ref=${encodeURIComponent(ref)}` : ''

  return (
    <div className="commit-detail-page">
      <header className="commit-detail-header">
        <h2 className="commit-detail-subject">{commit.subject}</h2>
        {commit.body && (
          <pre className="commit-detail-body">{commit.body}</pre>
        )}
        <div className="commit-detail-meta">
          <span>{commit.author_name}</span>
          <span className="commit-detail-sha">{commit.short_sha}</span>
          <span title={commit.author_time}>{formatRelative(commit.author_time)}</span>
          {commit.committer_email !== commit.author_email && (
            <span className="commit-detail-committer">
              committed by {commit.committer_name}
            </span>
          )}
        </div>
        {commit.parents.length > 0 && (
          <div className="commit-detail-parents">
            Parents:{' '}
            {commit.parents.map((p, i) => (
              <span key={p}>
                {i > 0 && ', '}
                <Link to={`/git/commits/${p}${refQS}`} className="commit-detail-parent">
                  {p.slice(0, 7)}
                </Link>
              </span>
            ))}
          </div>
        )}
        <div className="commit-detail-summary">
          <span>
            {commit.total_files} files changed,{' '}
            <span className="commit-detail-add">+{commit.total_additions}</span>{' '}
            <span className="commit-detail-del">−{commit.total_deletions}</span>
          </span>
          <button
            className="icon-btn"
            onClick={() => setWrap(!wrap)}
            aria-pressed={wrap}
            aria-label={wrap ? 'Wrap lines: on' : 'Wrap lines: off'}
            title={wrap ? 'Wrap lines: on' : 'Wrap lines: off'}
          >
            <WrapIcon />
          </button>
        </div>
      </header>

      {files.length === 0 ? (
        <p className="commit-detail-empty">No file changes.</p>
      ) : (
        <div className="commit-detail-files">
          {files.map((f, i) => (
            <FileDiffCard
              key={(f.new_path ?? f.old_path ?? '') + ':' + i}
              file={f}
              source="commit"
              sha={commit.sha}
              autoExpand={i < 3}
              wrap={wrap}
            />
          ))}
          {nextOffset !== null && (
            <button className="commit-detail-pager" onClick={loadMoreFiles} disabled={loading}>
              {loading ? 'Loading…' : `Load next 50 files`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
