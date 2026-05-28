import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { ApiResult, MetaResponse } from '../api/types'
import { LayoutContext } from './LayoutContext'
import FileViewer from './FileViewer'

// Stub out the API client so the component never makes real network calls.
// `meta` is exercised directly by FileViewer; the others are hit by the
// child surfaces (FileLastCommitStrip, BlameView) that FileViewer mounts and
// need a benign default so the component tree settles during render.
const metaMock = vi.fn<(path: string, ref?: string) => Promise<ApiResult<MetaResponse>>>()
vi.mock('../api/client', () => ({
  INLINE_CAP: 5 * 1024 * 1024,
  meta: (path: string, ref?: string) => metaMock(path, ref),
  // rawUrl is used by FileViewer for <img src>, download href, and the /raw/
  // fetch URL. Mirror the real implementation so tests can assert on the
  // generated URLs (including the `?ref=` propagation in pinned mode).
  rawUrl: (path: string, ref?: string) => {
    const base = '/raw/' + encodeURI(path)
    if (!ref) return base
    return base + '?ref=' + encodeURIComponent(ref)
  },
  getGitInfo: vi.fn().mockResolvedValue({
    ok: true,
    data: { is_repo: false },
  }),
  getGitStatus: vi.fn().mockResolvedValue({
    ok: true,
    data: { staged: [], unstaged: [], untracked: [] },
  }),
  getGitCommits: vi.fn().mockResolvedValue({
    ok: true,
    data: { commits: [], next_cursor: null },
  }),
  getGitCommit: vi.fn().mockResolvedValue({
    ok: true,
    data: {
      sha: '',
      short_sha: '',
      author_name: '',
      author_email: '',
      author_time: '',
      committer_name: '',
      committer_email: '',
      committer_time: '',
      subject: '',
      body: '',
      parents: [],
      total_files: 0,
      total_additions: 0,
      total_deletions: 0,
      files: [],
      next_file_offset: null,
    },
  }),
  getGitBlame: vi.fn().mockResolvedValue({
    ok: true,
    data: {
      path: '',
      ref: '',
      sha: '',
      total_lines: 0,
      dirty: false,
      chunks: [],
    },
  }),
}))

// Stub global fetch (used for the /raw/ body of text/markdown files).
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  metaMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  localStorage.clear()
})
const origClipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard')
const origExec = Object.getOwnPropertyDescriptor(Document.prototype, 'execCommand')
afterEach(() => {
  vi.unstubAllGlobals()
  if (origClipboard) Object.defineProperty(Navigator.prototype, 'clipboard', origClipboard)
  else delete (navigator as unknown as { clipboard?: unknown }).clipboard
  if (origExec) Object.defineProperty(Document.prototype, 'execCommand', origExec)
  else delete (document as unknown as { execCommand?: unknown }).execCommand
})

function renderViewer(
  path: string,
  opts: { showToast?: (msg: string) => void; initialUrl?: string } = {},
) {
  const layoutValue = {
    search: '',
    setSearch: () => {},
    searchRef: createRef<HTMLInputElement>(),
    isFileRoute: true,
    showToast: opts.showToast ?? (() => {}),
    closeSidebar: () => {},
  }
  // A tiny probe that reflects the current URL into a data attribute so tests
  // can assert what the SPA wrote to the address bar after tab activations.
  const url = opts.initialUrl ?? `/view/${path}`
  function LocationProbe() {
    const loc = useLocation()
    return <div data-testid="location" data-search={loc.search} />
  }
  return render(
    <MemoryRouter initialEntries={[url]}>
      <LayoutContext.Provider value={layoutValue}>
        <FileViewer path={path} />
        <LocationProbe />
      </LayoutContext.Provider>
    </MemoryRouter>,
  )
}

function okMeta(meta: MetaResponse): ApiResult<MetaResponse> {
  return { ok: true, data: meta }
}

