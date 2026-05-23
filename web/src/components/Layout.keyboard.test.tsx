import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Layout from './Layout'
import { GitInfoProvider } from '../git/GitInfoContext'
import * as api from '../api/client'

vi.mock('../api/client', async (orig) => {
  const actual = await orig<typeof import('../api/client')>()
  return {
    ...actual,
    getGitInfo: vi.fn(),
    getGitStatus: vi.fn(),
    getGitRefs: vi.fn(),
    getGitCommits: vi.fn(),
    getGitCommit: vi.fn(),
    getGitPatch: vi.fn(),
  }
})

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

function PlaceholderPage({ label }: { label: string }) {
  return <div>{label}</div>
}

function renderApp(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <GitInfoProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<PlaceholderPage label="home" />} />
            <Route path="view/*" element={<PlaceholderPage label="view" />} />
            <Route path="git/commits" element={<PlaceholderPage label="commits" />} />
            <Route path="git/commits/:sha" element={<PlaceholderPage label="commit-detail" />} />
            <Route path="git/status" element={<PlaceholderPage label="status" />} />
            <Route path="*" element={<LocationProbe />} />
          </Route>
        </Routes>
        <LocationProbe />
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

describe('keyboard shortcuts on git pages', () => {
  it('Escape on commit detail navigates to commits list, preserving ?ref=', async () => {
    renderApp(['/git/commits/abc1234?ref=feature%2Fx'])
    await screen.findAllByText('commit-detail')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      const loc = screen.getByTestId('location')
      expect(loc.textContent).toBe('/git/commits?ref=feature%2Fx')
    })
  })

  it('Backspace on commit detail navigates to commits list', async () => {
    renderApp(['/git/commits/abc1234'])
    await screen.findAllByText('commit-detail')
    fireEvent.keyDown(window, { key: 'Backspace' })
    await waitFor(() => {
      const loc = screen.getByTestId('location')
      expect(loc.textContent).toBe('/git/commits')
    })
  })

  it('Backspace on /git/commits is a no-op (does not navigate)', async () => {
    renderApp(['/git/commits'])
    await screen.findAllByText('commits')
    fireEvent.keyDown(window, { key: 'Backspace' })
    const loc = screen.getByTestId('location')
    expect(loc.textContent).toBe('/git/commits')
  })

  it('Slash is a no-op on git pages', async () => {
    renderApp(['/git/status'])
    await screen.findAllByText('status')
    fireEvent.keyDown(window, { key: '/' })
    const loc = screen.getByTestId('location')
    expect(loc.textContent).toBe('/git/status')
  })

  it('Escape on /git/commits falls back to / when no folder visited yet', async () => {
    renderApp(['/git/commits'])
    await screen.findAllByText('commits')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      const loc = screen.getByTestId('location')
      expect(loc.textContent).toBe('/')
    })
  })
})
