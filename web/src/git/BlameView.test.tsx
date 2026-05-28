import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import BlameView, { __resetBlameCacheForTests, __blameCacheKeysForTests } from './BlameView'
import * as api from '../api/client'

vi.mock('../api/client', () => ({
  getGitBlame: vi.fn(),
  // BlameView fetches /raw/ through the shared client helper so the URL
  // construction (incl. `?ref=<sha>`) is centralised. Tests can stub the
  // global `fetch` mock without caring about the exact URL shape.
  rawUrl: (path: string, ref?: string) => {
    const base = '/raw/' + encodeURI(path)
    if (!ref) return base
    return base + '?ref=' + encodeURIComponent(ref)
  },
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

// --- Pinned mode + LRU eviction ---

function renderPinned(path: string, pinnedRef: string) {
  return render(
    <MemoryRouter initialEntries={['/view/' + path + '?ref=' + pinnedRef]}>
      <BlameView path={path} pinnedRef={pinnedRef} />
    </MemoryRouter>,
  )
}

describe('BlameView pinned mode', () => {
  const pinnedSHA = 'b'.repeat(40)

  it('threads pinnedRef to getGitBlame and the /raw/ fetch', async () => {
    vi.mocked(api.getGitBlame).mockResolvedValue({
      ok: true,
      data: { ...sampleBlame, ref: pinnedSHA, sha: pinnedSHA, dirty: false },
    })
    fetchMock.mockResolvedValue(rawResponse(fileContent))

    renderPinned('main.go', pinnedSHA)
    await screen.findByText('initial scaffold')

    expect(api.getGitBlame).toHaveBeenCalledWith({ path: 'main.go', ref: pinnedSHA })
    const fetchedUrl = String(fetchMock.mock.calls[0][0])
    expect(fetchedUrl).toBe('/raw/main.go?ref=' + pinnedSHA)
  })

  it('renders no pinned-state pill and suppresses the Modified-locally pill', async () => {
    vi.mocked(api.getGitBlame).mockResolvedValue({
      ok: true,
      // Even if the server somehow returned dirty:true in pinned mode (it
      // shouldn't), the SPA must not render the working-tree pill.
      data: { ...sampleBlame, ref: pinnedSHA, sha: pinnedSHA, dirty: true },
    })
    fetchMock.mockResolvedValue(rawResponse(fileContent))

    const { container } = renderPinned('main.go', pinnedSHA)
    await screen.findByText('initial scaffold')

    // BlameView no longer renders its own pinned-state pill — the per-file
    // last-commit strip above the tablist is the sole indicator.
    expect(container.querySelector('.blame-pill.pill-pinned')).toBeNull()
    expect(container.querySelector('.blame-pill.pill-modified')).toBeNull()
  })
})

describe('BlameView LRU cache', () => {
  it('keys cache entries by (path, ref) and evicts LRU at 32 entries', async () => {
    vi.mocked(api.getGitBlame).mockImplementation(async ({ path, ref }) => ({
      ok: true as const,
      data: { ...sampleBlame, path, ref: ref ?? 'HEAD', sha: 'a'.repeat(40) },
    }))
    fetchMock.mockResolvedValue(rawResponse(fileContent))

    // Mount 33 distinct (path, ref) entries. The cache caps at 32, so the
    // oldest (f0::pin0) should be evicted by the time the 33rd lands.
    for (let i = 0; i < 33; i++) {
      const { unmount } = render(
        <MemoryRouter initialEntries={['/view/f' + i]}>
          <BlameView path={'f' + i} pinnedRef={'pin' + i} />
        </MemoryRouter>,
      )
      await screen.findByText('initial scaffold')
      unmount()
    }

    const keys = __blameCacheKeysForTests()
    expect(keys.length).toBe(32)
    // Oldest entry was evicted; the next-oldest (f1::pin1) is now first.
    expect(keys).not.toContain('f0::pin0')
    expect(keys[0]).toBe('f1::pin1')
    expect(keys[keys.length - 1]).toBe('f32::pin32')
  })

  it('promotes entries to MRU on read so heavy use survives eviction', async () => {
    vi.mocked(api.getGitBlame).mockImplementation(async ({ path, ref }) => ({
      ok: true as const,
      data: { ...sampleBlame, path, ref: ref ?? 'HEAD', sha: 'a'.repeat(40) },
    }))
    fetchMock.mockResolvedValue(rawResponse(fileContent))

    // Insert 32 entries — the cache is exactly at capacity.
    for (let i = 0; i < 32; i++) {
      const { unmount } = render(
        <MemoryRouter initialEntries={['/view/g' + i]}>
          <BlameView path={'g' + i} pinnedRef={'pin' + i} />
        </MemoryRouter>,
      )
      await screen.findByText('initial scaffold')
      unmount()
    }
    // At this point keys[0] should be g0::pin0 (oldest), keys[31] g31::pin31.
    expect(__blameCacheKeysForTests()[0]).toBe('g0::pin0')

    // Touch g0 — promotes it to MRU. We do this via a direct remount; the
    // synchronous cache-seed in useState calls blameCacheGet, which moves
    // g0 to the end of the Map (MRU position).
    {
      const { unmount } = render(
        <MemoryRouter initialEntries={['/view/g0']}>
          <BlameView path={'g0'} pinnedRef={'pin0'} />
        </MemoryRouter>,
      )
      await screen.findByText('initial scaffold')
      unmount()
    }
    // After promotion: g1 is now the oldest, g0 is at the end.
    let after = __blameCacheKeysForTests()
    expect(after[0]).toBe('g1::pin1')
    expect(after[after.length - 1]).toBe('g0::pin0')

    // Insert one more (g32). Since g0 is no longer the LRU (g1 is), g1
    // should be evicted, not g0.
    {
      const { unmount } = render(
        <MemoryRouter initialEntries={['/view/g32']}>
          <BlameView path={'g32'} pinnedRef={'pin32'} />
        </MemoryRouter>,
      )
      await screen.findByText('initial scaffold')
      unmount()
    }

    after = __blameCacheKeysForTests()
    expect(after).not.toContain('g1::pin1')
    expect(after).toContain('g0::pin0')
    expect(after).toContain('g32::pin32')
  })
})
