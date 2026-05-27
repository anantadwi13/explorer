import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import FileLastCommitStrip from './FileLastCommitStrip'
import { GitInfoProvider } from './GitInfoContext'
import * as api from '../api/client'

vi.mock('../api/client', () => ({
  getGitInfo: vi.fn(),
  getGitStatus: vi.fn(),
  getGitCommits: vi.fn(),
}))

function renderStrip(path: string, entry = '/view/' + path) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <GitInfoProvider>
        <FileLastCommitStrip path={path} />
      </GitInfoProvider>
    </MemoryRouter>,
  )
}

const sampleCommit = {
  sha: 'a'.repeat(40),
  short_sha: 'aaaaaaa',
  author_name: 'Alice',
  author_email: 'a@example.com',
  author_time: new Date().toISOString(),
  subject: 'refactor: extract handler',
  body: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getGitInfo).mockResolvedValue({
    ok: true,
    data: { is_repo: true, head_ref: 'refs/heads/main', head_sha: 'a'.repeat(40), detached: false },
  })
})

describe('FileLastCommitStrip', () => {
  it('renders nothing when is_repo is false', async () => {
    vi.mocked(api.getGitInfo).mockResolvedValueOnce({ ok: true, data: { is_repo: false } })
    vi.mocked(api.getGitStatus).mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [] },
    })
    const { container } = renderStrip('src/x.go')
    // After info fetch resolves, the strip should still be empty.
    await waitFor(() => {
      expect(container.querySelector('.file-last-commit-strip')).toBeNull()
    })
  })

  it('renders the commit summary for a clean tracked file', async () => {
    vi.mocked(api.getGitStatus).mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [] },
    })
    vi.mocked(api.getGitCommits).mockResolvedValue({
      ok: true,
      data: { commits: [sampleCommit], next_cursor: null },
    })
    renderStrip('src/x.go')
    await screen.findByText('aaaaaaa')
    expect(screen.getByText('refactor: extract handler')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    // No "Modified locally" pill on a clean file.
    expect(screen.queryByText('Modified locally')).toBeNull()
  })

  it('renders the modified-locally pill above the summary', async () => {
    vi.mocked(api.getGitStatus).mockResolvedValue({
      ok: true,
      data: {
        staged: [],
        unstaged: [{ status: 'M', old_path: 'src/x.go', new_path: 'src/x.go', additions: 1, deletions: 0, is_binary: false }],
        untracked: [],
      },
    })
    vi.mocked(api.getGitCommits).mockResolvedValue({
      ok: true,
      data: { commits: [sampleCommit], next_cursor: null },
    })
    renderStrip('src/x.go')
    await screen.findByText('Modified locally')
    expect(await screen.findByText('aaaaaaa')).toBeInTheDocument()
  })

  it('renders the untracked state with "No commits yet" and no commits fetch', async () => {
    vi.mocked(api.getGitStatus).mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [{ path: 'notes.txt' }] },
    })
    vi.mocked(api.getGitCommits).mockResolvedValue({
      ok: true,
      data: { commits: [], next_cursor: null },
    })
    renderStrip('notes.txt')
    await screen.findByText('Untracked')
    expect(screen.getByText('No commits yet')).toBeInTheDocument()
    // Spec scenario: SPA SHALL NOT issue the limit=1 request for untracked files.
    await waitFor(() => {
      expect(vi.mocked(api.getGitCommits)).not.toHaveBeenCalled()
    })
  })

  it('encodes the path in the History link href', async () => {
    vi.mocked(api.getGitStatus).mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [] },
    })
    vi.mocked(api.getGitCommits).mockResolvedValue({
      ok: true,
      data: { commits: [sampleCommit], next_cursor: null },
    })
    renderStrip('internal/server/api.go')
    const history = await screen.findByRole('link', { name: /history/i })
    // URLSearchParams uses %2F for slashes — exactly what the spec asks for.
    expect(history.getAttribute('href')).toBe('/git/commits?path=internal%2Fserver%2Fapi.go')
  })

  it('forwards the active ?ref to the History link', async () => {
    vi.mocked(api.getGitStatus).mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [] },
    })
    vi.mocked(api.getGitCommits).mockResolvedValue({
      ok: true,
      data: { commits: [sampleCommit], next_cursor: null },
    })
    renderStrip('a.go', '/view/a.go?ref=feature%2Fx')
    const history = await screen.findByRole('link', { name: /history/i })
    expect(history.getAttribute('href')).toBe('/git/commits?path=a.go&ref=feature%2Fx')
  })
})
