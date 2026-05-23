import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import StatusPage from './StatusPage'
import { GitInfoProvider } from '../../git/GitInfoContext'
import * as api from '../../api/client'

vi.mock('../../api/client', async () => ({
  getGitInfo: vi.fn(),
  getGitStatus: vi.fn(),
  getGitPatch: vi.fn(),
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/git/status']}>
      <GitInfoProvider>
        <StatusPage />
      </GitInfoProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(api.getGitInfo).mockResolvedValue({
    ok: true,
    data: { is_repo: true, head_ref: 'refs/heads/main', head_sha: 'a'.repeat(40), detached: false },
  })
  vi.mocked(api.getGitPatch).mockResolvedValue({
    ok: true,
    data: { path: 'x', is_binary: false, total_hunks: 0, hunks: [], next_hunk_offset: null, more_available: false },
  })
})

describe('StatusPage', () => {
  it('renders Staged/Unstaged/Untracked sections with counts', async () => {
    vi.mocked(api.getGitStatus).mockResolvedValue({
      ok: true,
      data: {
        staged: [{ status: 'M', old_path: 'a.txt', new_path: 'a.txt', additions: 1, deletions: 0, is_binary: false }],
        unstaged: [{ status: 'M', old_path: 'b.txt', new_path: 'b.txt', additions: 0, deletions: 1, is_binary: false }],
        untracked: [{ path: 'c.txt' }],
      },
    })
    renderPage()
    await screen.findByText(/Staged \(1\)/)
    expect(screen.getByText(/Unstaged \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Untracked \(1\)/)).toBeInTheDocument()
    // Untracked entries are links to /view/<path> opening in a new tab.
    const untrackedLink = screen.getByRole('link', { name: 'c.txt' })
    expect(untrackedLink).toHaveAttribute('href', '/view/c.txt')
    expect(untrackedLink).toHaveAttribute('target', '_blank')
    expect(untrackedLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders the "No local changes" empty state', async () => {
    vi.mocked(api.getGitStatus).mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [] },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No local changes.')).toBeInTheDocument()
    })
  })
})
