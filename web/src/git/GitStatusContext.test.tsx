import { describe, it, expect } from 'vitest'
import { classifyPath } from './pathStatus'
import type { GitStatus } from '../api/types'

// classifyPath is the pure helper backing useGitStatus().pathStatus. Tested
// directly to avoid render/mount overhead — the spec scenarios for the
// last-commit strip rely on each discriminator landing exactly.
describe('classifyPath', () => {
  const sample: GitStatus = {
    staged: [
      { status: 'A', old_path: null, new_path: 'a.txt', additions: 1, deletions: 0, is_binary: false },
      { status: 'R', old_path: 'old.go', new_path: 'new.go', additions: 0, deletions: 0, is_binary: false },
    ],
    unstaged: [
      { status: 'M', old_path: 'b.txt', new_path: 'b.txt', additions: 1, deletions: 1, is_binary: false },
    ],
    untracked: [{ path: 'notes.md' }],
  }

  it('returns clean for an absent path', () => {
    expect(classifyPath(sample, 'lib/x.go')).toBe('clean')
  })

  it('returns clean when status is null (not yet fetched)', () => {
    expect(classifyPath(null, 'anything')).toBe('clean')
  })

  it('returns staged for a path in the staged list', () => {
    expect(classifyPath(sample, 'a.txt')).toBe('staged')
  })

  it('returns staged for a renamed entry on either side of the rename', () => {
    expect(classifyPath(sample, 'new.go')).toBe('staged')
    expect(classifyPath(sample, 'old.go')).toBe('staged')
  })

  it('returns unstaged for a path in the unstaged list', () => {
    expect(classifyPath(sample, 'b.txt')).toBe('unstaged')
  })

  it('returns untracked for a path in the untracked list', () => {
    expect(classifyPath(sample, 'notes.md')).toBe('untracked')
  })
})
