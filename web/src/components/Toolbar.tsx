import { useLocation } from 'react-router-dom'
import { useLayout } from './LayoutContext'
import Breadcrumbs from './Breadcrumbs'
import SearchBox from './SearchBox'
import ViewToggle from './ViewToggle'
import SettingsMenu from './SettingsMenu'
import './Toolbar.css'

export default function Toolbar() {
  const location = useLocation()
  const { search, setSearch, searchRef, isFileRoute } = useLayout()

  const path = currentPath(location.pathname)
  const showFolderControls = !isFileRoute

  return (
    <div className="toolbar">
      <Breadcrumbs path={path} />
      <div className="toolbar-spacer" />
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
