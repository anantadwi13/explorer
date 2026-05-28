import { useParams, useLocation, useOutletContext, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import * as api from '../api/client'
import FolderListing from '../components/FolderListing'
import FileViewer from '../components/FileViewer'

type ViewKind = 'loading' | 'folder' | 'file'

interface OutletCtx {
  onRouteKind: (kind: 'folder' | 'file') => void
}

export default function ViewPage() {
  const params = useParams()
  const location = useLocation()
  const { onRouteKind } = useOutletContext<OutletCtx>()

  const rawPath = params['*'] ?? ''
  const isTrailingSlash = location.pathname.endsWith('/')
  const path = rawPath.replace(/\/$/, '')

  const [kind, setKind] = useState<ViewKind>('loading')

  useEffect(() => {
    if (!path) {
      setKind('folder')
      return
    }
    if (isTrailingSlash) {
      setKind('folder')
      return
    }
    setKind('loading')
    api.tree(path).then((res) => {
      if (res.ok) setKind('folder')
      else if (res.error.error === 'not_regular') setKind('file')
      else setKind('file')
    })
  }, [path, isTrailingSlash])

  useEffect(() => {
    if (kind === 'folder' || kind === 'file') onRouteKind(kind)
  }, [kind, onRouteKind])

  if (kind === 'loading') {
    return <div style={{ padding: 32, color: 'var(--fg-muted)' }}>Loading…</div>
  }

  if (kind === 'folder') return <FolderListing key={path} path={path} />
  return <FileViewerWithRef key={path} path={path} />
}

// Thin wrapper that reads `?ref=` from the URL and threads it to FileViewer.
// Kept here (rather than inside FileViewer) so the file viewer's prop surface
// is explicit and easy to test without a Router context.
function FileViewerWithRef({ path }: { path: string }) {
  const [searchParams] = useSearchParams()
  const ref = searchParams.get('ref') ?? undefined
  return <FileViewer path={path} pinnedRef={ref} />
}
