import type { ReactNode } from 'react'
import type { Root, Element, Text } from 'hast'
import { lowlight } from './syntax/grammars'

interface Props {
  code: string
  language: string | null
  wrap?: boolean
}

type HastNode = Root['children'][number]

function renderHastToReact(node: HastNode, key: number): ReactNode {
  if (node.type === 'text') {
    return (node as Text).value
  }
  if (node.type === 'element') {
    const el = node as Element
    const className = Array.isArray(el.properties?.className)
      ? (el.properties.className as string[]).join(' ')
      : undefined
    const children = el.children.map((child, i) =>
      renderHastToReact(child as HastNode, i)
    )
    return <span key={key} className={className}>{children}</span>
  }
  return null
}

// highlightLine tokenises a single line with the given grammar. Errors fall
// back to the raw text — never a crash. Mirrors DiffHunk.highlightLine.
function highlightLine(text: string, language: string): ReactNode {
  try {
    const result = lowlight.highlight(language, text)
    return result.children.map((child, i) => renderHastToReact(child as HastNode, i))
  } catch {
    return text
  }
}

// splitLines splits source by \n and drops a trailing empty element if the
// file ends in \n. So "a\nb\n" → ["a", "b"] (the trailing-newline rule from
// design.md Decision 10). Matches how git, editors, and wc -l count lines.
function splitLines(code: string): string[] {
  const parts = code.split('\n')
  if (parts.length > 0 && parts[parts.length - 1] === '') {
    parts.pop()
  }
  return parts
}

export default function CodeBlock({ code, language, wrap = true }: Props) {
  const isRegistered = language !== null && lowlight.registered(language)
  const lines = splitLines(code)

  const codeClass = isRegistered ? `hljs language-${language}` : 'hljs'
  const preClass = `code-block ${wrap ? 'wrap-on' : 'wrap-off'}`

  return (
    <pre className={preClass}>
      <code className={codeClass}>
        {lines.map((line, i) => {
          const rendered: ReactNode = isRegistered
            ? highlightLine(line || ' ', language!)
            : line || ' '
          return (
            <span key={i} className="code-line">
              <span className="line-no" aria-hidden="true">{i + 1}</span>
              <span className="line-text">{rendered}</span>
            </span>
          )
        })}
      </code>
    </pre>
  )
}
