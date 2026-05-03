import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api/client'
import type { TreeEntry, ApiError } from '../api/types'
import './FolderListing.css'

interface Props {
  path: string
}

export default function FolderListing({ path }: Props) {
  const [entries, setEntries] = useState<TreeEntry[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setEntries(null)
    setError(null)
    api.tree(path).then(res => {
      if (res.ok) {
        setEntries(res.data.entries)
      } else {
        setError(res.error)
      }
      setLoading(false)
    })
  }, [path])

  if (loading) {
    return <div className="listing-state listing-loading">Loading…</div>
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
    return <div className="listing-state listing-empty">This folder is empty.</div>
  }

  return (
    <table className="listing-table" aria-label={`Contents of ${path || 'root'}`}>
      <thead>
        <tr>
          <th>Name</th>
          <th className="listing-cell-size">Size</th>
          <th className="listing-cell-mtime">Modified</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(e => (
          <EntryRow key={e.name} entry={e} parentPath={path} />
        ))}
      </tbody>
    </table>
  )
}

function EntryRow({ entry, parentPath }: { entry: TreeEntry; parentPath: string }) {
  const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
  const href = entry.type === 'dir' ? `/view/${entryPath}/` : `/view/${entryPath}`

  return (
    <tr className="listing-row">
      <td className="listing-cell-name">
        <span className="listing-icon" aria-hidden="true">
          {entry.type === 'dir' ? <DirIcon /> : <FileIcon />}
        </span>
        <Link to={href}>
          {entry.name}{entry.type === 'dir' ? '/' : ''}
        </Link>
      </td>
      <td className="listing-cell-size">
        {entry.size != null ? formatSize(entry.size) : '—'}
      </td>
      <td className="listing-cell-mtime">
        {entry.mtime ? formatDate(entry.mtime) : '—'}
      </td>
    </tr>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function errorTitle(kind: string): string {
  switch (kind) {
    case 'not_found': return 'Not Found'
    case 'permission_denied': return 'Permission Denied'
    case 'outside_root': return 'Access Denied'
    default: return 'Error'
  }
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
