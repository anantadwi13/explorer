import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { LayoutContext } from './LayoutContext'
import { useDensity } from '../hooks/useDensity'
import { LayoutSidebar } from './LayoutSidebar'
import Toolbar from './Toolbar'
import Toast from './Toast'
import SettingsMenu from './SettingsMenu'
import { MenuIcon } from './icons'
import './Layout.css'

const DESKTOP_QUERY = '(min-width: 800px)'

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  // density hook self-applies to <html>; we don't need the value here
  useDensity()

  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches,
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [isFileRoute, setIsFileRoute] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  // Track the last pathname we rendered for so we can reset path-scoped state
  // (search filter, mobile drawer) when the route changes. This is the React-
  // blessed "store information from previous renders" pattern — preferable to
  // doing it in an effect, which would run after the wrong children rendered.
  const [lastPathname, setLastPathname] = useState(location.pathname)
  if (lastPathname !== location.pathname) {
    setLastPathname(location.pathname)
    setSearch('')
    setSidebarOpen(false)
  }

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const showToast = useCallback((message: string, ms = 1800) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), ms)
  }, [])

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
  }, [])

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  // Keep refs of the values the keyboard handler needs so we can register the
  // listener once and always read fresh state inside it.
  const searchValueRef = useRef(search)
  const isFileRouteRef = useRef(isFileRoute)
  useEffect(() => {
    searchValueRef.current = search
    isFileRouteRef.current = isFileRoute
  })

  // Track the last folder route we visited so the git-page Escape handler can
  // jump back to it. Updated whenever the path changes and the new path is a
  // web-ui folder URL (`/` or `/view/*/`).
  const lastFolderRouteRef = useRef('/')
  // Also mirror the live location into a ref so the (mount-once) keyboard
  // handler reads the *current* route — `window.location` doesn't track
  // MemoryRouter in tests and would lag behind real navigations between
  // mount and the listener's first fire.
  const locationRef = useRef(location)
  useEffect(() => {
    locationRef.current = location
    if (!isGitRoute(location.pathname) && !isFileRoute) {
      lastFolderRouteRef.current = location.pathname
    }
  }, [location, isFileRoute])

  // Keyboard shortcuts (window-level). Single listener installed at mount.
  // Directory-browser routes (/, /view/*) follow the original rules; git
  // routes (/git/*) override per the spec — `/` is no-op, Escape moves "up
  // one level" within git nav, Backspace matches Escape on detail and is
  // no-op (with browser-default suppressed) on the top-level git pages.
  useEffect(() => {
    const goUpFromCurrent = () => {
      const path = currentPath(locationRef.current.pathname)
      if (!path) return
      const parts = path.split('/').filter(Boolean)
      parts.pop()
      const next = parts.length === 0 ? '/' : `/view/${parts.join('/')}/`
      navigate(next)
    }
    const goBackFromGit = () => {
      const loc = locationRef.current
      if (loc.pathname.startsWith('/git/commits/')) {
        // detail → list (preserve ?ref= if any)
        navigate(`/git/commits${loc.search || ''}`)
        return
      }
      // list or status → most recent folder, fall back to /
      navigate(lastFolderRouteRef.current || '/')
    }

    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      const inField =
        !!tgt &&
        (tgt.tagName === 'INPUT' ||
          tgt.tagName === 'TEXTAREA' ||
          tgt.isContentEditable)

      const path = locationRef.current.pathname
      const onGitRoute = isGitRoute(path)

      if (e.key === '/' && !inField) {
        if (onGitRoute) {
          // Spec: `/` is a no-op on git pages (no search field present).
          e.preventDefault()
          return
        }
        if (searchRef.current) {
          e.preventDefault()
          searchRef.current.focus()
        }
        return
      }

      if (e.key === 'Escape') {
        if (inField) return
        if (onGitRoute) {
          goBackFromGit()
          return
        }
        if (searchValueRef.current) {
          setSearch('')
        } else if (isFileRouteRef.current) {
          goUpFromCurrent()
        }
        return
      }

      if (e.key === 'Backspace' && !inField) {
        if (onGitRoute) {
          if (path.startsWith('/git/commits/')) {
            e.preventDefault()
            goBackFromGit()
          } else {
            // Top-level git pages: no-op, but suppress the browser default
            // (back-navigation) for parity with folder-page behaviour.
            e.preventDefault()
          }
          return
        }
        if (!isFileRouteRef.current) {
          const p = currentPath(path)
          if (p) {
            e.preventDefault()
            goUpFromCurrent()
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const ctxValue = useMemo(
    () => ({
      search,
      setSearch,
      searchRef,
      isFileRoute,
      showToast,
      closeSidebar,
    }),
    [search, isFileRoute, showToast, closeSidebar],
  )

  // Outlet child (ViewPage) reports whether the current route is a file
  // via this callback. Memoized so its identity is stable.
  const onRouteKind = useCallback((kind: 'folder' | 'file') => {
    setIsFileRoute(kind === 'file')
  }, [])

  return (
    <LayoutContext.Provider value={ctxValue}>
      <div className="app">
        {!isDesktop && (
          <header className="topbar">
            <button
              className="icon-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open folders"
            >
              <MenuIcon />
            </button>
            <div className="topbar-title">Explorer</div>
            <SettingsMenu />
          </header>
        )}

        <LayoutSidebar
          isOpen={sidebarOpen || isDesktop}
          isMobileDrawer={!isDesktop}
          onClose={closeSidebar}
        />

        {!isDesktop && sidebarOpen && (
          <div className="scrim" onClick={closeSidebar} aria-hidden="true" />
        )}

        <main className="main">
          <Toolbar />
          <div className="content">
            <Outlet context={{ onRouteKind }} />
          </div>
        </main>

        {toast && <Toast message={toast} />}
      </div>
    </LayoutContext.Provider>
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
