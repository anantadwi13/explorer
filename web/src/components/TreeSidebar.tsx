import { useState, useEffect, useMemo, createContext, useContext, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api/client'
import type { TreeEntry } from '../api/types'
import { useLayout } from './LayoutContext'
import { CaretIcon, FolderIcon, FileIcon } from './icons'
import './TreeSidebar.css'

// Shared store for the lazy folder tree. The active path drives a reactive
// auto-reveal: ancestral folders of the URL'd file/folder are expanded and
// their levels fetched so the active row is rendered and highlighted. Manual
// expand/collapse is preserved across navigations because the effect only ever
// *adds* to `expanded`; it never removes.
interface TreeStore {
  activePath: string
  isActive: (entryPath: string) => boolean
  isExpanded: (folderPath: string) => boolean
  childrenOf: (folderPath: string) => TreeEntry[] | null // null = loading
  toggle: (folderPath: string) => void
}

const TreeStoreContext = createContext<TreeStore | null>(null)

function useTreeStore(): TreeStore {
  const ctx = useContext(TreeStoreContext)
  if (!ctx) throw new Error('useTreeStore must be used inside <TreeSidebar>')
  return ctx
}

// Derive the chain of folder levels whose children must be expanded and loaded
// so that the entry at `activePath` is rendered. The root level is `''`. For
// `notes/2026/report.md` this yields `["", "notes", "notes/2026"]`; for a
// folder `notes/2026` it yields `["", "notes"]` (the leaf "2026" lives in the
// "notes" level). The leaf's own level is not expanded (files have no children;
// an active folder is highlighted in its parent's level without opening it).
 function revealChain(activePath: string): string[] {
  const segments = activePath.split('/').filter(Boolean)
  const chain = ['']
  for (let i = 0; i < segments.length - 1; i++) {
    chain.push(segments.slice(0, i + 1).join('/'))
    }
  return chain
  }

   // Add the reveal chain for `activePath` to `prev`, returning an identical
   // reference when nothing changes so render is a no-op once the chain is in.
 function appendRevealChain(prev: Set<string>, activePath: string): Set<string> {
   if (!activePath) return prev
   const chain = revealChain(activePath)
   if (chain.every((p) => prev.has(p))) return prev
   const next = new Set(prev)
   for (const p of chain) next.add(p)
   return next
     }

export default function TreeSidebar({ activePath }: { activePath: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
   // Map value of null means "loading". Root (`''`) is fetched on mount.
  const [children, setChildren] = useState<Map<string, TreeEntry[] | null>>(new Map())
   // Refs (not state) so loadChildren keeps a stable identity and dedups both
   // in-flight and already-resolved levels — this keeps the reveal effect free
   // of update churn.
  const loaded = useRef<Set<string>>(new Set())
  const inflight = useRef<Set<string>>(new Set())

  const loadChildren = useCallback(async (folderPath: string) => {
     if (loaded.current.has(folderPath)) return
     if (inflight.current.has(folderPath)) return
     inflight.current.add(folderPath)
     setChildren((prev) => {
       const next = new Map(prev)
       next.set(folderPath, null)
       return next
       })
     const res = await api.tree(folderPath)
     inflight.current.delete(folderPath)
     loaded.current.add(folderPath)
     setChildren((prev) => {
       const next = new Map(prev)
       next.set(folderPath, res.ok ? res.data.entries : [])
       return next
       })
      }, [])

   // Fetch the root level once on mount.
  useEffect(() => {
     void loadChildren('')
     }, [loadChildren])

    // Auto-reveal the ancestors of the active path by adding their folders to the
    // expanded set. This is done during render (the "adjust state when a value
    // changes" pattern used in Layout.tsx) rather than in an effect: a navigation
    // to a new path re-expands its chain without wiping folders the user opened by
    // hand, and it only ever adds, so a manually collapsed ancestor is re-expanded
    // on the next navigation to it. A separate effect performs the level fetches.
  const [revealedPath, setRevealedPath] = useState<string | null>(null)
  if (revealedPath !== activePath) {
    setRevealedPath(activePath)
    setExpanded((prev) => appendRevealChain(prev, activePath))
      }

  useEffect(() => {
    if (!activePath) return
    for (const p of revealChain(activePath)) void loadChildren(p)
     }, [activePath, loadChildren])

  const isActive = useCallback((entryPath: string) => entryPath === activePath, [activePath])
  const isExpanded = useCallback((folderPath: string) => expanded.has(folderPath), [expanded])
  const childrenOf = useCallback((folderPath: string) => children.get(folderPath) ?? null, [children])
  const toggle = useCallback((folderPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(folderPath)) {
        next.delete(folderPath)
        return next
      }
      void loadChildren(folderPath)
      next.add(folderPath)
      return next
    })
  }, [loadChildren])

  const store = useMemo<TreeStore>(
    () => ({ activePath, isActive, isExpanded, childrenOf, toggle }),
    [activePath, isActive, isExpanded, childrenOf, toggle],
  )

   // Scroll the active row into view when (or as it) mounts. A stable callback
   // ref fires on mount/unmount, so when an auto-revealed ancestor finishes
   // loading and the active leaf appears, this scrolls it in. jsdom lacks
   // scrollIntoView, so guard it.
   const activeRef = useRef<HTMLElement | null>(null)
   const setActiveRef = useCallback((node: HTMLElement | null) => {
      activeRef.current = node
      if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest', inline: 'nearest' })
       }, [])

  const rootEntries = children.get('')
  const loadingRoot = rootEntries === null

  return (
    <TreeStoreContext.Provider value={store}>
      <div className="tree" role="tree" aria-label="File tree">
        {loadingRoot && <div className="tree-loading">Loading…</div>}
        {rootEntries?.map((e) => (
          <TreeEntryNode
           key={e.name}
           entry={e}
           parentPath=""
           setActiveRef={setActiveRef}
           />
        ))}
       </div>
      </TreeStoreContext.Provider>
     )
}

interface NodeProps {
  entry: TreeEntry
  parentPath: string
  setActiveRef: (node: HTMLElement | null) => void
}

function TreeEntryNode({ entry, parentPath, setActiveRef }: NodeProps) {
  const store = useTreeStore()
  const { closeSidebar } = useLayout()
  const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
  const isActive = store.isActive(entryPath)

  if (entry.type === 'dir') {
   return <DirNode entry={entry} entryPath={entryPath} setActiveRef={setActiveRef} />
    }
  return (
     <div className="tree-node">
       <Link
       to={`/view/${entryPath}`}
       ref={isActive ? setActiveRef : undefined}
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
  setActiveRef: (node: HTMLElement | null) => void
}

function DirNode({ entry, entryPath, setActiveRef }: DirNodeProps) {
  const store = useTreeStore()
  const { closeSidebar } = useLayout()
  const open = store.isExpanded(entryPath)
  const childEntries = store.childrenOf(entryPath)
  const loading = childEntries === null
  const isActive = store.isActive(entryPath)

  const onCaret = (e: React.MouseEvent) => {
     e.preventDefault()
    e.stopPropagation()
     store.toggle(entryPath)
      }

  return (
     <div className="tree-node">
       <Link
       to={`/view/${entryPath}/`}
       ref={isActive ? setActiveRef : undefined}
       className={`tree-row${isActive ? ' is-active' : ''}`}
       role="treeitem"
       aria-expanded={open}
       onClick={closeSidebar}
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
          {childEntries?.map((c) => (
            <TreeEntryNode key={c.name} entry={c} parentPath={entryPath} setActiveRef={setActiveRef} />
           ))}
         </div>
       )}
     </div>
    )
}
