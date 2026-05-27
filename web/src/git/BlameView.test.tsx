import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import BlameView from './BlameView'
import * as api from '../api/client'

vi.mock('../api/client', () => ({
  getGitBlame: vi.fn(),
}))

// Stub global fetch (BlameView fetches /raw/<path> alongside /api/git/blame).
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
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
