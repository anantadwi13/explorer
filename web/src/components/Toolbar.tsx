import { useLocation } from 'react-router-dom'
import { useLayout } from './LayoutContext'
import Breadcrumbs from './Breadcrumbs'
import SearchBox from './SearchBox'
import SettingsMenu from './SettingsMenu'
import BranchPicker from '../git/BranchPicker'
import ChangesBadge from '../git/ChangesBadge'
import './Toolbar.css'

export default function Toolbar() {
  const location = useLocation()
  const { search, setSearch, searchRef, isFileRoute } = useLayout()

  const path = currentPath(location.pathname)
  // Search only shows on web-ui folder routes. On /git/* and file routes
  // the breadcrumb + git surface (BranchPicker/ChangesBadge) still render,
  // but the search field would have nothing to filter.
  const showFolderControls = !isFileRoute && !isGitRoute(location.pathname)

  return (
    <div className="toolbar">
      <div className="toolbar-controls">
        <div className="toolbar-git">
          <BranchPicker />
          <ChangesBadge />
        </div>
        {showFolderControls && (
          <SearchBox
            value={search}
            onChange={setSearch}
            inputRef={searchRef}
          />
        )}
        <SettingsMenu />
      </div>
      <div className="toolbar-path">
        <Breadcrumbs path={path} />
      </div>
    </div>
  )
}

function currentPath(pathname: string): string {
  if (pathname === '/') return ''
  if (pathname.startsWith('/view/')) {
    return pathname.slice('/view/'.length).replace(/\/$/, '')
  }
  return ''
}

function isGitRoute(pathname: string): boolean {
  return pathname === '/git' || pathname.startsWith('/git/')
}
