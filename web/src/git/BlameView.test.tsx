import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import BlameView, { __resetBlameCacheForTests } from './BlameView'
import * as api from '../api/client'

vi.mock('../api/client', () => ({
  getGitBlame: vi.fn(),
}))

// Stub global fetch (BlameView fetches /raw/<path> alongside /api/git/blame).
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  // The blame cache is module-level; clear it between cases so a previous
  // test priming a key doesn't make the next test see an unexpected hit.
  __resetBlameCacheForTests()
})

function rawResponse(text: string): Response {
  const buf = new TextEncoder().encode(text).buffer
  return new Response(buf, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

function renderBlame(path: string, wrap = true, entry = '/view/' + path) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <BlameView path={path} wrap={wrap} />
    </MemoryRouter>,
  )
}

const fileContent = 'package main\n\nimport (\n\t"fmt"\n)\n\nfunc main() {\n\tfmt.Println("hi")\n}\n'

const sampleBlame = {
  path: 'main.go',
  ref: 'HEAD',
  sha: 'a'.repeat(40),
  total_lines: 9,
  dirty: false,
  chunks: [
    {
      start_line: 1,
      line_count: 5,
      commit: {
        sha: 'a'.repeat(40),
        short_sha: 'aaaaaaa',
        author_name: 'Alice',
        author_email: 'a@example.com',
        author_time: new Date().toISOString(),
        subject: 'initial scaffold',
      },
    },
    {
      start_line: 6,
      line_count: 4,
      commit: {
        sha: 'b'.repeat(40),
        short_sha: 'bbbbbbb',
        author_name: 'Bob',
        author_email: 'b@example.com',
        author_time: new Date().toISOString(),
        subject: 'add main body',
      },
    },
  ],
}

