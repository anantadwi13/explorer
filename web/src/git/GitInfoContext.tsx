import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from '../api/client'
import type { GitInfo } from '../api/types'
import { GitStatusProvider } from './GitStatusContext'

// GitInfoCtx caches the once-per-load /api/git/info response. Working-tree
// status (staged/unstaged/untracked, changes count, per-path classification)
// lives in the sibling GitStatusContext so the two fetches can be reasoned
// about independently. The GitInfoProvider mounts GitStatusProvider as a
// nested child so callers only wrap with one provider.
export interface GitInfoCtxValue {
  // null while the initial /api/git/info fetch is in flight.
  info: GitInfo | null
}

const GitInfoCtx = createContext<GitInfoCtxValue | null>(null)

interface ProviderProps {
  children: ReactNode
}

export function GitInfoProvider({ children }: ProviderProps) {
  const [info, setInfo] = useState<GitInfo | null>(null)

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

  const value = useMemo<GitInfoCtxValue>(() => ({ info }), [info])

  return (
    <GitInfoCtx.Provider value={value}>
      <GitStatusProvider>{children}</GitStatusProvider>
    </GitInfoCtx.Provider>
  )
}

// useGitInfo returns the cached /api/git/info response. When invoked outside
// a <GitInfoProvider> (some tests render components in isolation), it returns
// a stable `info: null` value rather than throwing — every consumer already
// has to handle the "fetch in flight" branch where `info` is null anyway, so
// the missing-provider case routes through the same code path.
export function useGitInfo(): GitInfoCtxValue {
  const ctx = useContext(GitInfoCtx)
  if (!ctx) return { info: null }
  return ctx
}
