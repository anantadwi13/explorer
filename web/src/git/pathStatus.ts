import type { GitStatus } from '../api/types'

// PathStatus discriminates a single file's working-tree state for per-file
// affordances (the last-commit strip, the commits-list path-filter banner).
// `clean` covers both "tracked + unmodified" and "not present in the status
// response at all" — both are visually indistinguishable for callers.
export type PathStatus = 'clean' | 'staged' | 'unstaged' | 'untracked'

// classifyPath is the pure helper backing `useGitStatus().pathStatus`. Kept
// in its own module (away from the provider) so it can be tested directly
// without spinning up React and so react-refresh's "only export components"
// rule doesn't complain about mixed exports in the provider file.
//
// Order matters: untracked wins over modified (a path can't be both), and
// staged is checked before unstaged because both buckets surface the same
// "Modified locally" pill on the strip — once we've matched either we can
// short-circuit.
export function classifyPath(status: GitStatus | null, path: string): PathStatus {
  if (!status) return 'clean'
  for (const u of status.untracked) {
    if (u.path === path) return 'untracked'
  }
  if (status.conflicted) {
    for (const u of status.conflicted) {
      if (u.path === path) return 'unstaged'
    }
  }
  for (const f of status.staged) {
    if (f.new_path === path || f.old_path === path) return 'staged'
  }
  for (const f of status.unstaged) {
    if (f.new_path === path || f.old_path === path) return 'unstaged'
  }
  return 'clean'
}
