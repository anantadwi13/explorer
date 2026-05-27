import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../api/client'
import { INLINE_CAP } from '../api/client'
import type { MetaResponse, ApiError, TreeEntry } from '../api/types'
import { useLayout } from './LayoutContext'
import { useWrap } from '../hooks/useWrap'
import { iconForFile } from './iconForFile'
import MarkdownRenderer from './MarkdownRenderer'
import CodeBlock from './CodeBlock'
import FileLastCommitStrip from '../git/FileLastCommitStrip'
import BlameView from '../git/BlameView'
import FileViewerTabs, { type FileViewerTab } from './FileViewerTabs'
import { extToLanguage } from './syntax/grammars'
import { formatSize, formatDate } from './format'
import { BackIcon, LinkIcon, DownloadIcon, WrapIcon } from './icons'
import './FileViewer.css'

interface Props {
  path: string
}

// The tablist's available tabs are derived from the file's preview kind.
// The FIRST entry is the kind's natural default — used by the URL parser
// when `?view=` is absent, unknown, or incompatible with the kind. Image
// and non-previewable kinds return an empty array (no tablist renders).
function tabsForKind(kind: MetaResponse['kind'] | undefined): FileViewerTab[] {
  if (kind === 'markdown') return ['preview', 'code', 'blame']
  if (kind === 'text') return ['code', 'blame']
  return []
}

// Container class for the content area. Keyed on the active renderer so the
// markdown Code/Blame tabs reuse the same `.vw-text` panel chrome that text
// files have always had. Markdown Preview and the unknown-kind fallback stay
// bare so the existing surfaces don't change.
function rendererClass(
  kind: MetaResponse['kind'] | undefined,
  activeTab: FileViewerTab | undefined,
): string {
  if (kind === 'image') return 'vw-image'
  if (activeTab === 'code' || activeTab === 'blame') return 'vw-text'
  if (kind === 'markdown') return 'vw-markdown'
  return ''
}

// navigator.clipboard requires a secure context (HTTPS or localhost). When the
// explorer is reached from another device over plain HTTP it is undefined, so
// fall back to a hidden textarea + execCommand('copy').
async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to legacy path
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export default function FileViewer({ path }: Props) {
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const navigate = useNavigate()
  const { showToast } = useLayout()
  const [wrap, setWrap] = useWrap()
  const [searchParams, setSearchParams] = useSearchParams()
  // The tab set is derived from the file's kind. First entry is the default.
  // Image and non-previewable files return an empty array (no tablist).
  const tabs = tabsForKind(meta?.kind)
  // Parse `?view=` tolerantly: absent / unknown / kind-incompatible values
  // fall back to the kind's natural default. The URL is left as the user
  // typed it — generation-strict, parse-tolerant.
  const requestedView = searchParams.get('view')
  const activeTab: FileViewerTab | undefined =
    tabs.length === 0
      ? undefined
      : tabs.find((t) => t === requestedView) ?? tabs[0]
  const onTabChange = (next: FileViewerTab) => {
    const updated = new URLSearchParams(searchParams)
    // Always emit an explicit `?view=` on outbound writes. Even when activating
    // the kind's default tab, we leave the parameter in place so links the SPA
    // generates are unambiguous.
    updated.set('view', next)
    // `replace: true` so tab swaps don't pile up history entries.
    setSearchParams(updated, { replace: true })
  }

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
    if (await copyText(url)) {
      showToast('Link copied')
    } else {
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
        <FileLastCommitStrip path={path} />
        <ErrorBody error={error} filename={filename} path={path} />
      </div>
    )
  }

  if (!meta) return null

  // Wrap toggle follows the active tab, not the file kind: visible when
  // the active tab is Code or Blame; hidden for Preview, Image, and error
  // states (where activeTab is undefined).
  const showWrapToggle = activeTab === 'code' || activeTab === 'blame'

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
      <FileLastCommitStrip path={path} />
      {tabs.length > 0 && activeTab && (
        <FileViewerTabs tabs={tabs} active={activeTab} onChange={onTabChange} />
      )}
      {/* Container class follows the active renderer rather than the file kind
          so markdown's Code and Blame tabs get the same panel chrome that
          text files have always had (background, border, rounded corners).
          Markdown Preview brings its own `.md-body` chrome and intentionally
          stays bare here. */}
      <div className={`vw ${rendererClass(meta.kind, activeTab)}`}>
        {meta.kind === 'markdown' && activeTab === 'preview' && (
          <MarkdownRenderer content={content!} currentPath={path} />
        )}
        {meta.kind === 'markdown' && activeTab === 'code' && (
          <CodeBlock code={content!} language={extToLanguage(path)} wrap={wrap} />
        )}
        {meta.kind === 'markdown' && activeTab === 'blame' && (
          <BlameView path={path} wrap={wrap} />
        )}
        {meta.kind === 'text' && activeTab === 'code' && (
          <CodeBlock code={content!} language={extToLanguage(path)} wrap={wrap} />
        )}
        {meta.kind === 'text' && activeTab === 'blame' && (
          <BlameView path={path} wrap={wrap} />
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
