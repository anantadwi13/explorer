import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from '../api/client'
import type { GitStatus } from '../api/types'
import { useGitInfo } from './GitInfoContext'
import { classifyPath, type PathStatus } from './pathStatus'

// Re-export so consumers continue to import the discriminator type from
// the context module alongside the hook. The implementation lives in
// `./pathStatus` so react-refresh stays happy about provider exports.
export type { PathStatus } from './pathStatus'

export interface GitStatusCtxValue {
  // null while the initial fetch is in flight or while `is_repo: false`.
  // Components MUST handle both cases — every consumer guards on the
  // GitInfoContext's repo-presence flag before reading this anyway.
  status: GitStatus | null
  // Total count of staged + unstaged + untracked entries. -1 means the
  // initial fetch has not resolved yet; affordances should hide rather
  // than render a 0-count flash.
  changesCount: number
  // Classify a single path. `clean` is the implicit bucket when the path
  // doesn't appear in any of the three lists — there's no positive evidence
  // either way (e.g. the file might not exist), and callers needing to
  // distinguish must check the API directly.
  pathStatus: (path: string) => PathStatus
  // Re-fetch /api/git/status. Currently invoked on demand (e.g. after a
  // route change that might have changed working-tree state); the spec's
  // "no live updates" non-goal explicitly forbids periodic polling.
  refresh: () => Promise<void>
}

const GitStatusCtx = createContext<GitStatusCtxValue | null>(null)

interface ProviderProps {
  children: ReactNode
}

export function GitStatusProvider({ children }: ProviderProps) {
  const { info } = useGitInfo()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [changesCount, setChangesCount] = useState<number>(-1)

  const refresh = useCallback(async () => {
    if (info && !info.is_repo) return
    const res = await api.getGitStatus()
    if (res.ok) {
      setStatus(res.data)
      setChangesCount(countStatus(res.data))
    }
  }, [info])

  // Fetch /api/git/status once the repo gate is known. The fetch is gated on
  // is_repo so non-repo workspaces never hit the endpoint.
  useEffect(() => {
    if (!info) return
    if (!info.is_repo) {
      setStatus(null)
      setChangesCount(0)
      return
    }
    refresh()
  }, [info, refresh])

  const pathStatus = useCallback(
    (path: string): PathStatus => classifyPath(status, path),
    [status],
  )

  const value = useMemo<GitStatusCtxValue>(
    () => ({ status, changesCount, pathStatus, refresh }),
    [status, changesCount, pathStatus, refresh],
  )

  return <GitStatusCtx.Provider value={value}>{children}</GitStatusCtx.Provider>
}

// useGitStatus returns the cached /api/git/status response. When invoked
// outside a <GitStatusProvider> (isolated component tests, storybook), it
// returns a stable "no status yet" value rather than throwing. Mirrors the
// permissive useGitInfo() behaviour.
export function useGitStatus(): GitStatusCtxValue {
  const ctx = useContext(GitStatusCtx)
  if (!ctx) {
    return {
      status: null,
      changesCount: -1,
      pathStatus: () => 'clean',
      refresh: async () => {},
    }
  }
  return ctx
}

function countStatus(s: GitStatus): number {
  return s.staged.length + s.unstaged.length + s.untracked.length
}
