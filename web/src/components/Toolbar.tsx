import { useLocation } from 'react-router-dom'
import { useLayout } from './LayoutContext'
import Breadcrumbs from './Breadcrumbs'
import SearchBox from './SearchBox'
import ViewToggle from './ViewToggle'
import SettingsMenu from './SettingsMenu'
import BranchPicker from '../git/BranchPicker'
import ChangesBadge from '../git/ChangesBadge'
import './Toolbar.css'

export default function Toolbar() {
  const location = useLocation()
  const { search, setSearch, searchRef, isFileRoute } = useLayout()

  const path = currentPath(location.pathname)
  // Folder controls (search + view toggle) only show on directory-browser
  // folder routes. On /git/* pages we still want the breadcrumbs (showing
  // empty path here) and the BranchPicker/ChangesBadge.
  const showFolderControls = !isFileRoute && !isGitRoute(location.pathname)

  return (
    <div className="toolbar">
      <Breadcrumbs path={path} />
      <div className="toolbar-spacer" />
      {/*
        Desktop-only: git affordances. On mobile (<800px) the spec says these
        live in the sidebar drawer header instead — see LayoutSidebar. The
        CSS hides this wrapper at the same 800px breakpoint Layout uses to
        switch between desktop and mobile chrome.
      */}
      <div className="toolbar-git">
        <BranchPicker />
        <ChangesBadge />
      </div>
      {showFolderControls && (
        <>
          <SearchBox
            value={search}
            onChange={setSearch}
            inputRef={searchRef}
          />
          <ViewToggle />
        </>
      )}
      <SettingsMenu />
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
