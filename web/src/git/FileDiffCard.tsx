import { useCallback, useEffect, useState } from 'react'
import * as api from '../api/client'
import type { GitFileHeader, GitHunk, GitPatch, GitPatchSource } from '../api/types'
import { formatSize } from '../components/format'
import { extToLanguage, lowlight } from '../components/syntax/grammars'
import DiffHunk from './DiffHunk'
import './FileDiffCard.css'

// viewLinkFor computes the file-viewer href for one diff entry. Returns null
// for entries that have no meaningful path (defensive — git-reader spec rules
// out empty file headers, but guard rather than crash).
//
// Link grammar per the git-reader spec's "Diff file headers link to the file
// at the commit" requirement:
//   • Commit-detail diff (sha set): `at=<full-sha>` (renamed old_path uses
//     `at=<full-sha>%5E` for the parent commit; new_path uses raw sha).
//   • Staged / unstaged diff (no sha): no `ref=` parameter — link points at
//     the working-tree view of the file.
//   • `view=` derived from kind: markdown → preview, text → code; image and
//     non-previewable kinds omit `view=` (the URL grammar has no tablist
//     value for them; the viewer's tolerant-parse rule handles absence).
//
// `pathOverride` lets the caller emit a different path than the diff entry's
// default — used by the rename branch to render both old_path and new_path
// as separate links pointing at different commits via the caret suffix.
function defaultViewForPath(path: string): string | null {
  const lower = path.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'preview'
  const lang = extToLanguage(path)
  if (lang && lowlight.registered(lang)) return 'code'
  // For .txt / unknown extensions, the file is still kind=text on the server
  // (extTable maps .txt → text/plain). Default to code so the link mounts the
  // Code tab — matches the file viewer's natural default for text kinds.
  // Images and non-previewable kinds aren't reliably distinguishable by name
  // here; the viewer falls back gracefully when `view=` is absent or invalid.
  if (lower.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) return null
  if (lower.match(/\.(zip|tar|gz|pdf)$/)) return null
  return 'code'
}

export interface ViewLink {
  url: string
  path: string
}

export function viewLinkFor(file: GitFileHeader, source: GitPatchSource, sha?: string, pathOverride?: string, refOverride?: string): ViewLink | null {
  const path = pathOverride ?? file.new_path ?? file.old_path ?? ''
  if (!path) return null
  const qs = new URLSearchParams()
  const view = defaultViewForPath(path)
  if (view) qs.set('view', view)
  // Commit-detail diffs carry a sha → emit `ref=<full-sha>`. Staged / unstaged
  // diffs (no sha) emit no `ref=` — link points at the working-tree view.
  if (source === 'commit' && sha) {
    qs.set('ref', refOverride ?? sha)
  }
  const query = qs.toString()
  return { url: '/view/' + path + (query ? '?' + query : ''), path }
}

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
        <FileHeaderRow file={file} source={source} sha={sha} expandable={false} />
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
        <FileHeaderRow file={file} source={source} sha={sha} expandable={true} expanded={expanded} />
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
  source: GitPatchSource
  sha?: string
  expandable: boolean
  expanded?: boolean
}

// stopExpandToggle prevents the surrounding <button.filediff-toggle> from
// firing when the user clicks a filename link. Without this, clicking the
// link both opens the new tab AND collapses/expands the diff card behind it.
function stopExpandToggle(e: React.MouseEvent) {
  e.stopPropagation()
}

function FileHeaderRow({ file, source, sha, expandable, expanded }: HeaderRowProps) {
  const status = file.is_binary ? '●' : file.status
  const isRename = file.status === 'R' && file.old_path && file.new_path
  // Rename: render old_path → new_path as two separate links pointing at the
  // parent commit (caret) and this commit respectively. Non-rename: single
  // link for the file's path.
  let pathContent: React.ReactNode
  if (isRename && file.old_path && file.new_path) {
    const oldLink = viewLinkFor(file, source, sha, file.old_path, sha ? sha + '^' : undefined)
    const newLink = viewLinkFor(file, source, sha, file.new_path)
    pathContent = (
      <>
        {oldLink ? (
          <a
            href={oldLink.url}
            className="filediff-path-link"
            target="_blank"
            rel="noopener noreferrer"
            onClick={stopExpandToggle}
          >
            {file.old_path}
          </a>
        ) : (
          file.old_path
        )}
        {' → '}
        {newLink ? (
          <a
            href={newLink.url}
            className="filediff-path-link"
            target="_blank"
            rel="noopener noreferrer"
            onClick={stopExpandToggle}
          >
            {file.new_path}
          </a>
        ) : (
          file.new_path
        )}
      </>
    )
  } else {
    const path = file.new_path ?? file.old_path ?? ''
    const link = viewLinkFor(file, source, sha)
    pathContent = link ? (
      <a
        href={link.url}
        className="filediff-path-link"
        target="_blank"
        rel="noopener noreferrer"
        onClick={stopExpandToggle}
      >
        {path}
      </a>
    ) : (
      path
    )
  }
  return (
    <div className="filediff-header">
      {expandable && (
        <span className="filediff-chevron" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      )}
      <span className={`filediff-badge filediff-badge-${file.is_binary ? 'B' : file.status}`}>{status}</span>
      <span className="filediff-path">{pathContent}</span>
      <span className="filediff-counts">
        <span className="filediff-add">+{file.additions}</span>
        <span className="filediff-del">−{file.deletions}</span>
      </span>
    </div>
  )
}
