import { Link } from 'react-router-dom'
import { useGitInfo } from './GitInfoContext'
import './ChangesBadge.css'

// ChangesBadge renders only when the working tree has at least one staged,
// unstaged, or untracked entry. Activating the badge navigates to /git/status.
export default function ChangesBadge() {
  const { info, changesCount } = useGitInfo()
  if (!info || !info.is_repo) return null
  if (changesCount <= 0) return null
  return (
    <Link to="/git/status" className="changes-badge" aria-label={`${changesCount} local changes`}>
      <span className="changes-badge-dot" aria-hidden="true">●</span>
      <span className="changes-badge-count">{changesCount} change{changesCount === 1 ? '' : 's'}</span>
    </Link>
  )
}
