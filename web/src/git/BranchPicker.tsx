import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../api/client'
import type { GitRefs } from '../api/types'
import { useGitInfo } from './GitInfoContext'
import { useGitStatus } from './GitStatusContext'
import './BranchPicker.css'

// BranchPicker renders a button that opens a dropdown listing branches and
// tags. The button label reflects the current HEAD state:
//   - On a branch: branch name
//   - Detached: "Detached at <short_sha>"
//   - Empty repo: "(no commits)"
// Selecting a ref navigates to /git/commits?ref=<encoded>. The dropdown also
// exposes "View commits" (current ref) and "Local changes" entries.
export default function BranchPicker() {
  const { info } = useGitInfo()
  const { changesCount } = useGitStatus()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const activeRef = params.get('ref')

  const [open, setOpen] = useState(false)
  const [refs, setRefs] = useState<GitRefs | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Click-outside to close.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Lazy-load refs on first open. We don't pre-fetch on mount — that would
  // hit /api/git/refs even for users who never open the picker.
  useEffect(() => {
    if (open && refs === null) {
      api.getGitRefs().then((res) => {
        if (res.ok) setRefs(res.data)
      })
    }
  }, [open, refs])

  if (!info || !info.is_repo) return null

  const label = (() => {
    if (info.head_ref) return info.head_ref.replace(/^refs\/heads\//, '')
    if (info.detached && info.head_sha) return `Detached at ${info.head_sha.slice(0, 7)}`
    return '(no commits)'
  })()

  const goToCommits = (ref?: string) => {
    setOpen(false)
    const qs = ref ? `?ref=${encodeURIComponent(ref)}` : ''
    navigate(`/git/commits${qs}`)
  }

  const goToStatus = () => {
    setOpen(false)
    navigate('/git/status')
  }

  return (
    <div className="branch-picker" ref={rootRef}>
      <button
        className="branch-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="branch-picker-icon" aria-hidden="true">⎇</span>
        <span className="branch-picker-label">{label}</span>
        <span className="branch-picker-chevron" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="branch-picker-menu" role="menu">
          <button className="branch-picker-item" onClick={() => goToCommits(activeRef ?? undefined)}>
            View commits
          </button>
          <button className="branch-picker-item" onClick={goToStatus}>
            Local changes{changesCount > 0 ? ` (${changesCount})` : ''}
          </button>

          {refs && refs.branches.length > 0 && (
            <>
              <div className="branch-picker-section">Branches</div>
              {refs.branches.map((b) => (
                <button
                  key={b.name}
                  className={`branch-picker-item ${activeRef === b.name ? 'is-active' : ''}`}
                  onClick={() => goToCommits(b.name)}
                >
                  {b.name}
                </button>
              ))}
            </>
          )}

          {refs && refs.tags.length > 0 && (
            <>
              <div className="branch-picker-section">Tags</div>
              {refs.tags.map((t) => (
                <button
                  key={t.name}
                  className={`branch-picker-item ${activeRef === t.name ? 'is-active' : ''}`}
                  onClick={() => goToCommits(t.name)}
                >
                  {t.name}
                </button>
              ))}
            </>
          )}

          {refs && refs.branches.length === 0 && refs.tags.length === 0 && (
            <div className="branch-picker-empty">No refs.</div>
          )}
          {refs === null && (
            <div className="branch-picker-empty">Loading…</div>
          )}
        </div>
      )}
    </div>
  )
}
