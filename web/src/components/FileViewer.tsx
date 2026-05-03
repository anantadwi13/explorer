import { useEffect, useState } from 'react'
import * as api from '../api/client'
import type { FileResponse, ApiError } from '../api/types'
import MarkdownRenderer from './MarkdownRenderer'
import './FileViewer.css'

interface Props {
  path: string
}

export default function FileViewer({ path }: Props) {
  const [data, setData] = useState<FileResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setData(null)
    setError(null)
    api.file(path).then(res => {
      if (res.ok) {
        setData(res.data)
      } else {
        setError(res.error)
      }
      setLoading(false)
    })
  }, [path])

  if (loading) {
    return <div className="viewer-state">Loading…</div>
  }

  if (error) {
    return <ErrorView error={error} path={path} />
  }

  if (!data) return null

  const filename = path.split('/').pop() ?? path

  return (
    <div className="viewer">
      <ViewerHeader data={data} filename={filename} />
      <div className="viewer-content">
        {data.kind === 'markdown' && (
          <MarkdownRenderer content={data.content!} currentPath={path} />
        )}
        {data.kind === 'text' && (
          <TextRenderer content={data.content!} />
        )}
        {data.kind === 'image' && (
          <ImageRenderer path={path} filename={filename} />
        )}
      </div>
    </div>
  )
}

function ViewerHeader({ data, filename }: { data: FileResponse; filename: string }) {
  return (
    <div className="viewer-header">
      <span className="viewer-filename">{filename}</span>
      <div className="viewer-meta">
        <span>{formatSize(data.size)}</span>
        <span className="viewer-meta-sep">·</span>
        <span>{formatDate(data.mtime)}</span>
      </div>
    </div>
  )
}

function TextRenderer({ content }: { content: string }) {
  return (
    <pre className="viewer-pre">{content}</pre>
  )
}

function ImageRenderer({ path, filename }: { path: string; filename: string }) {
  return (
    <div className="viewer-image-wrap">
      <img src={`/raw/${path}`} alt={filename} className="viewer-image" />
    </div>
  )
}

function ErrorView({ error, path }: { error: ApiError; path: string }) {
  const filename = path.split('/').pop() ?? path

  if (error.error === 'too_large') {
    return (
      <div className="viewer-placeholder">
        <div className="placeholder-icon" aria-hidden="true">📄</div>
        <div className="placeholder-filename">{filename}</div>
        <div className="placeholder-message">This file is too large to preview inline (over 5 MB).</div>
        <a href={`/raw/${path}`} download={filename} className="btn-download">
          Download
        </a>
      </div>
    )
  }

  if (error.error === 'not_regular') {
    return (
      <div className="viewer-placeholder">
        <div className="placeholder-icon" aria-hidden="true">📄</div>
        <div className="placeholder-filename">{filename}</div>
        <div className="placeholder-message">This file type cannot be previewed.</div>
        <a href={`/raw/${path}`} download={filename} className="btn-download">
          Download
        </a>
      </div>
    )
  }

  if (error.error === 'not_utf8') {
    return (
      <div className="viewer-placeholder">
        <div className="placeholder-icon" aria-hidden="true">📄</div>
        <div className="placeholder-filename">{filename}</div>
        <div className="placeholder-message">This file contains binary data and cannot be previewed as text.</div>
        <a href={`/raw/${path}`} download={filename} className="btn-download">
          Download
        </a>
      </div>
    )
  }

  return (
    <div className="viewer-state viewer-error" role="alert">
      <strong>{errorTitle(error.error)}</strong>
      <p>{error.message}</p>
    </div>
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
    case 'not_utf8': return 'Cannot Preview'
    default: return 'Error'
  }
}