function rawResponse(body: string): Response {
  const buf = new TextEncoder().encode(body).buffer
  return new Response(buf, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

describe('FileViewer wrap toggle', () => {
  it('hides the toggle for markdown files', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 16, mtime: '', mime: 'text/markdown', kind: 'markdown' }))
    fetchMock.mockResolvedValue(rawResponse('# hi'))

    const { container } = renderViewer('readme.md')
    await waitFor(() => expect(container.querySelector('.file-detail')).not.toBeNull())
    expect(container.querySelector('button[aria-label^="Wrap lines"]')).toBeNull()
  })

  it('hides the toggle for image files', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 100, mtime: '', mime: 'image/png', kind: 'image' }))

    const { container } = renderViewer('logo.png')
    await waitFor(() => expect(container.querySelector('.file-detail')).not.toBeNull())
    expect(container.querySelector('button[aria-label^="Wrap lines"]')).toBeNull()
  })

  it('hides the toggle for non-previewable files (kind=""), which surface as not_regular', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 100, mtime: '', mime: 'application/zip', kind: '' }))

    const { container } = renderViewer('archive.zip')
    await waitFor(() => expect(container.querySelector('.vw-fallback')).not.toBeNull())
    expect(container.querySelector('button[aria-label^="Wrap lines"]')).toBeNull()
  })

  it('hides the toggle on API errors (e.g. not_found)', async () => {
    metaMock.mockResolvedValue({
      ok: false,
      status: 404,
      error: { error: 'not_found', message: 'no such file' },
    })

    const { container } = renderViewer('missing.go')
    await waitFor(() => expect(container.querySelector('.vw-fallback')).not.toBeNull())
    expect(container.querySelector('button[aria-label^="Wrap lines"]')).toBeNull()
  })

  it('shows the toggle for text files; click flips aria-pressed and updates localStorage', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 12, mtime: '', mime: 'text/plain', kind: 'text' }))
    fetchMock.mockResolvedValue(rawResponse('hello world\n'))

    const { container } = renderViewer('hello.go')
    const btn = await waitFor(() => {
      const el = container.querySelector('button[aria-label^="Wrap lines"]')
      if (!el) throw new Error('toggle not yet rendered')
      return el as HTMLButtonElement
    })

    // Default: wrap on → aria-pressed=true, label says "on", pre has wrap-on
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.getAttribute('aria-label')).toBe('Wrap lines: on')
    let pre = container.querySelector('pre.code-block')!
    expect(pre.classList.contains('wrap-on')).toBe(true)
    expect(pre.classList.contains('wrap-off')).toBe(false)
    expect(localStorage.getItem('explorer.wrap')).toBeNull()

    // Click → wrap off
    await act(async () => {
      btn.click()
    })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(btn.getAttribute('aria-label')).toBe('Wrap lines: off')
    pre = container.querySelector('pre.code-block')!
    expect(pre.classList.contains('wrap-off')).toBe(true)
    expect(pre.classList.contains('wrap-on')).toBe(false)
    expect(localStorage.getItem('explorer.wrap')).toBe('off')

    // Click again → back to wrap on
    await act(async () => {
      btn.click()
    })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem('explorer.wrap')).toBe('on')
  })

  it('honors persisted "off" in localStorage on initial mount', async () => {
    localStorage.setItem('explorer.wrap', 'off')
    metaMock.mockResolvedValue(okMeta({ size: 12, mtime: '', mime: 'text/plain', kind: 'text' }))
    fetchMock.mockResolvedValue(rawResponse('hello world\n'))

    const { container } = renderViewer('hello.go')
    const pre = await waitFor(() => {
      const el = container.querySelector('pre.code-block')
      if (!el) throw new Error('pre not yet rendered')
      return el
    })
    expect(pre.classList.contains('wrap-off')).toBe(true)
    expect(pre.classList.contains('wrap-on')).toBe(false)

    const btn = container.querySelector('button[aria-label^="Wrap lines"]')!
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(btn.getAttribute('aria-label')).toBe('Wrap lines: off')
  })
})

