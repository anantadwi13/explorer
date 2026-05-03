import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import * as api from '../api/client'
import type { TreeEntry } from '../api/types'
import { useLayout } from './LayoutContext'
import { CaretIcon, FolderIcon, FileIcon } from './icons'
import './TreeSidebar.css'

export default function TreeSidebar() {
  const [entries, setEntries] = useState<TreeEntry[] | null>(null)
  const loading = entries === null

  useEffect(() => {
    api.tree('').then((res) => {
      if (res.ok) setEntries(res.data.entries)
      else setEntries([])
    })
  }, [])

  return (
    <div className="tree" role="tree" aria-label="File tree">
      {loading && <div className="tree-loading">Loading…</div>}
      {entries?.map((e) => (
        <TreeEntryNode key={e.name} entry={e} parentPath="" />
      ))}
    </div>
  )
}

interface NodeProps {
  entry: TreeEntry
  parentPath: string
}

function TreeEntryNode({ entry, parentPath }: NodeProps) {
  const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
  const location = useLocation()
  const { closeSidebar } = useLayout()
  const isActive =
    location.pathname === `/view/${entryPath}` ||
    location.pathname === `/view/${entryPath}/`

  if (entry.type === 'dir') {
    return (
      <DirNode
        entry={entry}
        entryPath={entryPath}
        isActive={isActive}
        onNavigate={closeSidebar}
      />
    )
  }
  return (
    <div className="tree-node">
      <Link
        to={`/view/${entryPath}`}
        className={`tree-row${isActive ? ' is-active' : ''}`}
        role="treeitem"
        onClick={closeSidebar}
      >
        <span className="tree-caret tree-caret-empty" aria-hidden="true" />
        <FileIcon />
        <span className="tree-label">{entry.name}</span>
      </Link>
    </div>
  )
}

interface DirNodeProps {
  entry: TreeEntry
  entryPath: string
  isActive: boolean
  onNavigate: () => void
}

function DirNode({ entry, entryPath, isActive, onNavigate }: DirNodeProps) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<TreeEntry[] | null>(null)
  const [loadStarted, setLoadStarted] = useState(false)
  const loading = loadStarted && children === null

  const loadChildren = () => {
    if (loadStarted) return
    setLoadStarted(true)
    api.tree(entryPath).then((res) => {
      setChildren(res.ok ? res.data.entries : [])
    })
  }

  const onCaret = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!open) loadChildren()
    setOpen((o) => !o)
  }

  return (
    <div className="tree-node">
      <Link
        to={`/view/${entryPath}/`}
        className={`tree-row${isActive ? ' is-active' : ''}`}
        role="treeitem"
        aria-expanded={open}
        onClick={onNavigate}
      >
        <button
          className={`tree-caret${open ? ' is-open' : ''}`}
          onClick={onCaret}
          aria-label={open ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
        >
          <CaretIcon />
        </button>
        <FolderIcon />
        <span className="tree-label">{entry.name}</span>
      </Link>
      {open && (
        <div className="tree-children">
          {loading && <div className="tree-loading">Loading…</div>}
          {children?.map((c) => (
            <TreeEntryNode key={c.name} entry={c} parentPath={entryPath} />
          ))}
        </div>
      )}
    </div>
  )
}
