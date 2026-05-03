import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { LayoutContext } from './LayoutContext'
import { useTheme } from '../hooks/useTheme'
import { useDensity } from '../hooks/useDensity'
import { LayoutSidebar } from './LayoutSidebar'
import Toolbar from './Toolbar'
import Toast from './Toast'
import { MenuIcon, SunIcon, MoonIcon } from './icons'
import './Layout.css'

const DESKTOP_QUERY = '(min-width: 800px)'

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { choice: themeChoice, setChoice: setThemeChoice } = useTheme()
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

  // Keyboard shortcuts (window-level). Single listener installed at mount.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      const inField =
        !!tgt &&
        (tgt.tagName === 'INPUT' ||
          tgt.tagName === 'TEXTAREA' ||
          tgt.isContentEditable)

      if (e.key === '/' && !inField) {
        if (searchRef.current) {
          e.preventDefault()
          searchRef.current.focus()
        }
      } else if (e.key === 'Escape') {
        if (searchValueRef.current) {
          setSearch('')
        } else if (isFileRouteRef.current) {
          goUpFromCurrent()
        }
      } else if (e.key === 'Backspace' && !inField && !isFileRouteRef.current) {
        const p = currentPath(window.location.pathname)
        if (p) {
          e.preventDefault()
          goUpFromCurrent()
        }
      }
    }
    const goUpFromCurrent = () => {
      const path = currentPath(window.location.pathname)
      if (!path) return
      const parts = path.split('/').filter(Boolean)
      parts.pop()
      const next = parts.length === 0 ? '/' : `/view/${parts.join('/')}/`
      navigate(next)
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
            <button
              className="icon-btn"
              onClick={() =>
                setThemeChoice(themeChoice === 'dark' ? 'light' : 'dark')
              }
              aria-label="Toggle theme"
            >
              {themeChoice === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
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