describe('FileViewer copy-link', () => {
  async function clickCopy(container: HTMLElement) {
    const btn = await waitFor(() => {
      const el = container.querySelector('button[aria-label="Copy link"]')
      if (!el) throw new Error('copy-link button not rendered')
      return el as HTMLButtonElement
    })
    await act(async () => {
      btn.click()
    })
  }

  it('uses navigator.clipboard in a secure context and toasts success', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 100, mtime: '', mime: 'image/png', kind: 'image' }))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('isSecureContext', true)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const toast = vi.fn()

    const { container } = renderViewer('logo.png', { showToast: toast })
    await clickCopy(container)

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith('Link copied')
  })

  it('falls back to execCommand when navigator.clipboard is unavailable (insecure HTTP)', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 100, mtime: '', mime: 'image/png', kind: 'image' }))
    vi.stubGlobal('isSecureContext', false)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
    const toast = vi.fn()

    const { container } = renderViewer('logo.png', { showToast: toast })
    await clickCopy(container)

    expect(exec).toHaveBeenCalledWith('copy')
    expect(toast).toHaveBeenCalledWith('Link copied')
  })

  it('falls back to execCommand when navigator.clipboard.writeText rejects', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 100, mtime: '', mime: 'image/png', kind: 'image' }))
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('isSecureContext', true)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
    const toast = vi.fn()

    const { container } = renderViewer('logo.png', { showToast: toast })
    await clickCopy(container)

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(toast).toHaveBeenCalledWith('Link copied')
  })

  it('toasts failure when both paths fail', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 100, mtime: '', mime: 'image/png', kind: 'image' }))
    vi.stubGlobal('isSecureContext', false)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const exec = vi.fn().mockReturnValue(false)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
    const toast = vi.fn()

    const { container } = renderViewer('logo.png', { showToast: toast })
    await clickCopy(container)

    expect(exec).toHaveBeenCalledWith('copy')
    expect(toast).toHaveBeenCalledWith('Failed to copy link')
  })
})

// The markdown three-tab variant (Preview / Code / Blame) added by
// add-markdown-three-tab-view. These exercise the tab rendering, URL emit
// rule (always-explicit `?view=`), tolerant parse, and wrap-toggle visibility
// keyed on the active tab.
describe('FileViewer markdown tablist', () => {
  function markdownMeta(): MetaResponse {
    return { size: 16, mtime: '', mime: 'text/markdown', kind: 'markdown' }
  }

  async function waitForTabs(container: HTMLElement) {
    await waitFor(() => {
      const tablist = container.querySelector('[role="tablist"]')
      if (!tablist) throw new Error('tablist not rendered')
      return tablist
    })
  }

  it('renders Preview / Code / Blame tabs for markdown files', async () => {
    metaMock.mockResolvedValue(okMeta(markdownMeta()))
    fetchMock.mockResolvedValue(rawResponse('# hello'))

    const { container } = renderViewer('README.md')
    await waitForTabs(container)
    const labels = Array.from(container.querySelectorAll('[role="tab"]')).map(
      (el) => el.textContent,
    )
    expect(labels).toEqual(['Preview', 'Code', 'Blame'])
  })

  it('legacy URL without ?view= defaults to Preview on markdown', async () => {
    metaMock.mockResolvedValue(okMeta(markdownMeta()))
    fetchMock.mockResolvedValue(rawResponse('# hi'))

    const { container } = renderViewer('README.md')
    await waitForTabs(container)
    const preview = container.querySelector('[role="tab"][aria-selected="true"]')
    expect(preview?.textContent).toBe('Preview')
    // Preview branch mounts MarkdownRenderer, identifiable by .md-body.
    expect(container.querySelector('.md-body')).not.toBeNull()
  })

  it('deep link ?view=code on markdown activates Code tab and renders CodeBlock', async () => {
    metaMock.mockResolvedValue(okMeta(markdownMeta()))
    fetchMock.mockResolvedValue(rawResponse('# title'))

    const { container } = renderViewer('README.md', { initialUrl: '/view/README.md?view=code' })
    await waitForTabs(container)
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
      'Code',
    )
    expect(container.querySelector('pre.code-block')).not.toBeNull()
    expect(container.querySelector('.md-body')).toBeNull()
  })

  it('deep link ?view=blame on markdown activates Blame tab', async () => {
    metaMock.mockResolvedValue(okMeta(markdownMeta()))
    fetchMock.mockResolvedValue(rawResponse('# title'))

    const { container } = renderViewer('README.md', { initialUrl: '/view/README.md?view=blame' })
    await waitForTabs(container)
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
      'Blame',
    )
    expect(container.querySelector('.md-body')).toBeNull()
    expect(container.querySelector('pre.code-block')).toBeNull()
  })

  it('?view=preview on a text file falls back to Code (defensive)', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 5, mtime: '', mime: 'text/plain', kind: 'text' }))
    fetchMock.mockResolvedValue(rawResponse('hello'))

    const { container } = renderViewer('hello.go', { initialUrl: '/view/hello.go?view=preview' })
    await waitForTabs(container)
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
      'Code',
    )
    expect(container.querySelector('pre.code-block')).not.toBeNull()
  })

  it('activating Code on markdown writes ?view=code explicitly', async () => {
    metaMock.mockResolvedValue(okMeta(markdownMeta()))
    fetchMock.mockResolvedValue(rawResponse('# title'))

    const { container, getByRole, getByTestId } = renderViewer('README.md')
    await waitForTabs(container)
    await act(async () => {
      fireEvent.click(getByRole('tab', { name: 'Code' }))
    })
    expect(getByTestId('location').getAttribute('data-search')).toBe('?view=code')
  })

  it('switching to Preview from Blame writes ?view=preview (does not delete the param)', async () => {
    metaMock.mockResolvedValue(okMeta(markdownMeta()))
    fetchMock.mockResolvedValue(rawResponse('# title'))

    const { container, getByRole, getByTestId } = renderViewer('README.md', {
      initialUrl: '/view/README.md?view=blame',
    })
    await waitForTabs(container)
    await act(async () => {
      fireEvent.click(getByRole('tab', { name: 'Preview' }))
    })
    expect(getByTestId('location').getAttribute('data-search')).toBe('?view=preview')
  })

  it('?at=<sha> is ignored on parse and preserved on emit', async () => {
    metaMock.mockResolvedValue(okMeta(markdownMeta()))
    fetchMock.mockResolvedValue(rawResponse('# pinned looking'))

    const { container, getByRole, getByTestId } = renderViewer('README.md', {
      initialUrl: '/view/README.md?view=preview&at=abc1234',
    })
    await waitForTabs(container)
    // Preview is still active, markdown renderer is still rendering the
    // working-tree bytes (the test's metaMock + fetchMock). The `at=` value
    // is ignored on parse.
    expect(container.querySelector('.md-body')).not.toBeNull()
    // On a tab activation, the SPA writes the new `view=` but preserves the
    // pre-existing `at=` parameter (tolerant parse, generation-explicit only
    // for params the SPA owns).
    await act(async () => {
      fireEvent.click(getByRole('tab', { name: 'Code' }))
    })
    expect(getByTestId('location').getAttribute('data-search')).toBe(
      '?view=code&at=abc1234',
    )
  })
})

