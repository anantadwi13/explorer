import { render, waitFor, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ChangesBadge from './ChangesBadge'
import { GitInfoProvider } from './GitInfoContext'
import * as api from '../api/client'

vi.mock('../api/client', async () => {
  return {
    getGitInfo: vi.fn(),
    getGitStatus: vi.fn(),
  }
})

function renderWithProvider() {
  return render(
    <MemoryRouter>
      <GitInfoProvider>
        <ChangesBadge />
      </GitInfoProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(api.getGitInfo).mockResolvedValue({
    ok: true,
    data: { is_repo: true, head_ref: 'refs/heads/main', head_sha: 'a'.repeat(40), detached: false },
  })
})

describe('ChangesBadge', () => {
  it('renders nothing when working tree is clean', async () => {
    vi.mocked(api.getGitStatus).mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [] },
    })
    const { container } = renderWithProvider()
    await waitFor(() => {
      expect(container.querySelector('.changes-badge')).toBeNull()
    })
  })

  it('renders the count when there are changes', async () => {
    vi.mocked(api.getGitStatus).mockResolvedValue({
      ok: true,
      data: {
        staged: [{ status: 'A', old_path: null, new_path: 'a.txt', additions: 1, deletions: 0, is_binary: false }],
        unstaged: [{ status: 'M', old_path: 'b.txt', new_path: 'b.txt', additions: 1, deletions: 1, is_binary: false }],
        untracked: [{ path: 'c.txt' }],
      },
    })
    renderWithProvider()
    await screen.findByText('3 changes')
  })

  it('renders nothing when not in a repo', async () => {
    vi.mocked(api.getGitInfo).mockResolvedValue({ ok: true, data: { is_repo: false } })
    const { container } = renderWithProvider()
    await waitFor(() => {
      expect(container.querySelector('.changes-badge')).toBeNull()
    })
  })
})
