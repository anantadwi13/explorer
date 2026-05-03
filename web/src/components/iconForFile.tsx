import type { ReactNode } from 'react'
import type { TreeEntry } from '../api/types'
import {
  FolderIcon,
  FileIcon,
  ImageIcon,
  MarkdownIcon,
  TextIcon,
  CodeIcon,
} from './icons'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'])
const MARKDOWN_EXTS = new Set(['md', 'markdown'])
const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'go', 'rs', 'py', 'rb', 'java',
  'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh',
  'sql', 'json', 'yaml', 'yml', 'toml', 'xml', 'html', 'css', 'scss',
])
const TEXT_EXTS = new Set(['txt', 'log', 'csv', 'tsv'])

export type EntryKind = 'folder' | 'image' | 'markdown' | 'code' | 'text' | 'file'

export function entryKind(entry: TreeEntry): EntryKind {
  if (entry.type === 'dir') return 'folder'
  const mime = entry.mime ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'text/markdown') return 'markdown'

  const ext = extension(entry.name)
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (MARKDOWN_EXTS.has(ext)) return 'markdown'
  if (CODE_EXTS.has(ext)) return 'code'
  if (TEXT_EXTS.has(ext)) return 'text'
  if (mime.startsWith('text/')) return 'text'
  return 'file'
}

export function iconForFile(entry: TreeEntry): ReactNode {
  switch (entryKind(entry)) {
    case 'folder': return <FolderIcon />
    case 'image': return <ImageIcon />
    case 'markdown': return <MarkdownIcon />
    case 'code': return <CodeIcon />
    case 'text': return <TextIcon />
    default: return <FileIcon />
  }
}

function extension(name: string): string {
  const i = name.lastIndexOf('.')
  if (i < 0) return ''
  return name.slice(i + 1).toLowerCase()
}

export function isImage(entry: TreeEntry): boolean {
  return entryKind(entry) === 'image'
}