// Wrap toggle visibility — relocated from `kind === 'text'` to a rule keyed
// on the active tab. The toggle should be visible on Code or Blame (any kind);
// hidden on Preview (markdown) and on Image / non-previewable / error states.
describe('FileViewer wrap toggle visibility per active tab', () => {
  it('hides the toggle on markdown Preview', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 10, mtime: '', mime: 'text/markdown', kind: 'markdown' }))
    fetchMock.mockResolvedValue(rawResponse('# title'))

    const { container } = renderViewer('README.md')
    await waitFor(() => {
      const t = container.querySelector('[role="tablist"]')
      if (!t) throw new Error('tablist not rendered')
    })
    expect(container.querySelector('button[aria-label^="Wrap lines"]')).toBeNull()
  })

  it('shows the toggle on markdown Code', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 10, mtime: '', mime: 'text/markdown', kind: 'markdown' }))
    fetchMock.mockResolvedValue(rawResponse('# title'))

    const { container } = renderViewer('README.md', { initialUrl: '/view/README.md?view=code' })
    await waitFor(() => {
      const btn = container.querySelector('button[aria-label^="Wrap lines"]')
      if (!btn) throw new Error('wrap toggle not yet rendered')
    })
    expect(container.querySelector('button[aria-label^="Wrap lines"]')).not.toBeNull()
  })

  it('shows the toggle on markdown Blame', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 10, mtime: '', mime: 'text/markdown', kind: 'markdown' }))
    fetchMock.mockResolvedValue(rawResponse('# title'))

    const { container } = renderViewer('README.md', { initialUrl: '/view/README.md?view=blame' })
    await waitFor(() => {
      const btn = container.querySelector('button[aria-label^="Wrap lines"]')
      if (!btn) throw new Error('wrap toggle not yet rendered')
    })
    expect(container.querySelector('button[aria-label^="Wrap lines"]')).not.toBeNull()
  })

  it('shows the toggle on text Code (default tab)', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 5, mtime: '', mime: 'text/plain', kind: 'text' }))
    fetchMock.mockResolvedValue(rawResponse('hi'))

    const { container } = renderViewer('hello.go')
    await waitFor(() => {
      const btn = container.querySelector('button[aria-label^="Wrap lines"]')
      if (!btn) throw new Error('wrap toggle not yet rendered')
    })
    expect(container.querySelector('button[aria-label^="Wrap lines"]')).not.toBeNull()
  })

  it('shows the toggle on text Blame', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 5, mtime: '', mime: 'text/plain', kind: 'text' }))
    fetchMock.mockResolvedValue(rawResponse('hi'))

    const { container } = renderViewer('hello.go', { initialUrl: '/view/hello.go?view=blame' })
    await waitFor(() => {
      const btn = container.querySelector('button[aria-label^="Wrap lines"]')
      if (!btn) throw new Error('wrap toggle not yet rendered')
    })
    expect(container.querySelector('button[aria-label^="Wrap lines"]')).not.toBeNull()
  })
})

