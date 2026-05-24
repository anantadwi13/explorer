import { useCallback, useEffect, useState } from 'react'
import * as api from '../api/client'
import type { GitFileHeader, GitHunk, GitPatch, GitPatchSource } from '../api/types'
import { formatSize } from '../components/format'
import { extToLanguage } from '../components/syntax/grammars'
import DiffHunk from './DiffHunk'
import './FileDiffCard.css'

interface Props {
  file: GitFileHeader
  source: GitPatchSource
  sha?: string
  // Render with the hunks pre-expanded on first paint (used by the auto-expand
  // logic in commit-detail and status views for the first 3 files).
  autoExpand?: boolean
  // Page-level wrap preference, propagated to each rendered DiffHunk. Comes
  // from the shared `useWrap` hook on the parent page.
  wrap?: boolean
}

// FileDiffCard renders one file header with an expand/collapse toggle. On
// expand, it lazily fetches the first batch of hunks via /api/git/patch and
// renders them with the DiffHunk component. Binary files are always rendered
// in the non-expandable "Binary file changed" row.
export default function FileDiffCard({ file, source, sha, autoExpand = false, wrap = true }: Props) {
  const [expanded, setExpanded] = useState(autoExpand)
  const [hunks, setHunks] = useState<GitHunk[]>([])
  const [patch, setPatch] = useState<GitPatch | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const path = file.new_path ?? file.old_path ?? ''

  const fetchHunks = useCallback(async (offset: number) => {
    setLoading(true)
    const res = await api.getGitPatch({
      source,
      sha,
      path,
      hunkOffset: offset,
      hunkLimit: 3,
    })
    setLoading(false)
    if (res.ok) {
      setPatch(res.data)
      setHunks((prev) => (offset === 0 ? res.data.hunks : [...prev, ...res.data.hunks]))
    } else {
      setError(res.error.message || res.error.error)
    }
  }, [source, sha, path])

  useEffect(() => {
    if (expanded && hunks.length === 0 && !file.is_binary && !error) {
      fetchHunks(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const remaining = patch ? Math.max(0, patch.total_hunks - hunks.length) : 0

  if (file.is_binary) {
    return (
      <div className="filediff-card filediff-binary">
        <FileHeaderRow file={file} expandable={false} />
        <div className="filediff-binary-note">
          Binary file changed: {formatSize(file.old_size ?? 0)} → {formatSize(file.new_size ?? 0)}
        </div>
      </div>
    )
  }

  return (
    <div className={`filediff-card ${expanded ? 'is-expanded' : ''}`}>
      <button
        className="filediff-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <FileHeaderRow file={file} expandable={true} expanded={expanded} />
      </button>

      {expanded && (
        <div className="filediff-body">
          {error && <div className="filediff-error">Error: {error}</div>}
          {!error && hunks.map((h, i) => <DiffHunk key={i} hunk={h} language={extToLanguage(path)} wrap={wrap} />)}
          {patch?.more_available && (
            <button
              className="filediff-pager"
              onClick={() => patch.next_hunk_offset !== null && fetchHunks(patch.next_hunk_offset)}
              disabled={loading}
            >
              {loading ? 'Loading…' : `Load 3 more changes (${remaining} remaining)`}
            </button>
          )}
          {!error && hunks.length === 0 && !loading && (
            <div className="filediff-empty">No changes in this file.</div>
          )}
        </div>
      )}
    </div>
  )
}

interface HeaderRowProps {
  file: GitFileHeader
  expandable: boolean
  expanded?: boolean
}

function FileHeaderRow({ file, expandable, expanded }: HeaderRowProps) {
  const path = renderPath(file)
  const status = file.is_binary ? '●' : file.status
  return (
    <div className="filediff-header">
      {expandable && (
        <span className="filediff-chevron" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      )}
      <span className={`filediff-badge filediff-badge-${file.is_binary ? 'B' : file.status}`}>{status}</span>
      <span className="filediff-path">{path}</span>
      <span className="filediff-counts">
        <span className="filediff-add">+{file.additions}</span>
        <span className="filediff-del">−{file.deletions}</span>
      </span>
    </div>
  )
}

function renderPath(file: GitFileHeader): string {
  if (file.status === 'R' && file.old_path && file.new_path) {
    return `${file.old_path} → ${file.new_path}`
  }
  return file.new_path ?? file.old_path ?? ''
}
