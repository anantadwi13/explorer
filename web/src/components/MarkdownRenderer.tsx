import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { Plugin } from 'unified'
import type { Root } from 'hast'
import { visit } from 'unist-util-visit'
import { languages } from './syntax/grammars'
import './MarkdownRenderer.css'

// Extend the default sanitize schema to allow hljs-* class names on <code>
// and <span> (added by rehype-highlight), while stripping everything else.
const syntaxSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Allow `hljs` and `hljs-*` classes on <code> in addition to language-*.
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ['className', 'hljs', /^hljs(-[a-z_]+)*$/],
    ],
    // Allow hljs-* token classes on the <span> elements injected by the highlighter.
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ['className', /^hljs(-[a-z_]+)*$/],
    ],
  },
}

interface Props {
  content: string
  currentPath: string
}

function makeRewritePlugin(currentPath: string): Plugin<[], Root> {
  const currentDir = currentPath.includes('/')
    ? currentPath.substring(0, currentPath.lastIndexOf('/'))
    : ''

  function isAbsolute(url: string): boolean {
    return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url) || url.startsWith('/')
  }

  function rewrite(url: string, type: 'raw' | 'view'): string {
    if (!url || isAbsolute(url)) return url
    // Strip leading ./ so paths like ./img.png become img.png before joining
    const clean = url.replace(/^\.\//, '')
    const resolved = currentDir ? `${currentDir}/${clean}` : clean
    return type === 'raw' ? `/raw/${resolved}` : `/view/${resolved}`
  }

  return () => (tree: Root) => {
    visit(tree, 'element', node => {
      if (node.tagName === 'img' && node.properties?.src) {
        node.properties.src = rewrite(String(node.properties.src), 'raw')
      }
      if (node.tagName === 'a' && node.properties?.href) {
        node.properties.href = rewrite(String(node.properties.href), 'view')
      }
    })
  }
}

export default function MarkdownRenderer({ content, currentPath }: Props) {
  const rewritePlugin = makeRewritePlugin(currentPath)

  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rewritePlugin,
          [rehypeHighlight, { detect: false, languages }],
          [rehypeSanitize, syntaxSchema],
        ]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