// The content-area container's class follows the active renderer rather than
// the file kind, so markdown Code and Blame inherit the same panel chrome
// (vw-text: bg-panel, border, radius-lg) text files have always had.
describe('FileViewer content-area container class', () => {
  it('text Code uses vw-text', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 5, mtime: '', mime: 'text/plain', kind: 'text' }))
    fetchMock.mockResolvedValue(rawResponse('hi'))

    const { container } = renderViewer('hello.go')
    await waitFor(() => {
      if (!container.querySelector('pre.code-block')) throw new Error('not ready')
    })
    expect(container.querySelector('.vw.vw-text')).not.toBeNull()
  })

  it('markdown Preview uses vw-markdown (not vw-text)', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 10, mtime: '', mime: 'text/markdown', kind: 'markdown' }))
    fetchMock.mockResolvedValue(rawResponse('# hi'))

    const { container } = renderViewer('README.md')
    await waitFor(() => {
      if (!container.querySelector('.md-body')) throw new Error('not ready')
    })
    expect(container.querySelector('.vw.vw-markdown')).not.toBeNull()
    expect(container.querySelector('.vw.vw-text')).toBeNull()
  })

  it('markdown Code reuses vw-text (matching text Code)', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 10, mtime: '', mime: 'text/markdown', kind: 'markdown' }))
    fetchMock.mockResolvedValue(rawResponse('# hi'))

    const { container } = renderViewer('README.md', { initialUrl: '/view/README.md?view=code' })
    await waitFor(() => {
      if (!container.querySelector('pre.code-block')) throw new Error('not ready')
    })
    expect(container.querySelector('.vw.vw-text')).not.toBeNull()
    expect(container.querySelector('.vw.vw-markdown')).toBeNull()
  })

  it('markdown Blame reuses vw-text', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 10, mtime: '', mime: 'text/markdown', kind: 'markdown' }))
    fetchMock.mockResolvedValue(rawResponse('# hi'))

    const { container } = renderViewer('README.md', { initialUrl: '/view/README.md?view=blame' })
    await waitFor(() => {
      if (!container.querySelector('[role="tablist"]')) throw new Error('not ready')
    })
    expect(container.querySelector('.vw.vw-text')).not.toBeNull()
  })

  it('image uses vw-image', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 100, mtime: '', mime: 'image/png', kind: 'image' }))

    const { container } = renderViewer('logo.png')
    await waitFor(() => {
      if (!container.querySelector('img')) throw new Error('not ready')
    })
    expect(container.querySelector('.vw.vw-image')).not.toBeNull()
  })
})

// --- Pinned mode (?ref=) ---

