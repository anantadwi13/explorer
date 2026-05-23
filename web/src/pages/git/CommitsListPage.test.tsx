import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CommitsListPage from './CommitsListPage'
import { GitInfoProvider } from '../../git/GitInfoContext'
import * as api from '../../api/client'

vi.mock('../../api/client', async () => ({
  getGitInfo: vi.fn(),
  getGitStatus: vi.fn(),
  getGitCommits: vi.fn(),
}))

import { Route, Routes } from 'react-router-dom'

function renderPage(path = '/git/commits') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GitInfoProvider>
        <Routes>
          <Route path="/git/commits" element={<CommitsListPage />} />
        </Routes>
      </GitInfoProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(api.getGitInfo).mockResolvedValue({
    ok: true,
    data: { is_repo: true, head_ref: 'refs/heads/main', head_sha: 'a'.repeat(40), detached: false },
  })
  vi.mocked(api.getGitStatus).mockResolvedValue({
    ok: true,
    data: { staged: [], unstaged: [], untracked: [] },
  })
})

describe('CommitsListPage', () => {
  it('renders commits returned by /api/git/commits', async () => {
    vi.mocked(api.getGitCommits).mockResolvedValue({
      ok: true,
      data: {
        commits: [
          { sha: 'a'.repeat(40), short_sha: 'aaaaaaa', author_name: 'Alice', author_email: 'a@x', author_time: new Date().toISOString(), subject: 'first', body: '' },
          { sha: 'b'.repeat(40), short_sha: 'bbbbbbb', author_name: 'Bob', author_email: 'b@x', author_time: new Date().toISOString(), subject: 'second', body: '' },
        ],
        next_cursor: null,
      },
    })
    renderPage()
    await screen.findByText('first')
    expect(screen.getByText('second')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('aaaaaaa')).toBeInTheDocument()
  })

  it('renders the empty state when there are no commits', async () => {
    vi.mocked(api.getGitCommits).mockResolvedValue({
      ok: true,
      data: { commits: [], next_cursor: null },
    })
    renderPage()
    await screen.findByText('No commits on this branch.')
  })

  it('shows the pager when next_cursor is set and loads more on click', async () => {
    vi.mocked(api.getGitCommits)
      .mockResolvedValueOnce({
        ok: true,
        data: {
          commits: [
            { sha: '1'.repeat(40), short_sha: '1111111', author_name: 'X', author_email: 'x@x', author_time: new Date().toISOString(), subject: 'page1', body: '' },
          ],
          next_cursor: '1'.repeat(40),
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          commits: [
            { sha: '2'.repeat(40), short_sha: '2222222', author_name: 'Y', author_email: 'y@x', author_time: new Date().toISOString(), subject: 'page2', body: '' },
          ],
          next_cursor: null,
        },
      })
    renderPage()
    const pager = await screen.findByRole('button', { name: /load older/i })
    await act(async () => {
      fireEvent.click(pager)
    })
    await waitFor(() => {
      expect(screen.getByText('page2')).toBeInTheDocument()
    })
  })

  it('passes ?ref= through to the API call', async () => {
    vi.mocked(api.getGitCommits).mockResolvedValue({
      ok: true,
      data: { commits: [], next_cursor: null },
    })
    renderPage('/git/commits?ref=feature%2Fx')
    await screen.findByText('No commits on this branch.')
    // Find at least one call carrying the encoded ref.
    const sawRef = vi.mocked(api.getGitCommits).mock.calls.some(
      ([params]) => params?.ref === 'feature/x',
    )
    expect(sawRef).toBe(true)
  })
})
