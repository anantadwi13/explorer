import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import * as api from '../api/client'
import type { TreeEntry } from '../api/types'
import './TreeSidebar.css'

export default function TreeSidebar() {
  return (
    <div className="tree-sidebar">
      <TreeNode path="" depth={0} initialOpen />
    </div>
  )
}

interface TreeNodeProps {
  path: string
  depth: number
  initialOpen?: boolean
}

function TreeNode({ path, depth, initialOpen = false }: TreeNodeProps) {
  const [open] = useState(initialOpen)
  const [entries, setEntries] = useState<TreeEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    if (entries !== null) return
    setLoading(true)
    api.tree(path).then(res => {
      if (res.ok) setEntries(res.data.entries)
      setLoading(false)
    })
  }, [open, path, entries])

  if (depth === 0) {
    return (
      <ul className="tree-list" role="tree" aria-label="File tree">
        {loading && <li className="tree-loading">Loading…</li>}
        {entries?.map(e => (
          <TreeEntry key={e.name} entry={e} parentPath={path} depth={depth} />
        ))}
      </ul>
    )
  }

  return null
}

interface TreeEntryProps {
  entry: TreeEntry
  parentPath: string
  depth: number
}

function TreeEntry({ entry, parentPath, depth }: TreeEntryProps) {
  const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
  const location = useLocation()
  const isActive = location.pathname === `/view/${entryPath}` ||
    location.pathname === `/view/${entryPath}/`

  if (entry.type === 'dir') {
    return <DirEntry entry={entry} entryPath={entryPath} depth={depth} isActive={isActive} />
  }
  return (
    <li className={`tree-item${isActive ? ' active' : ''}`} role="treeitem" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
      <span className="tree-icon file-icon" aria-hidden="true">
        <FileIcon />
      </span>
      <Link to={`/view/${entryPath}`} className="tree-name">{entry.name}</Link>
    </li>
  )
}

function DirEntry({ entry, entryPath, depth, isActive }: { entry: TreeEntry; entryPath: string; depth: number; isActive: boolean }) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<TreeEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!open && children === null) {
      setLoading(true)
      api.tree(entryPath).then(res => {
        if (res.ok) setChildren(res.data.entries)
        setLoading(false)
      })
    }
    setOpen(o => !o)
  }

  return (
    <>
      <li
        className={`tree-item tree-dir${isActive ? ' active' : ''}`}
        role="treeitem"
        aria-expanded={open}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          className="tree-chevron"
          onClick={toggle}
          aria-label={open ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
        >
          <ChevronIcon open={open} />
        </button>
        <span className="tree-icon dir-icon" aria-hidden="true">
          <DirIcon />
        </span>
        <Link to={`/view/${entryPath}/`} className="tree-name">{entry.name}</Link>
      </li>
      {open && (
        <>
          {loading && (
            <li className="tree-loading" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>Loading…</li>
          )}
          {children?.map(child => (
            <TreeEntry key={child.name} entry={child} parentPath={entryPath} depth={depth + 1} />
          ))}
        </>
      )}
    </>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function DirIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--icon-dir)" aria-hidden="true">
      <path d="M1.75 4.5A.75.75 0 012.5 4h4l1.5 1.5H13a.75.75 0 01.75.75v6a.75.75 0 01-.75.75H2.5a.75.75 0 01-.75-.75V4.5z"/>
    </svg>
  )
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--icon-file)" aria-hidden="true">
      <path d="M3.75 1.5A.75.75 0 003 2.25v11.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75V5.25L9.25 1.5H3.75zm5.5.75l2.25 2.25H9.25V2.25z"/>
    </svg>
  )
}
