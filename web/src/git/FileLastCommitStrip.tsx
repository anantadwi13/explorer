import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as api from '../api/client'
import type { GitCommitSummary } from '../api/types'
import { useGitInfo } from './GitInfoContext'
import { useGitStatus, type PathStatus } from './GitStatusContext'
import { formatRelative } from '../components/format'
import './FileLastCommitStrip.css'

interface Props {
  path: string
}

// FileLastCommitStrip renders the per-file "last commit" row between the
// file head and the content area when the served root is a git repo. Three
// states, all governed by the path's working-tree status plus a single
// /api/git/commits?path=<path>&limit=1 lookup:
//
//   - clean tracked:    [sha · subject · author · time] + History
//   - modified locally: status pill above + same commit summary + History
//   - untracked:        status pill + "No commits yet" + History (no fetch)
//
// The strip is intentionally independent of the body's load/error state —
// it should render the same way whether the file content fetched cleanly
// or hit one of the typed error states (too_large / not_utf8 / etc.).
export default function FileLastCommitStrip({ path }: Props) {
  const { info } = useGitInfo()
  const { status: rawStatus, pathStatus } = useGitStatus()
  const [params] = useSearchParams()
  const activeRef = params.get('ref') ?? undefined

  const status: PathStatus = pathStatus(path)
  const [commit, setCommit] = useState<GitCommitSummary | null>(null)
  const [fetched, setFetched] = useState(false)
  const [empty, setEmpty] = useState(false)

  // The commits fetch is gated on the status fetch having resolved. Firing
  // earlier would issue an `/api/git/commits?path=…` request for paths the
  // user marks as `untracked` (see the spec scenario: SPA SHALL NOT issue
  // the limit=1 request for untracked files). `rawStatus !== null` is the
  // discriminator that tells us the bucket is now authoritative.
  useEffect(() => {
    setCommit(null)
    setFetched(false)
    setEmpty(false)
    if (!info || !info.is_repo) return
    if (rawStatus === null) return
    if (status === 'untracked') return
    let cancelled = false
    api.getGitCommits({ ref: activeRef, path, limit: 1 }).then((res) => {
      if (cancelled) return
      setFetched(true)
      if (res.ok) {
        if (res.data.commits.length === 0) setEmpty(true)
        else setCommit(res.data.commits[0])
      } else {
        // Treat any fetch failure (including unknown_ref on a stale ref) as
        // an empty result for strip purposes — the user still gets History.
        setEmpty(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [info, rawStatus, status, path, activeRef])

  if (!info || !info.is_repo) return null

  const historyHref = buildHistoryHref(path, activeRef)
  const showPill = status === 'staged' || status === 'unstaged' || status === 'untracked'

  // Loading: we know we'll fetch but haven't yet, AND we're not in the
  // untracked branch. Render a low-key placeholder so the layout stays put.
  const noCommitState = status === 'untracked' || empty
  const loading = !noCommitState && !fetched

  // The strip lays out as two rows for both desktop and mobile so the
  // pill never lives on a row of its own. Top row is the commit summary;
  // bottom row is the action band [pill?] [History]. The two-row shape
  // makes the History pill predictable to target and keeps the desktop
  // and mobile layouts identical (a regression the previous design caused
  // — desktop showed pill-above-summary, mobile showed pill on its own
  // line, and the History link's position shifted between viewports).
  return (
    <div className="file-last-commit-strip" data-status={status}>
      <div className="file-last-commit-body">
        {loading ? (
          <span className="file-last-commit-loading" aria-busy="true">Loading commit…</span>
        ) : noCommitState ? (
          <span className="file-last-commit-empty">No commits yet</span>
        ) : (
          commit && <CommitSummary commit={commit} />
        )}
      </div>
      <div className="file-last-commit-actions">
        {showPill && (
          <span className={`file-last-commit-pill pill-${status === 'untracked' ? 'untracked' : 'modified'}`}>
            <span className="file-last-commit-pill-dot" aria-hidden="true">●</span>
            {status === 'untracked' ? 'Untracked' : 'Modified locally'}
          </span>
        )}
        <Link to={historyHref} className="file-last-commit-history" aria-label="View history for this file">
          History
        </Link>
      </div>
    </div>
  )
}

function CommitSummary({ commit }: { commit: GitCommitSummary }) {
  return (
    <span className="file-last-commit-summary">
      <Link to={`/git/commits/${commit.sha}`} className="file-last-commit-sha">{commit.short_sha}</Link>
      <span className="file-last-commit-sep" aria-hidden="true">·</span>
      <Link to={`/git/commits/${commit.sha}`} className="file-last-commit-subject" title={commit.subject}>
        {commit.subject}
      </Link>
      <span className="file-last-commit-sep" aria-hidden="true">·</span>
      <span className="file-last-commit-author">{commit.author_name}</span>
      <span className="file-last-commit-sep" aria-hidden="true">·</span>
      <span className="file-last-commit-time" title={commit.author_time}>{formatRelative(commit.author_time)}</span>
    </span>
  )
}

function buildHistoryHref(path: string, ref?: string): string {
  const qs = new URLSearchParams()
  qs.set('path', path)
  if (ref) qs.set('ref', ref)
  return `/git/commits?${qs.toString()}`
}
