import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { ApiResult, MetaResponse } from '../api/types'
import { LayoutContext } from './LayoutContext'
import FileViewer from './FileViewer'

// Stub out the API client so the component never makes real network calls.
const metaMock = vi.fn<(path: string) => Promise<ApiResult<MetaResponse>>>()
vi.mock('../api/client', () => ({
  INLINE_CAP: 5 * 1024 * 1024,
  meta: (path: string) => metaMock(path),
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

function renderViewer(path: string, opts: { showToast?: (msg: string) => void } = {}) {
  const layoutValue = {
    search: '',
    setSearch: () => {},
    searchRef: createRef<HTMLInputElement>(),
    isFileRoute: true,
    showToast: opts.showToast ?? (() => {}),
    closeSidebar: () => {},
  }
  return render(
    <MemoryRouter initialEntries={[`/view/${path}`]}>
      <LayoutContext.Provider value={layoutValue}>
        <FileViewer path={path} />
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

