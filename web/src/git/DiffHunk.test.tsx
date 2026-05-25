import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import DiffHunk from './DiffHunk'
import type { GitHunk } from '../api/types'

const goHunk: GitHunk = {
  old_start: 1,
  old_lines: 2,
  new_start: 1,
  new_lines: 3,
  header: '',
  lines: [
    { type: 'context', text: 'package main' },
    { type: 'del', text: '// old comment' },
    { type: 'add', text: '// new comment' },
    { type: 'add', text: 'func hi() {}' },
  ],
}

describe('DiffHunk', () => {
  it('renders plain monospace when language is not registered', () => {
    const { container } = render(<DiffHunk hunk={goHunk} language={null} />)
    // No hljs-* token spans.
    expect(container.querySelectorAll('[class^="hljs-"]').length).toBe(0)
    // No .hljs wrapper class on the text spans either.
    expect(container.querySelector('.diff-line-text.hljs')).toBeNull()
  })

  it('emits hljs-* token spans for a registered language', () => {
    const { container } = render(<DiffHunk hunk={goHunk} language="go" />)
    // The .hljs wrapper is applied so colours are predictable.
    expect(container.querySelector('.diff-line-text.hljs')).not.toBeNull()
    // Tokens like `package` / `func` / comments should produce hljs-* spans.
    const tokens = container.querySelectorAll('[class*="hljs-"]')
    expect(tokens.length).toBeGreaterThan(0)
  })

  it('keeps the +/- marker outside the highlighted text span', () => {
    const { container } = render(<DiffHunk hunk={goHunk} language="go" />)
    // Every diff-line should have BOTH a marker span and a text span.
    for (const line of container.querySelectorAll('.diff-line')) {
      const marker = line.querySelector('.diff-line-marker')
      const text = line.querySelector('.diff-line-text')
      expect(marker).not.toBeNull()
      expect(text).not.toBeNull()
      // Marker is a sibling of the text, not its descendant.
      expect(marker?.contains(text!)).toBe(false)
    }
  })

  it('does not crash on unknown grammar gracefully', () => {
    const { container } = render(<DiffHunk hunk={goHunk} language="not-a-real-language" />)
    expect(container.querySelector('.diff-line-text')).not.toBeNull()
  })

  it('uses wrap-on by default', () => {
    const { container } = render(<DiffHunk hunk={goHunk} />)
    expect(container.querySelector('.diff-hunk-body.wrap-on')).not.toBeNull()
    expect(container.querySelector('.diff-hunk-body.wrap-off')).toBeNull()
  })

  it('uses wrap-off when wrap=false', () => {
    const { container } = render(<DiffHunk hunk={goHunk} wrap={false} />)
    expect(container.querySelector('.diff-hunk-body.wrap-off')).not.toBeNull()
    expect(container.querySelector('.diff-hunk-body.wrap-on')).toBeNull()
  })

  it('wraps lines in an inner .diff-hunk-lines container (used by wrap-off CSS to extend backgrounds)', () => {
    const { container } = render(<DiffHunk hunk={goHunk} wrap={false} />)
    const wrapper = container.querySelector('.diff-hunk-body .diff-hunk-lines')
    expect(wrapper).not.toBeNull()
    // Lines are direct children of the wrapper.
    expect(wrapper?.querySelectorAll(':scope > .diff-line').length).toBe(goHunk.lines.length)
  })

  describe('line-number gutter', () => {
    it('shows both old and new numbers on a context line', () => {
      const hunk: GitHunk = {
        old_start: 42,
        old_lines: 1,
        new_start: 58,
        new_lines: 1,
        header: '',
        lines: [{ type: 'context', text: 'package main' }],
      }
      const { container } = render(<DiffHunk hunk={hunk} language={null} />)
      const line = container.querySelector('.diff-line')!
      const oldCell = line.querySelector('.diff-gutter-old')!
      const newCell = line.querySelector('.diff-gutter-new')!
      expect(oldCell.textContent).toBe('42')
      expect(newCell.textContent).toBe('58')
    })

    it('shows only the new number on an add line; old column blank but present', () => {
      const hunk: GitHunk = {
        old_start: 1,
        old_lines: 0,
        new_start: 59,
        new_lines: 1,
        header: '',
        lines: [{ type: 'add', text: 'new line' }],
      }
      const { container } = render(<DiffHunk hunk={hunk} language={null} />)
      const line = container.querySelector('.diff-line.diff-line-add')!
      const oldCell = line.querySelector('.diff-gutter-old')!
      const newCell = line.querySelector('.diff-gutter-new')!
      expect(oldCell).not.toBeNull()
      expect(oldCell.textContent).toBe('')
      expect(newCell.textContent).toBe('59')
    })

    it('shows only the old number on a del line; new column blank but present', () => {
      const hunk: GitHunk = {
        old_start: 43,
        old_lines: 1,
        new_start: 1,
        new_lines: 0,
        header: '',
        lines: [{ type: 'del', text: 'old line' }],
      }
      const { container } = render(<DiffHunk hunk={hunk} language={null} />)
      const line = container.querySelector('.diff-line.diff-line-del')!
      const oldCell = line.querySelector('.diff-gutter-old')!
      const newCell = line.querySelector('.diff-gutter-new')!
      expect(oldCell.textContent).toBe('43')
      expect(newCell).not.toBeNull()
      expect(newCell.textContent).toBe('')
    })

    it('walks numbers correctly through a mixed sequence (context, del, del, add, context)', () => {
      const hunk: GitHunk = {
        old_start: 42,
        old_lines: 4,
        new_start: 58,
        new_lines: 3,
        header: '',
        lines: [
          { type: 'context', text: 'a' },
          { type: 'del', text: 'b' },
          { type: 'del', text: 'c' },
          { type: 'add', text: 'd' },
          { type: 'context', text: 'e' },
        ],
      }
      const { container } = render(<DiffHunk hunk={hunk} language={null} />)
      const rows = Array.from(container.querySelectorAll('.diff-line')).map((row) => {
        const oldCell = row.querySelector('.diff-gutter-old')!
        const newCell = row.querySelector('.diff-gutter-new')!
        return [oldCell.textContent, newCell.textContent]
      })
      expect(rows).toEqual([
        ['42', '58'],
        ['43', ''],
        ['44', ''],
        ['', '59'],
        ['45', '60'],
      ])
    })

    it('gutter cells carry aria-hidden and the .diff-gutter class', () => {
      const { container } = render(<DiffHunk hunk={goHunk} language={null} />)
      const cells = container.querySelectorAll('.diff-gutter')
      expect(cells.length).toBe(goHunk.lines.length * 2)
      for (const cell of cells) {
        expect(cell.getAttribute('aria-hidden')).toBe('true')
      }
    })

    it('sets --gutter-old-w / --gutter-new-w from the actual digit count', () => {
      // 2-digit numbers → 3ch floor.
      const small: GitHunk = {
        old_start: 10, old_lines: 1, new_start: 10, new_lines: 1, header: '',
        lines: [{ type: 'context', text: 'a' }],
      }
      const r1 = render(<DiffHunk hunk={small} language={null} />)
      const w1 = r1.container.querySelector('.diff-hunk-lines') as HTMLElement
      expect(w1.style.getPropertyValue('--gutter-old-w')).toBe('3ch')
      expect(w1.style.getPropertyValue('--gutter-new-w')).toBe('3ch')

      // 3-digit numbers → 4ch (digits + 1ch padding).
      const mid: GitHunk = {
        old_start: 100, old_lines: 2, new_start: 200, new_lines: 2, header: '',
        lines: [
          { type: 'context', text: 'a' },
          { type: 'context', text: 'b' },
        ],
      }
      const r2 = render(<DiffHunk hunk={mid} language={null} />)
      const w2 = r2.container.querySelector('.diff-hunk-lines') as HTMLElement
      expect(w2.style.getPropertyValue('--gutter-old-w')).toBe('4ch')
      expect(w2.style.getPropertyValue('--gutter-new-w')).toBe('4ch')

      // Asymmetric — old fits in 3ch, new is 4-digit (5ch).
      const asym: GitHunk = {
        old_start: 1, old_lines: 1, new_start: 9999, new_lines: 1, header: '',
        lines: [{ type: 'context', text: 'a' }],
      }
      const r3 = render(<DiffHunk hunk={asym} language={null} />)
      const w3 = r3.container.querySelector('.diff-hunk-lines') as HTMLElement
      expect(w3.style.getPropertyValue('--gutter-old-w')).toBe('3ch')
      expect(w3.style.getPropertyValue('--gutter-new-w')).toBe('5ch')
    })

    it('blank gutter cells still render an element (so the grid column does not collapse)', () => {
      const hunk: GitHunk = {
        old_start: 1,
        old_lines: 0,
        new_start: 1,
        new_lines: 2,
        header: '',
        lines: [
          { type: 'add', text: 'one' },
          { type: 'add', text: 'two' },
        ],
      }
      const { container } = render(<DiffHunk hunk={hunk} language={null} />)
      for (const line of container.querySelectorAll('.diff-line')) {
        const oldCell = line.querySelector('.diff-gutter-old')
        const newCell = line.querySelector('.diff-gutter-new')
        expect(oldCell).not.toBeNull()
        expect(newCell).not.toBeNull()
      }
    })
  })
})
