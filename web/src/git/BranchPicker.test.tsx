import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import BranchPicker from './BranchPicker'
import { GitInfoProvider } from './GitInfoContext'
import * as api from '../api/client'

vi.mock('../api/client', async () => {
  return {
    getGitInfo: vi.fn(),
    getGitRefs: vi.fn(),
    getGitStatus: vi.fn(),
  }
})

function renderWithProvider(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <GitInfoProvider>
        <BranchPicker />
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
  vi.mocked(api.getGitRefs).mockResolvedValue({
    ok: true,
    data: {
      branches: [{ name: 'main', sha: 'a'.repeat(40) }, { name: 'feature/x', sha: 'b'.repeat(40) }],
      tags: [{ name: 'v0.1.0', sha: 'c'.repeat(40) }],
    },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('BranchPicker', () => {
  it('renders nothing when /api/git/info reports is_repo: false', async () => {
    vi.mocked(api.getGitInfo).mockResolvedValueOnce({ ok: true, data: { is_repo: false } })
    const { container } = renderWithProvider()
    await waitFor(() => {
      expect(container.querySelector('.branch-picker')).toBeNull()
    })
  })

  it('shows the current branch name on the trigger', async () => {
    renderWithProvider()
    await screen.findByText('main')
  })

  it('shows Detached at <short_sha> when HEAD is detached', async () => {
    vi.mocked(api.getGitInfo).mockResolvedValueOnce({
      ok: true,
      data: { is_repo: true, head_ref: null, head_sha: 'deadbeef0123456789'.padEnd(40, '0'), detached: true },
    })
    renderWithProvider()
    await screen.findByText('Detached at deadbee')
  })

  it('shows "(no commits)" on empty repo', async () => {
    vi.mocked(api.getGitInfo).mockResolvedValueOnce({
      ok: true,
      data: { is_repo: true, head_ref: null, head_sha: null, detached: false },
    })
    renderWithProvider()
    await screen.findByText('(no commits)')
  })

  it('opens the dropdown and lists branches + tags in distinct sections', async () => {
    renderWithProvider()
    const trigger = await screen.findByText('main')
    await act(async () => {
      fireEvent.click(trigger)
    })
    await screen.findByText('Branches')
    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('v0.1.0')).toBeInTheDocument()
    expect(screen.getByText('feature/x')).toBeInTheDocument()
  })
})
