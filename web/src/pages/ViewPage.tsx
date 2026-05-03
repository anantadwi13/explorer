import { useParams, useLocation, useOutletContext } from 'react-router-dom'
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
  return <FileViewer key={path} path={path} />
}
