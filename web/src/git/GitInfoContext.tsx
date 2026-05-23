import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from '../api/client'
import type { GitInfo, GitStatus } from '../api/types'

// GitInfoCtx is the top-level cache for /api/git/info (loaded once on SPA
// mount) and a derived view of the working-tree change count, which is
// refreshed lazily whenever someone calls `refreshStatus()`. The spec
// requires the SPA to render git affordances ONLY when `is_repo` is true,
// so every consumer first checks that field.
export interface GitInfoCtxValue {
  // null while the initial /api/git/info fetch is in flight.
  info: GitInfo | null
  // Number of staged + unstaged + untracked entries. -1 means "not yet
  // loaded"; the ChangesBadge component hides itself until it learns this.
  changesCount: number
  // Trigger a re-fetch of /api/git/status. Used by views that mutate the
  // implied state (e.g. after a hunk fetch reveals the working tree changed
  // out-of-band) — currently called from a focus listener in the provider.
  refreshStatus: () => Promise<void>
}

const GitInfoCtx = createContext<GitInfoCtxValue | null>(null)

interface ProviderProps {
  children: ReactNode
}

export function GitInfoProvider({ children }: ProviderProps) {
  const [info, setInfo] = useState<GitInfo | null>(null)
  const [changesCount, setChangesCount] = useState<number>(-1)

  // Load /api/git/info exactly once on mount.
  useEffect(() => {
    let cancelled = false
    api.getGitInfo().then((res) => {
      if (cancelled) return
      if (res.ok) setInfo(res.data)
      else setInfo({ is_repo: false })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    if (info && !info.is_repo) return
    const res = await api.getGitStatus()
    if (res.ok) {
      const total = countStatus(res.data)
      setChangesCount(total)
    }
  }, [info])

  // Once info loads and the served root is a repo, fetch status once so the
  // ChangesBadge can render with the correct count on first paint.
  useEffect(() => {
    if (!info || !info.is_repo) {
      setChangesCount(0)
      return
    }
    refreshStatus()
  }, [info, refreshStatus])

  const value = useMemo<GitInfoCtxValue>(() => ({
    info,
    changesCount,
    refreshStatus,
  }), [info, changesCount, refreshStatus])

  return <GitInfoCtx.Provider value={value}>{children}</GitInfoCtx.Provider>
}

export function useGitInfo(): GitInfoCtxValue {
  const ctx = useContext(GitInfoCtx)
  if (!ctx) {
    throw new Error('useGitInfo must be used inside <GitInfoProvider>')
  }
  return ctx
}

function countStatus(s: GitStatus): number {
  return s.staged.length + s.unstaged.length + s.untracked.length
}
