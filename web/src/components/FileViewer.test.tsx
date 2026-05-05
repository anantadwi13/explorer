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
afterEach(() => {
  vi.unstubAllGlobals()
})

function renderViewer(path: string) {
  const layoutValue = {
    search: '',
    setSearch: () => {},
    searchRef: createRef<HTMLInputElement>(),
    isFileRoute: true,
    showToast: () => {},
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
