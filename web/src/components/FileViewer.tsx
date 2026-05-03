import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api/client'
import type { FileResponse, ApiError, TreeEntry } from '../api/types'
import { useLayout } from './LayoutContext'
import { iconForFile } from './iconForFile'
import MarkdownRenderer from './MarkdownRenderer'
import { formatSize, formatDate } from './format'
import { BackIcon, LinkIcon, DownloadIcon } from './icons'
import './FileViewer.css'

interface Props {
  path: string
}

export default function FileViewer({ path }: Props) {
  const [data, setData] = useState<FileResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const navigate = useNavigate()
  const { showToast } = useLayout()
  // ViewPage remounts us via `key={path}` on every navigation, so the initial
  // `null` data/error correctly reflects the loading state without a setLoading
  // toggle inside the effect.
  const loading = data === null && error === null

  useEffect(() => {
    api.file(path).then((res) => {
      if (res.ok) setData(res.data)
      else setError(res.error)
    })
  }, [path])

  const filename = path.split('/').pop() ?? path

  const goBack = () => {
    const parts = path.split('/').filter(Boolean)
    parts.pop()
    const next = parts.length === 0 ? '/' : `/view/${parts.join('/')}/`
    navigate(next)
  }

  const onCopyLink = async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      showToast('Link copied')
    } catch {
      showToast('Failed to copy link')
    }
  }

  if (loading) {
    return <div className="viewer-state">Loading…</div>
  }

  // Build a TreeEntry-shaped object for icon resolution.
  const iconEntry: TreeEntry = {
    name: filename,
    type: 'file',
    size: data?.size,
    mtime: data?.mtime,
    mime: data?.mime,
  }

  if (error) {
    return (
      <div className="file-detail">
        <FileHead
          filename={filename}
          mime={null}
          size={null}
          mtime={null}
          path={path}
          icon={iconForFile(iconEntry)}
          onBack={goBack}
          onCopyLink={onCopyLink}
          showDownload={canDownload(error.error)}
        />
        <ErrorBody error={error} filename={filename} path={path} />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="file-detail">
      <FileHead
        filename={filename}
        mime={data.mime}
        size={data.size}
        mtime={data.mtime}
        path={path}
        icon={iconForFile(iconEntry)}
        onBack={goBack}
        onCopyLink={onCopyLink}
        showDownload
      />
      <div className={`vw vw-${data.kind}`}>
        {data.kind === 'markdown' && (
          <MarkdownRenderer content={data.content!} currentPath={path} />
        )}
        {data.kind === 'text' && <pre className="text-body">{data.content}</pre>}
        {data.kind === 'image' && (
          <img src={`/raw/${path}`} alt={filename} />
        )}
      </div>
    </div>
  )
}

interface HeadProps {
  filename: string
  mime: string | null
  size: number | null
  mtime: string | null
  path: string
  icon: React.ReactNode
  onBack: () => void
  onCopyLink: () => void
  showDownload: boolean
}

function FileHead({
  filename,
  mime,
  size,
  mtime,
  path,
  icon,
  onBack,
  onCopyLink,
  showDownload,
}: HeadProps) {
  const sub: string[] = []
  if (mime) sub.push(mime)
  if (size != null) sub.push(formatSize(size))
  if (mtime) sub.push(`modified ${formatDate(mtime)}`)
  return (
    <div className="file-head">
      <div className="file-head-left">
        <button
          className="icon-btn"
          onClick={onBack}
          aria-label="Back to folder"
          title="Back to folder"
        >
          <BackIcon />
        </button>
        <div className="file-head-meta">
          <div className="file-head-name">
            <span className="file-head-icon">{icon}</span>
            <span>{filename}</span>
          </div>
          {sub.length > 0 && (
            <div className="file-head-sub">{sub.join(' · ')}</div>
          )}
        </div>
      </div>
      <div className="file-head-actions">
        <button
          className="icon-btn"
          onClick={onCopyLink}
          aria-label="Copy link"
          title="Copy link"
        >
          <LinkIcon />
        </button>
        {showDownload && (
          <a
            className="btn btn-sm"
            href={`/raw/${path}`}
            download={filename}
            title="Download"
          >
            <DownloadIcon /> <span className="btn-label">Download</span>
          </a>
        )}
      </div>
    </div>
  )
}

function ErrorBody({
  error,
  filename,
  path,
}: {
  error: ApiError
  filename: string
  path: string
}) {
  if (error.error === 'too_large') {
    return (
      <div className="vw-fallback">
        <p>This file is too large to preview inline (over 5 MB).</p>
        <a href={`/raw/${path}`} download={filename} className="btn">
          <DownloadIcon /> Download
        </a>
      </div>
    )
  }
  if (error.error === 'not_regular') {
    return (
      <div className="vw-fallback">
        <p>This file type cannot be previewed.</p>
        <a href={`/raw/${path}`} download={filename} className="btn">
          <DownloadIcon /> Download
        </a>
      </div>
    )
  }
  if (error.error === 'not_utf8') {
    return (
      <div className="vw-fallback">
        <p>This file contains binary data and cannot be previewed as text.</p>
        <a href={`/raw/${path}`} download={filename} className="btn">
          <DownloadIcon /> Download
        </a>
      </div>
    )
  }
  return (
    <div className="vw-fallback" role="alert">
      <strong>{errorTitle(error.error)}</strong>
      <p>{error.message}</p>
    </div>
  )
}

function canDownload(kind: ApiError['error']): boolean {
  return kind === 'too_large' || kind === 'not_regular' || kind === 'not_utf8'
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
