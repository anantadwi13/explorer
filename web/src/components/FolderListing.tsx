import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api/client'
import type { TreeEntry, ApiError } from '../api/types'
import { useViewMode } from '../hooks/useViewMode'
import { useLayout } from './LayoutContext'
import { iconForFile, isImage } from './iconForFile'
import EmptyState from './EmptyState'
import { formatSize, formatDate } from './format'
import './FolderListing.css'

type SortKey = 'name' | 'modified' | 'size'
type SortDir = 'asc' | 'desc'

interface Props {
  path: string
}

export default function FolderListing({ path }: Props) {
  const [entries, setEntries] = useState<TreeEntry[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [view] = useViewMode()
  const { search } = useLayout()
  const [sortBy, setSortBy] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  // Sort defaults reset on `path` change because ViewPage gives us a fresh
  // `key={path}`, which remounts this component. See spec D11.

  const loading = entries === null && error === null

  useEffect(() => {
    api.tree(path).then((res) => {
      if (res.ok) setEntries(res.data.entries)
      else setError(res.error)
    })
  }, [path])

  const items = useMemo(() => {
    if (!entries) return []
    const q = search.trim().toLowerCase()
    const filtered = q
      ? entries.filter((e) => e.name.toLowerCase().includes(q))
      : entries.slice()
    const dir = sortDir === 'asc' ? 1 : -1
    filtered.sort((a, b) => {
      // folders always above files
      if ((a.type === 'dir') !== (b.type === 'dir')) {
        return a.type === 'dir' ? -1 : 1
      }
      let av: string | number = ''
      let bv: string | number = ''
      if (sortBy === 'name') {
        av = a.name.toLowerCase()
        bv = b.name.toLowerCase()
      } else if (sortBy === 'size') {
        av = a.size ?? 0
        bv = b.size ?? 0
      } else if (sortBy === 'modified') {
        av = a.mtime ?? ''
        bv = b.mtime ?? ''
      }
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
    return filtered
  }, [entries, search, sortBy, sortDir])

  const onSort = (col: SortKey) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else {
      setSortBy(col)
      setSortDir('asc')
    }
  }

  if (loading) {
    return <div className="listing-state">Loading…</div>
  }

  if (error) {
    return (
      <div className="listing-state listing-error" role="alert">
        <strong>{errorTitle(error.error)}</strong>
        <p>{error.message}</p>
      </div>
    )
  }

  if (!entries || entries.length === 0) {
    return <EmptyState title="This folder is empty" />
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No matches"
        hint={`Nothing here matches "${search}".`}
      />
    )
  }

  return (
    <div className={`folder-body view-${view}`}>
      {view === 'list' && (
        <FolderHeader sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
      )}
      {view === 'list' ? (
        <div className="rows">
          {items.map((e) => (
            <ListRow key={e.name} entry={e} parentPath={path} />
          ))}
        </div>
      ) : (
        <div className="tiles">
          {items.map((e) => (
            <TileItem key={e.name} entry={e} parentPath={path} />
          ))}
        </div>
      )}
    </div>
  )
}

interface HeaderProps {
  sortBy: SortKey
  sortDir: SortDir
  onSort: (col: SortKey) => void
}

function FolderHeader({ sortBy, sortDir, onSort }: HeaderProps) {
  const arrow = sortDir === 'asc' ? '↑' : '↓'
  return (
    <div className="folder-head">
      <button
        className={`fh-col fh-name${sortBy === 'name' ? ' is-sorted' : ''}`}
        onClick={() => onSort('name')}
      >
        Name {sortBy === 'name' && <span className="fh-arrow">{arrow}</span>}
      </button>
      <button
        className={`fh-col fh-mod${sortBy === 'modified' ? ' is-sorted' : ''}`}
        onClick={() => onSort('modified')}
      >
        Modified {sortBy === 'modified' && <span className="fh-arrow">{arrow}</span>}
      </button>
      <button
        className={`fh-col fh-size${sortBy === 'size' ? ' is-sorted' : ''}`}
        onClick={() => onSort('size')}
      >
        Size {sortBy === 'size' && <span className="fh-arrow">{arrow}</span>}
      </button>
    </div>
  )
}

interface RowProps {
  entry: TreeEntry
  parentPath: string
}

function ListRow({ entry, parentPath }: RowProps) {
  const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
  const href = entry.type === 'dir' ? `/view/${entryPath}/` : `/view/${entryPath}`
  return (
    <Link to={href} className="row">
      <span className="row-icon">{iconForFile(entry)}</span>
      <span className="row-name">{entry.name}</span>
      <span className="row-mod">{entry.type === 'dir' ? '—' : formatDate(entry.mtime)}</span>
      <span className="row-size">
        {entry.type === 'dir' ? '—' : formatSize(entry.size)}
      </span>
    </Link>
  )
}

function TileItem({ entry, parentPath }: RowProps) {
  const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
  const href = entry.type === 'dir' ? `/view/${entryPath}/` : `/view/${entryPath}`
  const folder = entry.type === 'dir'
  const image = !folder && isImage(entry)
  return (
    <Link to={href} className={`tile${folder ? ' tile-folder' : ''}`}>
      <div className="tile-thumb">
        {image ? (
          <img src={`/raw/${entryPath}`} alt="" loading="lazy" />
        ) : (
          <div className="tile-icon">{iconForFile(entry)}</div>
        )}
      </div>
      <div className="tile-name" title={entry.name}>
        {entry.name}
      </div>
      <div className="tile-meta">
        {folder ? '' : formatSize(entry.size)}
      </div>
    </Link>
  )
}

function errorTitle(kind: string): string {
  switch (kind) {
    case 'not_found': return 'Not Found'
    case 'permission_denied': return 'Permission Denied'
    case 'outside_root': return 'Access Denied'
    default: return 'Error'
  }
}
