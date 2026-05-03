import { Outlet, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useTheme } from '../hooks/useTheme'
import type { ThemeChoice } from '../hooks/useTheme'
import Breadcrumbs from './Breadcrumbs'
import TreeSidebar from './TreeSidebar'
import './Layout.css'

export default function Layout() {
  const { choice, setChoice } = useTheme()
  const location = useLocation()
  const [isMd, setIsMd] = useState(() => window.innerWidth >= 768)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e: MediaQueryListEvent) => setIsMd(e.matches)
    mq.addEventListener('change', handler)
    setIsMd(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const currentPath = getCurrentPath(location.pathname)

  return (
    <div className="layout">
      <header className="layout-header" role="banner">
        <div className="layout-header-left">
          <a href="/" className="layout-logo" aria-label="Explorer home">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M2 4a2 2 0 012-2h3l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V4z" fill="currentColor" opacity="0.8"/>
            </svg>
            <span>Explorer</span>
          </a>
        </div>
        <div className="layout-header-right">
          <ThemeToggle choice={choice} onChange={setChoice} />
        </div>
      </header>

      <nav className="layout-breadcrumbs" aria-label="Breadcrumb">
        <Breadcrumbs path={currentPath} />
      </nav>

      <div className="layout-body">
        {isMd && (
          <aside className="layout-sidebar" aria-label="File tree">
            <TreeSidebar />
          </aside>
        )}
        <main className="layout-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function getCurrentPath(pathname: string): string {
  if (pathname === '/') return ''
  if (pathname.startsWith('/view/')) return pathname.slice('/view/'.length).replace(/\/$/, '')
  return ''
}

function ThemeToggle({ choice, onChange }: { choice: ThemeChoice; onChange: (c: ThemeChoice) => void }) {
  const options: { value: ThemeChoice; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ]
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {options.map(o => (
        <button
          key={o.value}
          className={`theme-btn${choice === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
          aria-pressed={choice === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
