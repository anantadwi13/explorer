import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import MarkdownRenderer from './MarkdownRenderer'

describe('MarkdownRenderer — syntax highlighting', () => {
  // 7.1: fenced ```go block produces hljs-* spans
  it('highlights a fenced go block with hljs- token classes', async () => {
    const md = '```go\npackage main\n\nfunc main() {}\n```'
    const { container } = render(<MarkdownRenderer content={md} currentPath="readme.md" />)
    const code = container.querySelector('code')
    expect(code).not.toBeNull()
    // At least one hljs-* class should appear
    const spans = container.querySelectorAll('[class*="hljs-"]')
    expect(spans.length).toBeGreaterThan(0)
    // Specific token classes guaranteed by this fixture
    const hasKeyword = container.querySelector('.hljs-keyword')
    expect(hasKeyword).not.toBeNull()
  })

  // 7.2: fenced ```kotlin block (newly registered language)
  it('highlights a fenced kotlin block', async () => {
    const md = '```kotlin\nfun main() {\n    println("Hello")\n}\n```'
    const { container } = render(<MarkdownRenderer content={md} currentPath="readme.md" />)
    const spans = container.querySelectorAll('[class*="hljs-"]')
    expect(spans.length).toBeGreaterThan(0)
  })

  // 7.3: script tag is stripped; hljs classes survive
  it('strips <script> but preserves hljs classes', async () => {
    const md = '<script>alert(1)</script>\n\n```go\npackage main\n```'
    const { container } = render(<MarkdownRenderer content={md} currentPath="readme.md" />)
    const scripts = container.querySelectorAll('script')
    expect(scripts.length).toBe(0)
    const spans = container.querySelectorAll('[class*="hljs-"]')
    expect(spans.length).toBeGreaterThan(0)
  })

  // 6.3: inline code stays plain (no hljs- spans inside)
  it('does not highlight inline code', async () => {
    const md = 'Use `const x = 1` in your code.'
    const { container } = render(<MarkdownRenderer content={md} currentPath="readme.md" />)
    const inlineCode = container.querySelector('p code')
    expect(inlineCode).not.toBeNull()
    const spans = inlineCode!.querySelectorAll('[class*="hljs-"]')
    expect(spans.length).toBe(0)
  })

  // Unspecified fence stays plain
  it('does not highlight a fenced block without a language', async () => {
    const md = '```\nsome plain text\n```'
    const { container } = render(<MarkdownRenderer content={md} currentPath="readme.md" />)
    const spans = container.querySelectorAll('[class*="hljs-"]')
    expect(spans.length).toBe(0)
  })

  // Unknown language fence stays plain
  it('does not highlight an unknown-language fence', async () => {
    const md = '```esoteric\nsome weird syntax\n```'
    const { container } = render(<MarkdownRenderer content={md} currentPath="readme.md" />)
    const spans = container.querySelectorAll('[class*="hljs-"]')
    expect(spans.length).toBe(0)
  })
})
