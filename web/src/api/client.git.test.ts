import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './client'

type FetchMock = ReturnType<typeof vi.fn>

let fetchMock: FetchMock

beforeEach(() => {
  fetchMock = vi.fn()
  // @ts-expect-error global mock
  globalThis.fetch = fetchMock
})

afterEach(() => {
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('git api client', () => {
  it('getGitInfo hits /api/git/info', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ is_repo: false }))
    const res = await api.getGitInfo()
    expect(fetchMock).toHaveBeenCalledWith('/api/git/info')
    expect(res.ok).toBe(true)
  })

  it('getGitRefs hits /api/git/refs', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ branches: [], tags: [] }))
    const res = await api.getGitRefs()
    expect(fetchMock).toHaveBeenCalledWith('/api/git/refs')
    expect(res.ok).toBe(true)
  })

  it('getGitCommits with no params requests bare /api/git/commits', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ commits: [], next_cursor: null }))
    await api.getGitCommits()
    expect(fetchMock).toHaveBeenCalledWith('/api/git/commits')
  })

  it('getGitCommits encodes ref with slashes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ commits: [], next_cursor: null }))
    await api.getGitCommits({ ref: 'feature/x', limit: 10 })
    expect(fetchMock).toHaveBeenCalledWith('/api/git/commits?ref=feature%2Fx&limit=10')
  })

  it('getGitCommits passes cursor', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ commits: [], next_cursor: null }))
    await api.getGitCommits({ cursor: 'abc1234' })
    expect(fetchMock).toHaveBeenCalledWith('/api/git/commits?cursor=abc1234')
  })

  it('getGitCommit sends required sha and pagination', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    await api.getGitCommit({ sha: 'deadbeef', fileOffset: 50, fileLimit: 25 })
    expect(fetchMock).toHaveBeenCalledWith('/api/git/commit?sha=deadbeef&file_offset=50&file_limit=25')
  })

  it('getGitStatus hits /api/git/status', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ staged: [], unstaged: [], untracked: [] }))
    await api.getGitStatus()
    expect(fetchMock).toHaveBeenCalledWith('/api/git/status')
  })

  it('getGitPatch encodes path with slashes and includes sha when present', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ path: 'a/b.txt', is_binary: false, total_hunks: 0, hunks: [], next_hunk_offset: null, more_available: false }))
    await api.getGitPatch({ source: 'commit', sha: 'abc1234', path: 'a/b.txt', hunkOffset: 3, hunkLimit: 5 })
    expect(fetchMock).toHaveBeenCalledWith('/api/git/patch?source=commit&sha=abc1234&path=a%2Fb.txt&hunk_offset=3&hunk_limit=5')
  })

  it('getGitPatch omits sha for staged/unstaged', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ path: 'a.txt', is_binary: false, total_hunks: 0, hunks: [], next_hunk_offset: null, more_available: false }))
    await api.getGitPatch({ source: 'staged', path: 'a.txt' })
    expect(fetchMock).toHaveBeenCalledWith('/api/git/patch?source=staged&path=a.txt')
  })

  it('surfaces typed errors as ok:false', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'not_a_repo', message: 'nope' }, { status: 404 }))
    const res = await api.getGitRefs()
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.status).toBe(404)
      expect(res.error.error).toBe('not_a_repo')
    }
  })
})
