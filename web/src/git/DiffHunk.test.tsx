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
})
