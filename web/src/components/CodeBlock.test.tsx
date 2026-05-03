import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import CodeBlock from './CodeBlock'

describe('CodeBlock', () => {
  // 7.4: unknown language renders plain <code class="hljs"> with no token spans
  it('renders plain code for null language', () => {
    const { container } = render(<CodeBlock code="some plain text" language={null} />)
    const code = container.querySelector('code')
    expect(code).not.toBeNull()
    expect(code!.className).toBe('hljs')
    expect(code!.textContent).toBe('some plain text')
    const spans = container.querySelectorAll('[class*="hljs-"]')
    expect(spans.length).toBe(0)
  })

  it('renders plain code for an unregistered language', () => {
    const { container } = render(<CodeBlock code="some text" language="esoteric" />)
    const code = container.querySelector('code')
    expect(code).not.toBeNull()
    expect(code!.className).toBe('hljs')
    const spans = container.querySelectorAll('[class*="hljs-"]')
    expect(spans.length).toBe(0)
  })

  it('renders highlighted code for go', () => {
    const { container } = render(
      <CodeBlock code="package main\n\nfunc main() {}" language="go" />
    )
    const code = container.querySelector('code')
    expect(code).not.toBeNull()
    expect(code!.classList.contains('hljs')).toBe(true)
    expect(code!.classList.contains('language-go')).toBe(true)
    const spans = container.querySelectorAll('[class*="hljs-"]')
    expect(spans.length).toBeGreaterThan(0)
  })
})
