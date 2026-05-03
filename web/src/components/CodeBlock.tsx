import type { ReactNode } from 'react'
import type { Root, Element, Text } from 'hast'
import { lowlight } from './syntax/grammars'

interface Props {
  code: string
  language: string | null
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

export default function CodeBlock({ code, language }: Props) {
  const isRegistered = language !== null && lowlight.registered(language)

  let inner: ReactNode

  if (isRegistered) {
    const result = lowlight.highlight(language!, code)
    inner = result.children.map((child, i) =>
      renderHastToReact(child as HastNode, i)
    )
  } else {
    inner = code
  }

  const codeClass = isRegistered
    ? `hljs language-${language}`
    : 'hljs'

  return (
    <pre className="code-block">
      <code className={codeClass}>{inner}</code>
    </pre>
  )
}
