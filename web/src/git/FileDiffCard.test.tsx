import { describe, it, expect } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FileDiffCard, { viewLinkFor } from './FileDiffCard'
import type { GitFileHeader } from '../api/types'

// FileDiffCard fetches /api/git/patch lazily on expand. The tests below render
// in the collapsed state (default), which never triggers the patch fetch, so
// no API mock is needed. The link rendering happens entirely on the synchronous
// first paint.

function file(overrides: Partial<GitFileHeader> = {}): GitFileHeader {
  return {
    status: 'M',
    old_path: 'src/main.go',
    new_path: 'src/main.go',
    additions: 1,
    deletions: 1,
    is_binary: false,
    ...overrides,
  }
}

describe('viewLinkFor', () => {
  it('non-rename commit diff includes ref=<sha> and default view per kind', () => {
    const sha = 'a'.repeat(40)
    const link = viewLinkFor(file({ new_path: 'README.md' }), 'commit', sha)
    expect(link).not.toBeNull()
    expect(link!.url).toBe('/view/README.md?view=preview&ref=' + sha)
  })

  it('non-rename text file uses view=code', () => {
    const sha = 'b'.repeat(40)
    const link = viewLinkFor(file({ new_path: 'src/main.go' }), 'commit', sha)
    expect(link!.url).toBe('/view/src/main.go?view=code&ref=' + sha)
  })

  it('rename: new_path uses raw sha, old_path uses sha^', () => {
    const sha = 'c'.repeat(40)
    const f = file({
      status: 'R',
      old_path: 'src/Old.tsx',
      new_path: 'src/New.tsx',
    })
    const newLink = viewLinkFor(f, 'commit', sha, f.new_path!)
    const oldLink = viewLinkFor(f, 'commit', sha, f.old_path!, sha + '^')
    expect(newLink!.url).toBe('/view/src/New.tsx?view=code&ref=' + sha)
    expect(oldLink!.url).toBe('/view/src/Old.tsx?view=code&ref=' + sha + '%5E')
  })

  it('staged/unstaged diff omits ref=', () => {
    const link = viewLinkFor(file({ new_path: 'src/main.go' }), 'staged')
    expect(link!.url).toBe('/view/src/main.go?view=code')
    const link2 = viewLinkFor(file({ new_path: 'src/main.go' }), 'unstaged')
    expect(link2!.url).toBe('/view/src/main.go?view=code')
  })

  it('image files omit view=', () => {
    const sha = 'd'.repeat(40)
    const link = viewLinkFor(file({ new_path: 'docs/logo.png' }), 'commit', sha)
    expect(link!.url).toBe('/view/docs/logo.png?ref=' + sha)
    expect(link!.url).not.toContain('view=')
  })

  it('non-previewable (zip) omits view=', () => {
    const sha = 'e'.repeat(40)
    const link = viewLinkFor(file({ new_path: 'release.zip' }), 'commit', sha)
    expect(link!.url).toBe('/view/release.zip?ref=' + sha)
  })

  it('binary entries still get a link', () => {
    const sha = 'f'.repeat(40)
    const link = viewLinkFor(file({ new_path: 'data.bin', is_binary: true }), 'commit', sha)
    expect(link).not.toBeNull()
    // Unknown extension → defaults to code per the helper's rule (server
    // would classify with sniffer; client uses an extension-based heuristic
    // for default view only). The link still exists.
    expect(link!.url).toContain('/view/data.bin')
    expect(link!.url).toContain('ref=' + sha)
  })

  it('returns null when no path is available', () => {
    const link = viewLinkFor(file({ old_path: null, new_path: null }), 'commit', 'x'.repeat(40))
    expect(link).toBeNull()
  })
})

describe('FileDiffCard filename rendering', () => {
  it('renders a non-rename filename as an <a target="_blank"> link for a commit diff', () => {
    const sha = 'a'.repeat(40)
    const { container } = render(
      <MemoryRouter>
        <FileDiffCard file={file({ new_path: 'src/main.go' })} source="commit" sha={sha} />
      </MemoryRouter>,
    )
    const link = container.querySelector('.filediff-path-link') as HTMLAnchorElement | null
    expect(link).not.toBeNull()
    expect(link!.getAttribute('target')).toBe('_blank')
    expect(link!.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link!.getAttribute('href')).toBe('/view/src/main.go?view=code&ref=' + sha)
  })

  it('renders two links for a rename (old_path with ^, new_path raw)', () => {
    const sha = 'b'.repeat(40)
    const renamed = file({
      status: 'R',
      old_path: 'src/Old.tsx',
      new_path: 'src/New.tsx',
    })
    const { container } = render(
      <MemoryRouter>
        <FileDiffCard file={renamed} source="commit" sha={sha} />
      </MemoryRouter>,
    )
    const links = container.querySelectorAll('.filediff-path-link') as NodeListOf<HTMLAnchorElement>
    expect(links.length).toBe(2)
    expect(links[0].textContent).toBe('src/Old.tsx')
    expect(links[0].getAttribute('href')).toBe('/view/src/Old.tsx?view=code&ref=' + sha + '%5E')
    expect(links[1].textContent).toBe('src/New.tsx')
    expect(links[1].getAttribute('href')).toBe('/view/src/New.tsx?view=code&ref=' + sha)
  })

  it('staged diff link has no ref= parameter', () => {
    const { container } = render(
      <MemoryRouter>
        <FileDiffCard file={file({ new_path: 'README.md' })} source="staged" />
      </MemoryRouter>,
    )
    const link = container.querySelector('.filediff-path-link') as HTMLAnchorElement | null
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('/view/README.md?view=preview')
  })

  it('unstaged diff link has no ref= parameter', () => {
    const { container } = render(
      <MemoryRouter>
        <FileDiffCard file={file({ new_path: 'src/main.go' })} source="unstaged" />
      </MemoryRouter>,
    )
    const link = container.querySelector('.filediff-path-link') as HTMLAnchorElement | null
    expect(link!.getAttribute('href')).toBe('/view/src/main.go?view=code')
  })

  it('binary file renders a link (still wired up despite the non-expandable card shell)', () => {
    const sha = 'c'.repeat(40)
    const { container } = render(
      <MemoryRouter>
        <FileDiffCard
          file={file({ new_path: 'data.bin', is_binary: true })}
          source="commit"
          sha={sha}
        />
      </MemoryRouter>,
    )
    const link = container.querySelector('.filediff-path-link') as HTMLAnchorElement | null
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toContain('ref=' + sha)
  })

  it('clicking the link does not toggle the diff card expand state', () => {
    const sha = 'd'.repeat(40)
    const { container } = render(
      <MemoryRouter>
        <FileDiffCard file={file({ new_path: 'src/main.go' })} source="commit" sha={sha} />
      </MemoryRouter>,
    )
    const card = container.querySelector('.filediff-card')!
    const link = container.querySelector('.filediff-path-link') as HTMLAnchorElement

    expect(card.classList.contains('is-expanded')).toBe(false)
    // fireEvent.click dispatches through React's synthetic event system, so
    // the link's onClick handler runs and calls stopPropagation. Without that
    // guard, the outer toggle would flip is-expanded to true on the same
    // click — that's the regression this test guards against.
    fireEvent.click(link)
    expect(card.classList.contains('is-expanded')).toBe(false)
  })
})
