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
  // Optional commit pin. When set, the strip renders the pinned variant:
  // fetches the pinned commit's metadata via /api/git/commit?sha=<full-sha>
  // (singular) instead of the working-tree `limit=1` lookup, suppresses the
  // Modified-locally / Untracked pills, and replaces them with a `Viewing
  // at <short-sha>` pill. History routes through with `&ref=<full-sha>`.
  pinnedRef?: string
}

// FileLastCommitStrip renders the per-file "last commit" row between the
// file head and the content area when the served root is a git repo. In
// working-tree mode there are three states governed by the path's
// working-tree status plus a single /api/git/commits?path=<path>&limit=1
// lookup:
//
//   - clean tracked:    [sha · subject · author · time] + History
//   - modified locally: status pill above + same commit summary + History
//   - untracked:        status pill + "No commits yet" + History (no fetch)
//
// In pinned mode (`pinnedRef` set), the strip fetches the pinned commit's
// metadata via /api/git/commit?sha=<full-sha> and shows the same per-file
// summary with a "Viewing at <short-sha>" pill instead of the working-tree
// pills. This preserves the "every file kind shows the strip" invariant
// even when the file viewer is rendering historical bytes.
//
// The strip is intentionally independent of the body's load/error state —
// it should render the same way whether the file content fetched cleanly
// or hit one of the typed error states (too_large / not_utf8 / etc.).
export default function FileLastCommitStrip({ path, pinnedRef }: Props) {
  const { info } = useGitInfo()
  const { status: rawStatus, pathStatus } = useGitStatus()
  const [params] = useSearchParams()
  const activeRef = params.get('ref') ?? undefined
  const isPinned = !!pinnedRef
  const pinnedShort = pinnedRef ? (pinnedRef.length > 7 ? pinnedRef.slice(0, 7) : pinnedRef) : ''

  const status: PathStatus = pathStatus(path)
  const [commit, setCommit] = useState<GitCommitSummary | null>(null)
  const [fetched, setFetched] = useState(false)
  const [empty, setEmpty] = useState(false)

  // The fetch shape depends on whether the strip is pinned:
  //   - Working-tree mode: gated on the status fetch having resolved (we don't
  //     query commits for untracked paths). Reuses /api/git/commits?path=…&limit=1.
  //   - Pinned mode: fetches /api/git/commit?sha=<full-sha> directly, ignoring
  //     working-tree status (the path was a real file at that commit, or it
  //     wasn't — the strip just shows the commit's metadata either way).
  useEffect(() => {
    setCommit(null)
    setFetched(false)
    setEmpty(false)
    if (!info || !info.is_repo) return
    let cancelled = false
    if (isPinned) {
      api.getGitCommit({ sha: pinnedRef!, fileLimit: 1 }).then((res) => {
        if (cancelled) return
        setFetched(true)
        if (res.ok) {
          // Reshape into a GitCommitSummary so the renderer below stays generic.
          setCommit({
            sha: res.data.sha,
            short_sha: res.data.short_sha,
            author_name: res.data.author_name,
            author_email: res.data.author_email,
            author_time: res.data.author_time,
            subject: res.data.subject,
            body: res.data.body,
          })
        } else {
          setEmpty(true)
        }
      })
      return () => { cancelled = true }
    }
    if (rawStatus === null) return
    if (status === 'untracked') return
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
  }, [info, rawStatus, status, path, activeRef, isPinned, pinnedRef])

  if (!info || !info.is_repo) return null

  const historyHref = buildHistoryHref(path, isPinned ? pinnedRef : activeRef)
  // Working-tree pills suppressed in pinned mode — the pinned pill takes
  // their slot instead.
  const showStatusPill = !isPinned && (status === 'staged' || status === 'unstaged' || status === 'untracked')

  // Loading: we know we'll fetch but haven't yet, AND we're not in the
  // untracked branch (working-tree only).
  const noCommitState = (!isPinned && status === 'untracked') || empty
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
        {isPinned && (
          <span className="file-last-commit-pill pill-pinned" role="status" aria-live="polite">
            <span className="file-last-commit-pill-dot" aria-hidden="true">●</span>
            Viewing at {pinnedShort}
          </span>
        )}
        {showStatusPill && (
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
