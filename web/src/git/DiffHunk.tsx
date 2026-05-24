import type { ReactNode } from 'react'
import type { Element, Root, Text } from 'hast'
import type { GitHunk } from '../api/types'
import { lowlight } from '../components/syntax/grammars'
import './DiffHunk.css'

interface Props {
  hunk: GitHunk
  // `language` is a highlight.js grammar id (e.g. "go", "typescript"). When
  // null or unregistered, lines render as plain monospace text. Resolved by
  // FileDiffCard via `extToLanguage(path)` so the renderer can stay pure.
  language?: string | null
  // `wrap` controls whether long lines wrap inside the hunk block (default,
  // matches the page-no-horizontal-scroll behaviour) or scroll horizontally
  // inside the hunk body. Plumbed from the page-level wrap toggle, which
  // reads/writes `localStorage["explorer.wrap"]` (shared with file viewer).
  wrap?: boolean
}

// DiffHunk renders one unified-diff hunk: a header row followed by the hunk's
// lines, each prefixed with a single character marker and shaded according to
// its add/del/context type. Source text inside each line is highlighted via
// the shared `lowlight` instance — note that highlighting runs per-line, so
// multi-line tokens (long strings, block comments) re-tokenise on each line.
// This is an acknowledged approximation, matching how GitHub-style diffs
// render. The marker is a SIBLING span outside the highlighted content so the
// diff palette governs its colour, not the grammar.
export default function DiffHunk({ hunk, language, wrap = true }: Props) {
  const headerText = `@@ -${hunk.old_start},${hunk.old_lines} +${hunk.new_start},${hunk.new_lines} @@${hunk.header ? ' ' + hunk.header : ''}`
  const useHljs = !!language && lowlight.registered(language)
  return (
    <div className="diff-hunk" role="group" aria-label={headerText}>
      <div className="diff-hunk-header">{headerText}</div>
      <pre className={`diff-hunk-body ${wrap ? 'wrap-on' : 'wrap-off'}`}>
        {/*
          The inner wrapper sizes to the longest line's intrinsic width when
          the pre is in wrap-off mode (`width: max-content; min-width: 100%`).
          Each `.diff-line` inside then takes 100% of the wrapper, so the
          add/del background tints extend across the full horizontally-
          scrollable width rather than stopping at the visible viewport.
        */}
        <span className="diff-hunk-lines">
          {hunk.lines.map((l, i) => {
            const marker = l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '
            const text = l.text || ' '
            const content = useHljs ? highlightLine(text, language!) : text
            return (
              <span key={i} className={`diff-line diff-line-${l.type}`}>
                <span className="diff-line-marker" aria-hidden="true">{marker}</span>
                <span className={useHljs ? 'diff-line-text hljs' : 'diff-line-text'}>{content}</span>
                {'\n'}
              </span>
            )
          })}
        </span>
      </pre>
    </div>
  )
}

type HastNode = Root['children'][number]

// highlightLine tokenises a single line with the given grammar and returns
// the resulting span tree. Errors (an empty line, a grammar throwing on
// malformed input) fall back to the raw text — never a crash.
function highlightLine(text: string, language: string): ReactNode {
  try {
    const result = lowlight.highlight(language, text)
    return result.children.map((child, i) => renderHast(child as HastNode, i))
  } catch {
    return text
  }
}

function renderHast(node: HastNode, key: number): ReactNode {
  if (node.type === 'text') {
    return (node as Text).value
  }
  if (node.type === 'element') {
    const el = node as Element
    const className = Array.isArray(el.properties?.className)
      ? (el.properties.className as string[]).join(' ')
      : undefined
    const children = el.children.map((child, i) => renderHast(child as HastNode, i))
    return <span key={key} className={className}>{children}</span>
  }
  return null
}
