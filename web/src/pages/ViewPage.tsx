import { useParams, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import * as api from '../api/client'
import FolderListing from '../components/FolderListing'
import FileViewer from '../components/FileViewer'

type ViewKind = 'loading' | 'folder' | 'file'

export default function ViewPage() {
  const params = useParams()
  const location = useLocation()

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
    // Determine if this is a folder or file by calling /api/tree
    setKind('loading')
    api.tree(path).then(res => {
      if (res.ok) {
        setKind('folder')
      } else if (res.error.error === 'not_regular') {
        // server says it's not a dir — fall back to file view
        setKind('file')
      } else {
        // not_found etc — show file view which will show error
        setKind('file')
      }
    })
  }, [path, isTrailingSlash])

  if (kind === 'loading') {
    return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Loading…</div>
  }

  if (kind === 'folder') {
    return <FolderListing path={path} />
  }

  return <FileViewer path={path} />
}
