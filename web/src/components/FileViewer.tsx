import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api/client'
import { INLINE_CAP } from '../api/client'
import type { MetaResponse, ApiError, TreeEntry } from '../api/types'
import { useLayout } from './LayoutContext'
import { useWrap } from '../hooks/useWrap'
import { iconForFile } from './iconForFile'
import MarkdownRenderer from './MarkdownRenderer'
import CodeBlock from './CodeBlock'
import { extToLanguage } from './syntax/grammars'
import { formatSize, formatDate } from './format'
import { BackIcon, LinkIcon, DownloadIcon, WrapIcon } from './icons'
import './FileViewer.css'

interface Props {
  path: string
}

export default function FileViewer({ path }: Props) {
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const navigate = useNavigate()
  const { showToast } = useLayout()
  const [wrap, setWrap] = useWrap()

  // Loading: waiting on meta, or — for text/markdown — also on the /raw/ content fetch.
  // Image and non-previewable kinds need only meta.
  const needsContent = meta?.kind === 'markdown' || meta?.kind === 'text'
  const loading = !error && (!meta || (needsContent && content === null))

  useEffect(() => {
    let cancelled = false
    api.meta(path).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setError(res.error)
        return
      }
      const m = res.data
      setMeta(m)

      // Non-previewable: surface the existing "not_regular" placeholder.
      if (!m.kind) {
        setError({ error: 'not_regular', message: 'file type cannot be previewed' })
        return
      }
      // Image renders directly from /raw/ via <img>; nothing more to fetch.
      if (m.kind === 'image') return

      // Text / markdown: enforce cap, then fetch + decode.
      if (m.size > INLINE_CAP) {
        setError({ error: 'too_large', message: 'file exceeds inline preview size cap' })
        return
      }
      fetch('/raw/' + encodeURI(path))
        .then(async (r) => {
          if (cancelled) return
          if (!r.ok) {
            setError({ error: 'internal_error', message: `raw fetch failed: ${r.status}` })
            return
          }
          const buf = await r.arrayBuffer()
          try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
            if (!cancelled) setContent(text)
          } catch {
            if (!cancelled) setError({ error: 'not_utf8', message: 'file contains binary data' })
          }
        })
        .catch((e) => {
          if (!cancelled) setError({ error: 'internal_error', message: String(e) })
        })
    })
    return () => {
      cancelled = true
    }
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
    size: meta?.size,
    mtime: meta?.mtime,
    mime: meta?.mime,
    kind: meta?.kind,
  }

  if (error) {
    return (
      <div className="file-detail">
        <FileHead
          filename={filename}
          mime={meta?.mime ?? null}
          size={meta?.size ?? null}
          mtime={meta?.mtime ?? null}
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

  if (!meta) return null

  const showWrapToggle = meta.kind === 'text'

  return (
    <div className="file-detail">
      <FileHead
        filename={filename}
        mime={meta.mime}
        size={meta.size}
        mtime={meta.mtime}
        path={path}
        icon={iconForFile(iconEntry)}
        onBack={goBack}
        onCopyLink={onCopyLink}
        showDownload
        wrapToggle={
          showWrapToggle
            ? { wrap, onToggle: () => setWrap(!wrap) }
            : undefined
        }
      />
      <div className={`vw vw-${meta.kind}`}>
        {meta.kind === 'markdown' && (
          <MarkdownRenderer content={content!} currentPath={path} />
        )}
        {meta.kind === 'text' && (
          <CodeBlock code={content!} language={extToLanguage(path)} wrap={wrap} />
        )}
        {meta.kind === 'image' && (
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
  wrapToggle?: { wrap: boolean; onToggle: () => void }
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
  wrapToggle,
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
        {wrapToggle && (
          <button
            className="icon-btn"
            onClick={wrapToggle.onToggle}
            aria-pressed={wrapToggle.wrap}
            aria-label={wrapToggle.wrap ? 'Wrap lines: on' : 'Wrap lines: off'}
            title={wrapToggle.wrap ? 'Wrap lines: on' : 'Wrap lines: off'}
          >
            <WrapIcon />
          </button>
        )}
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
