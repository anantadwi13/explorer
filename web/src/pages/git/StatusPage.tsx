import { useEffect, useState } from 'react'
import * as api from '../../api/client'
import type { GitStatus } from '../../api/types'
import { useGitInfo } from '../../git/GitInfoContext'
import FileDiffCard from '../../git/FileDiffCard'
import { WrapIcon } from '../../components/icons'
import { useWrap } from '../../hooks/useWrap'
import './StatusPage.css'

// StatusPage renders /api/git/status with three sections: Staged, Unstaged,
// Untracked. The first 3 entries across Staged + Unstaged auto-expand on
// first paint per the spec.
export default function StatusPage() {
  const { info } = useGitInfo()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wrap, setWrap] = useWrap()

  useEffect(() => {
    let cancelled = false
    api.getGitStatus().then((res) => {
      if (cancelled) return
      if (res.ok) setStatus(res.data)
      else setError(res.error.message)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!info || !info.is_repo) return null
  if (error) return <div className="status-page"><p className="status-empty">{error}</p></div>
  if (!status) return <div className="status-page status-loading">Loading…</div>

  const total = status.staged.length + status.unstaged.length + status.untracked.length
  if (total === 0) {
    return (
      <div className="status-page">
        <h2>Local changes</h2>
        <p className="status-empty">No local changes.</p>
      </div>
    )
  }

  // Auto-expand the first 3 across staged + unstaged in source order.
  // We track a running budget so each card knows whether to start expanded.
  let expandBudget = 3
  const shouldExpand = () => {
    if (expandBudget <= 0) return false
    expandBudget--
    return true
  }

  return (
    <div className="status-page">
      <div className="status-page-head">
        <h2>Local changes</h2>
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

      {status.staged.length > 0 && (
        <section>
          <h3>Staged ({status.staged.length})</h3>
          <div className="status-list">
            {status.staged.map((f, i) => (
              <FileDiffCard
                key={`s-${i}`}
                file={f}
                source="staged"
                autoExpand={shouldExpand()}
                wrap={wrap}
              />
            ))}
          </div>
        </section>
      )}

      {status.unstaged.length > 0 && (
        <section>
          <h3>Unstaged ({status.unstaged.length})</h3>
          <div className="status-list">
            {status.unstaged.map((f, i) => (
              <FileDiffCard
                key={`u-${i}`}
                file={f}
                source="unstaged"
                autoExpand={shouldExpand()}
                wrap={wrap}
              />
            ))}
          </div>
        </section>
      )}

      {status.untracked.length > 0 && (
        <section>
          <h3>Untracked ({status.untracked.length})</h3>
          <ul className="status-untracked">
            {status.untracked.map((u) => (
              <li key={u.path}>
                <a
                  href={`/view/${u.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="status-untracked-link"
                >
                  {u.path}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status.conflicted && status.conflicted.length > 0 && (
        <section>
          <h3>Conflicted ({status.conflicted.length})</h3>
          <ul className="status-untracked">
            {status.conflicted.map((c) => (
              <li key={c.path}>{c.path}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