function renderPinnedViewer(path: string, pinnedRef: string, viewParam?: string) {
  const layoutValue = {
    search: '',
    setSearch: () => {},
    searchRef: createRef<HTMLInputElement>(),
    isFileRoute: true,
    showToast: () => {},
    closeSidebar: () => {},
  }
  const qs = new URLSearchParams()
  if (viewParam) qs.set('view', viewParam)
  qs.set('ref', pinnedRef)
  const url = `/view/${path}?${qs.toString()}`
  function LocationProbe() {
    const loc = useLocation()
    return <div data-testid="location" data-search={loc.search} />
  }
  return render(
    <MemoryRouter initialEntries={[url]}>
      <LayoutContext.Provider value={layoutValue}>
        <FileViewer path={path} pinnedRef={pinnedRef} />
        <LocationProbe />
      </LayoutContext.Provider>
    </MemoryRouter>,
  )
}

describe('FileViewer pinned mode (?ref=)', () => {
  const pinnedSHA = 'a'.repeat(40)

  it('threads ref to api.meta() and rawUrl()', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 12, mtime: '', mime: 'text/plain', kind: 'text' }))
    fetchMock.mockResolvedValue(rawResponse('hello world\n'))

    const { container } = renderPinnedViewer('main.go', pinnedSHA, 'code')

    await waitFor(() => {
      if (!container.querySelector('pre.code-block')) throw new Error('not ready')
    })
    // meta was called with the pinned ref
    expect(metaMock).toHaveBeenCalledWith('main.go', pinnedSHA)
    // /raw/ fetch URL includes ref=
    const fetchedUrl = String(fetchMock.mock.calls[0][0])
    expect(fetchedUrl).toBe('/raw/main.go?ref=' + pinnedSHA)
  })

  it('image src includes ?ref= in pinned mode', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 100, mtime: '', mime: 'image/png', kind: 'image' }))

    const { container } = renderPinnedViewer('logo.png', pinnedSHA)
    await waitFor(() => {
      if (!container.querySelector('img')) throw new Error('not ready')
    })
    const img = container.querySelector('img') as HTMLImageElement
    // jsdom resolves relative URLs against the test base. Compare the raw
    // attribute value instead of `.src`.
    expect(img.getAttribute('src')).toBe('/raw/logo.png?ref=' + pinnedSHA)
  })

  it('download link includes ?ref= in pinned mode', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 12, mtime: '', mime: 'text/plain', kind: 'text' }))
    fetchMock.mockResolvedValue(rawResponse('hello\n'))

    const { container } = renderPinnedViewer('main.go', pinnedSHA, 'code')
    await waitFor(() => {
      if (!container.querySelector('a[download]')) throw new Error('not ready')
    })
    const download = container.querySelector('a[download]') as HTMLAnchorElement
    expect(download.getAttribute('href')).toBe('/raw/main.go?ref=' + pinnedSHA)
  })

  it('renders the unknown_ref error state in the content area (pinned indicator lives on the strip, covered separately)', async () => {
    metaMock.mockResolvedValue({
      ok: false,
      status: 404,
      error: { error: 'unknown_ref', message: 'unknown ref' },
    })

    const { container } = renderPinnedViewer('main.go', 'zzz', 'code')
    await waitFor(() => {
      if (!container.querySelector('.vw-fallback')) throw new Error('not ready')
    })
    expect(container.querySelector('.vw-fallback')!.textContent).toContain('Unknown Commit')
  })

  it('file head stays clean in pinned mode (no Viewing-at pill, no Back-to-working-tree button)', async () => {
    metaMock.mockResolvedValue(okMeta({ size: 12, mtime: '', mime: 'text/plain', kind: 'text' }))
    fetchMock.mockResolvedValue(rawResponse('hello\n'))

    const { container } = renderPinnedViewer('main.go', pinnedSHA, 'code')
    await waitFor(() => {
      if (!container.querySelector('pre.code-block')) throw new Error('not ready')
    })
    // Per the user-requested placement decision: the pinned indicator and
    // its escape affordance live on the file-last-commit strip (covered by
    // FileLastCommitStrip.test.tsx). The file head stays clean.
    expect(container.querySelector('.file-head-pinned')).toBeNull()
    expect(container.querySelector('.file-head-pinned-pill')).toBeNull()
    expect(container.querySelector('.file-head-pinned-back')).toBeNull()
    // No back-to-working-tree button in the head's actions either.
    expect(container.querySelector('.file-head-actions [aria-label="Back to working tree"]')).toBeNull()
  })
})