describe('BlameView', () => {
  it('renders committed chunk metadata with sha and subject linked', async () => {
    vi.mocked(api.getGitBlame).mockResolvedValue({ ok: true, data: sampleBlame })
    fetchMock.mockResolvedValue(rawResponse(fileContent))

    renderBlame('main.go')
    await screen.findByText('initial scaffold')
    expect(screen.getByText('aaaaaaa')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('bbbbbbb')).toBeInTheDocument()
    expect(screen.getByText('add main body')).toBeInTheDocument()

    // Both sha and subject link to /git/commits/<sha>.
    const shaLink = screen.getByText('aaaaaaa').closest('a')
    const subjectLink = screen.getByText('initial scaffold').closest('a')
    expect(shaLink?.getAttribute('href')).toBe('/git/commits/' + 'a'.repeat(40))
    expect(subjectLink?.getAttribute('href')).toBe('/git/commits/' + 'a'.repeat(40))
  })

  it('replaces commit metadata with "Working tree" for uncommitted chunks', async () => {
    vi.mocked(api.getGitBlame).mockResolvedValue({
      ok: true,
      data: {
        ...sampleBlame,
        dirty: true,
        chunks: [
          sampleBlame.chunks[0],
          { start_line: 6, line_count: 4, uncommitted: true as const },
        ],
      },
    })
    fetchMock.mockResolvedValue(rawResponse(fileContent))

    renderBlame('main.go')
    await screen.findByText('Working tree · uncommitted')
    expect(screen.getByText('Modified locally')).toBeInTheDocument()
  })

  it('line numbers count up monotonically across chunks', async () => {
    vi.mocked(api.getGitBlame).mockResolvedValue({ ok: true, data: sampleBlame })
    fetchMock.mockResolvedValue(rawResponse(fileContent))

    const { container } = renderBlame('main.go')
    await screen.findByText('initial scaffold')
    const gutters = Array.from(container.querySelectorAll('.blame-gutter')).map(
      (n) => Number(n.textContent),
    )
    // 5 lines in chunk 1 + 4 lines in chunk 2 = 9, gutters 1..9.
    expect(gutters).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('toggles the wrap-on / wrap-off class on the root', async () => {
    vi.mocked(api.getGitBlame).mockResolvedValue({ ok: true, data: sampleBlame })
    fetchMock.mockResolvedValue(rawResponse(fileContent))

    const { container, rerender } = renderBlame('main.go', true)
    await screen.findByText('initial scaffold')
    expect(container.querySelector('.blame-view.wrap-on')).not.toBeNull()

    rerender(
      <MemoryRouter initialEntries={['/view/main.go']}>
        <BlameView path="main.go" wrap={false} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(container.querySelector('.blame-view.wrap-off')).not.toBeNull()
    })
  })

  it('renders the untracked empty state when blame returns not_found', async () => {
    vi.mocked(api.getGitBlame).mockResolvedValue({
      ok: false,
      status: 404,
      error: { error: 'not_found', message: 'untracked' },
    })
    fetchMock.mockResolvedValue(rawResponse(fileContent))

    renderBlame('new.txt')
    await screen.findByText(/This file is untracked\./)
    const cta = screen.getByRole('link', { name: /open history/i })
    expect(cta.getAttribute('href')).toBe('/git/commits?path=new.txt')
  })

  it('renders the timeout empty state with a History pivot', async () => {
    vi.mocked(api.getGitBlame).mockResolvedValue({
      ok: false,
      status: 503,
      error: { error: 'blame_timeout', message: 'blame deadline exceeded' },
    })
    fetchMock.mockResolvedValue(rawResponse(fileContent))

    renderBlame('big.go')
    await screen.findByText(/Blame took too long/)
    const cta = screen.getByRole('link', { name: /open history/i })
    expect(cta.getAttribute('href')).toBe('/git/commits?path=big.go')
  })

  it('renders the file with a "Computing blame…" placeholder before blame resolves', async () => {
    let resolveBlame: (v: { ok: true; data: typeof sampleBlame }) => void = () => {}
    vi.mocked(api.getGitBlame).mockReturnValue(
      new Promise((res) => {
        resolveBlame = res
      }),
    )
    fetchMock.mockResolvedValue(rawResponse(fileContent))

    renderBlame('main.go')

    // Raw bytes resolve fast → file + gutter render with a placeholder
    // metadata cell while go-git's blame walk is still in flight.
    await screen.findByText(/Computing blame/i)
    // Gutter still counts up across the synthesized full-file chunk.
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('initial scaffold')).toBeNull()

    // Once blame resolves, the placeholder swaps out for the real chunks.
    resolveBlame({ ok: true, data: sampleBlame })
    await screen.findByText('initial scaffold')
    expect(screen.queryByText(/Computing blame/i)).toBeNull()
  })

  it('hits the in-memory cache on a second mount and skips the placeholder', async () => {
    // Prime the cache by mounting once with an immediate-resolve mock.
    vi.mocked(api.getGitBlame).mockResolvedValue({ ok: true, data: sampleBlame })
    fetchMock.mockResolvedValue(rawResponse(fileContent))
    const { unmount } = renderBlame('cached.go')
    await screen.findByText('initial scaffold')
    unmount()

    // Second mount: the API mock stays unresolved so we can verify cache
    // hit by checking that the chunks render *before* the background
    // promise lands. If we were re-fetching, we'd see "Computing blame…"
    // until the API resolves — instead we see the chunks immediately.
    let resolveBlame: (v: { ok: true; data: typeof sampleBlame }) => void = () => {}
    vi.mocked(api.getGitBlame).mockReturnValue(
      new Promise((res) => {
        resolveBlame = res
      }),
    )
    renderBlame('cached.go')
    await screen.findByText('initial scaffold')
    expect(screen.queryByText(/Computing blame/i)).toBeNull()
    resolveBlame({ ok: true, data: sampleBlame })
  })

  it('dedupes concurrent in-flight requests for the same (path, ref) key', async () => {
    // First mount fires a request. While it's still in flight, mount a
    // second BlameView for the same path. The API should be called exactly
    // once — the second mount joins the in-flight promise.
    let resolveBlame: (v: { ok: true; data: typeof sampleBlame }) => void = () => {}
    vi.mocked(api.getGitBlame).mockReturnValue(
      new Promise((res) => {
        resolveBlame = res
      }),
    )
    fetchMock.mockImplementation(async () => rawResponse(fileContent))

    const first = renderBlame('dedupe.go')
    await screen.findByText(/Computing blame/i)
    expect(vi.mocked(api.getGitBlame)).toHaveBeenCalledTimes(1)

    // Second mount before the first resolves — same path, same ref.
    const second = renderBlame('dedupe.go')
    expect(vi.mocked(api.getGitBlame)).toHaveBeenCalledTimes(1)

    // Resolve the single in-flight promise. Both renders await this same
    // promise; the cache populates from it.
    resolveBlame({ ok: true, data: sampleBlame })
    await new Promise((r) => setTimeout(r, 0))
    first.unmount()
    second.unmount()

    // A *third* mount after resolution should hit the now-populated cache
    // synchronously — no third API call (the background refresh fires a
    // second call, but the cached render shows up before that resolves).
    vi.mocked(api.getGitBlame).mockReturnValue(new Promise(() => {})) // never resolves
    renderBlame('dedupe.go')
    expect(await screen.findByText('initial scaffold')).toBeInTheDocument()
    expect(screen.queryByText(/Computing blame/i)).toBeNull()
  })

  it('completes the in-flight fetch even after the originating mount unmounts', async () => {
    // Open Blame, fire the request, then immediately switch away (unmount)
    // before the API resolves. Resolving the promise still updates the
    // cache; a fresh mount sees the cached result instantly.
    let resolveBlame: (v: { ok: true; data: typeof sampleBlame }) => void = () => {}
    vi.mocked(api.getGitBlame).mockReturnValue(
      new Promise((res) => {
        resolveBlame = res
      }),
    )
    fetchMock.mockImplementation(async () => rawResponse(fileContent))

    const first = renderBlame('survive.go')
    await screen.findByText(/Computing blame/i)
    expect(vi.mocked(api.getGitBlame)).toHaveBeenCalledTimes(1)

    // User switches to Code → BlameView unmounts mid-flight. The promise
    // should still settle and populate the cache.
    first.unmount()

    resolveBlame({ ok: true, data: sampleBlame })
    // Wait a tick for the .then chain to run cache.set + finally clear.
    await new Promise((r) => setTimeout(r, 0))

    // Second mount — must show chunks immediately, no placeholder.
    renderBlame('survive.go')
    expect(await screen.findByText('initial scaffold')).toBeInTheDocument()
    expect(screen.queryByText(/Computing blame/i)).toBeNull()
  })

  it('shows "Refetching blame…" while a background SWR fetch is in flight', async () => {
    // Prime the cache.
    vi.mocked(api.getGitBlame).mockResolvedValue({ ok: true, data: sampleBlame })
    fetchMock.mockImplementation(async () => rawResponse(fileContent))
    const { unmount } = renderBlame('refetch.go')
    await screen.findByText('initial scaffold')
    unmount()

    // Second mount: cache hit, background request is pending.
    let resolveBlame: (v: { ok: true; data: typeof sampleBlame }) => void = () => {}
    vi.mocked(api.getGitBlame).mockReturnValue(
      new Promise((res) => {
        resolveBlame = res
      }),
    )
    renderBlame('refetch.go')
    await screen.findByText('initial scaffold')
    // Status bar shows "Refetching blame…" while the background promise is
    // still pending.
    expect(screen.getByText(/Refetching blame/i)).toBeInTheDocument()

    // Once the background fetch resolves, the indicator goes away.
    resolveBlame({ ok: true, data: sampleBlame })
    await waitFor(() => {
      expect(screen.queryByText(/Refetching blame/i)).toBeNull()
    })
  })

  it('does not show the refetching indicator on a cold mount', async () => {
    let resolveBlame: (v: { ok: true; data: typeof sampleBlame }) => void = () => {}
    vi.mocked(api.getGitBlame).mockReturnValue(
      new Promise((res) => {
        resolveBlame = res
      }),
    )
    fetchMock.mockImplementation(async () => rawResponse(fileContent))
    renderBlame('cold.go')
    // Cold mount renders the chunk-level "Computing blame…" placeholder
    // INSTEAD of the status-bar Refetching pill — they convey the same
    // signal, no reason to show both.
    await screen.findByText(/Computing blame/i)
    expect(screen.queryByText(/Refetching blame/i)).toBeNull()
    resolveBlame({ ok: true, data: sampleBlame })
  })

  it('falls through to the placeholder when no cache entry exists', async () => {
    // A fresh path (not previously mounted) must not have a cache hit.
    let resolveBlame: (v: { ok: true; data: typeof sampleBlame }) => void = () => {}
    vi.mocked(api.getGitBlame).mockReturnValue(
      new Promise((res) => {
        resolveBlame = res
      }),
    )
    fetchMock.mockResolvedValue(rawResponse(fileContent))
    renderBlame('uncached-path.go')
    await screen.findByText(/Computing blame/i)
    resolveBlame({ ok: true, data: sampleBlame })
  })

  it('plays plain monospace for files with no registered grammar', async () => {
    vi.mocked(api.getGitBlame).mockResolvedValue({ ok: true, data: { ...sampleBlame, path: 'notes.foobar' } })
    fetchMock.mockResolvedValue(rawResponse(fileContent))

    const { container } = renderBlame('notes.foobar')
    await screen.findByText('initial scaffold')
    // No `.hljs` class on any line-text span when the grammar is missing.
    const hljs = container.querySelectorAll('.blame-line-text.hljs')
    expect(hljs.length).toBe(0)
  })
})
