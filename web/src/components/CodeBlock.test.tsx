import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import CodeBlock from './CodeBlock'

describe('CodeBlock', () => {
  // 7.4: unknown language renders plain <code class="hljs"> with no token spans
  it('renders plain code for null language', () => {
    const { container } = render(<CodeBlock code="some plain text" language={null} />)
    const code = container.querySelector('code')
    expect(code).not.toBeNull()
    expect(code!.classList.contains('hljs')).toBe(true)
    // Plain text content lives inside the .line-text cell, gutter excluded.
    const lineText = container.querySelector('.line-text')!
    expect(lineText.textContent).toBe('some plain text')
    const spans = container.querySelectorAll('[class*="hljs-"]')
    expect(spans.length).toBe(0)
  })

  it('renders plain code for an unregistered language', () => {
    const { container } = render(<CodeBlock code="some text" language="esoteric" />)
    const code = container.querySelector('code')
    expect(code).not.toBeNull()
    expect(code!.classList.contains('hljs')).toBe(true)
    const spans = container.querySelectorAll('[class*="hljs-"]')
    expect(spans.length).toBe(0)
  })

  it('renders highlighted code for go', () => {
    const { container } = render(
      <CodeBlock code={'package main\n\nfunc main() {}'} language="go" />
    )
    const code = container.querySelector('code')
    expect(code).not.toBeNull()
    expect(code!.classList.contains('hljs')).toBe(true)
    expect(code!.classList.contains('language-go')).toBe(true)
    const spans = container.querySelectorAll('[class*="hljs-"]')
    expect(spans.length).toBeGreaterThan(0)
  })

  it('defaults to wrap-on when wrap prop is omitted', () => {
    const { container } = render(<CodeBlock code="x" language={null} />)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.classList.contains('wrap-on')).toBe(true)
    expect(pre!.classList.contains('wrap-off')).toBe(false)
  })

  it('applies wrap-off when wrap=false', () => {
    const { container } = render(<CodeBlock code="x" language={null} wrap={false} />)
    const pre = container.querySelector('pre')
    expect(pre!.classList.contains('wrap-off')).toBe(true)
    expect(pre!.classList.contains('wrap-on')).toBe(false)
  })

  it('applies wrap-on when wrap=true', () => {
    const { container } = render(<CodeBlock code="x" language={null} wrap={true} />)
    const pre = container.querySelector('pre')
    expect(pre!.classList.contains('wrap-on')).toBe(true)
  })

  describe('line-number gutter', () => {
    it('shows numbers 1..N for an N-line input', () => {
      const { container } = render(
        <CodeBlock code={'one\ntwo\nthree'} language={null} />
      )
      const nums = Array.from(container.querySelectorAll('.line-no')).map(
        (el) => el.textContent,
      )
      expect(nums).toEqual(['1', '2', '3'])
    })

    it('produces exactly N rows for a file ending in \\n (trailing-newline rule)', () => {
      const { container } = render(
        <CodeBlock code={'a\nb\n'} language={null} />
      )
      expect(container.querySelectorAll('.code-line').length).toBe(2)
      const nums = Array.from(container.querySelectorAll('.line-no')).map(
        (el) => el.textContent,
      )
      expect(nums).toEqual(['1', '2'])
    })

    it('gutter cells carry aria-hidden and the .line-no class', () => {
      const { container } = render(
        <CodeBlock code={'a\nb\nc'} language={null} />
      )
      const cells = container.querySelectorAll('.line-no')
      expect(cells.length).toBe(3)
      for (const cell of cells) {
        expect(cell.getAttribute('aria-hidden')).toBe('true')
        expect(cell.classList.contains('line-no')).toBe(true)
      }
    })

    it('plain-text path (no language) still produces line-numbered rows', () => {
      const { container } = render(
        <CodeBlock code={'plain one\nplain two'} language={null} />
      )
      expect(container.querySelectorAll('.code-line').length).toBe(2)
      expect(container.querySelectorAll('.line-no').length).toBe(2)
      const texts = Array.from(container.querySelectorAll('.line-text')).map(
        (el) => el.textContent,
      )
      expect(texts).toEqual(['plain one', 'plain two'])
    })

    it('wrap-off vs wrap-on produce the same row count (gutter is CSS-only)', () => {
      const code = 'a\nb\nc\nd'
      const on = render(<CodeBlock code={code} language={null} wrap={true} />)
      const off = render(<CodeBlock code={code} language={null} wrap={false} />)
      expect(on.container.querySelectorAll('.code-line').length).toBe(4)
      expect(off.container.querySelectorAll('.code-line').length).toBe(4)
    })
  })
})
