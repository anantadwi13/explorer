import type { ReactNode } from 'react'
import { useGitInfo } from './GitInfoContext'
import NoGitRepo from './NoGitRepo'

// GitGate wraps a /git/* page. While /api/git/info is in flight it renders a
// neutral loading line; once the result lands it either renders the children
// (when is_repo: true) or the NoGitRepo placeholder (when is_repo: false).
// Keeping this in one place means each page component can assume it has a
// valid GitInfo and doesn't need its own gate check.
interface Props {
  children: ReactNode
}

export default function GitGate({ children }: Props) {
  const { info } = useGitInfo()
  if (info === null) {
    return <div style={{ padding: '2rem', color: 'var(--color-text-muted, #888)' }}>Loading…</div>
  }
  if (!info.is_repo) {
    return <NoGitRepo />
  }
  return <>{children}</>
}
