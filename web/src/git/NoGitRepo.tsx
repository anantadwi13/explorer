import { Link } from 'react-router-dom'

// NoGitRepo is rendered for any /git/* route when /api/git/info reported
// is_repo: false (i.e. the served root has no .git at its top level). The
// SPA also hides every git affordance in the toolbar/drawer in this state
// — see BranchPicker and ChangesBadge.
export default function NoGitRepo() {
  return (
    <div style={{ padding: '2rem', color: 'var(--color-text-muted, #888)' }}>
      <h2 style={{ marginTop: 0 }}>Not a git repository</h2>
      <p>
        The served root has no <code>.git</code> at its top level, so the git
        browsing surface is unavailable.
      </p>
      <p>
        <Link to="/">Back to the file browser</Link>
      </p>
    </div>
  )
}
