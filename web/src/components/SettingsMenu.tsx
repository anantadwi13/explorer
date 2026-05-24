import { useEffect, useState } from 'react'
import { useTheme } from '../hooks/useTheme'
import type { ThemeChoice } from '../hooks/useTheme'
import { useDensity } from '../hooks/useDensity'
import type { Density } from '../hooks/useDensity'
import { useViewMode } from '../hooks/useViewMode'
import type { ViewMode } from '../hooks/useViewMode'
import { useClickOutside } from '../hooks/useClickOutside'
import { SettingsIcon } from './icons'
import './SettingsMenu.css'

const THEME_OPTIONS: ThemeChoice[] = ['light', 'dark', 'system']
const DENSITY_OPTIONS: Density[] = ['compact', 'regular', 'comfy']
const VIEW_OPTIONS: ViewMode[] = ['list', 'grid']

export default function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const { choice: theme, setChoice: setTheme } = useTheme()
  const [density, setDensity] = useDensity()
  const [view, setView] = useViewMode()

  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false))

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="settings" ref={ref}>
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Settings"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <SettingsIcon />
      </button>
      {open && (
        <div className="settings-popover" role="menu">
          <div className="settings-section">
            <div className="settings-label">Theme</div>
            <div className="settings-options" role="radiogroup" aria-label="Theme">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  role="radio"
                  aria-checked={theme === opt}
                  className={`settings-opt${theme === opt ? ' is-on' : ''}`}
                  onClick={() => setTheme(opt)}
                >
                  {capitalize(opt)}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-section">
            <div className="settings-label">Density</div>
            <div className="settings-options" role="radiogroup" aria-label="Density">
              {DENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  role="radio"
                  aria-checked={density === opt}
                  className={`settings-opt${density === opt ? ' is-on' : ''}`}
                  onClick={() => setDensity(opt)}
                >
                  {capitalize(opt)}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-section">
            <div className="settings-label">View</div>
            <div className="settings-options" role="radiogroup" aria-label="View">
              {VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  role="radio"
                  aria-checked={view === opt}
                  className={`settings-opt${view === opt ? ' is-on' : ''}`}
                  onClick={() => setView(opt)}
                >
                  {capitalize(opt)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
