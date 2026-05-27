import { useCallback, useRef } from 'react'
import './FileViewerTabs.css'

export type FileViewerTab = 'code' | 'blame'

interface Props {
  active: FileViewerTab
  onChange: (next: FileViewerTab) => void
}

const TABS: FileViewerTab[] = ['code', 'blame']

// FileViewerTabs renders the [Code | Blame] ARIA tablist above the content
// area of `<FileViewer>` for `kind === 'text'` files only. Selection is
// reflected to `?view=blame` (or absent) by the caller — this component is
// pure UI; the URL writeback lives in FileViewer so the routing layer stays
// declarative.
//
// Keyboard interaction follows the standard ARIA tablist pattern: left/right
// move the active tab, Home/End jump to first/last. The buttons also act as
// the focusable representation of each tab, so a screen-reader user reads
// `Code, tab, 1 of 2 selected` naturally.
export default function FileViewerTabs({ active, onChange }: Props) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const i = TABS.indexOf(active)
      let next: number
      switch (e.key) {
        case 'ArrowLeft':
          next = (i - 1 + TABS.length) % TABS.length
          break
        case 'ArrowRight':
          next = (i + 1) % TABS.length
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = TABS.length - 1
          break
        default:
          return
      }
      e.preventDefault()
      onChange(TABS[next])
      // Move focus to the freshly-activated tab so the ARIA contract is met.
      refs.current[next]?.focus()
    },
    [active, onChange],
  )

  return (
    <div className="file-viewer-tabs" role="tablist" aria-label="File view" onKeyDown={onKeyDown}>
      {TABS.map((t, i) => {
        const selected = t === active
        return (
          <button
            key={t}
            ref={(el) => {
              refs.current[i] = el
            }}
            role="tab"
            type="button"
            tabIndex={selected ? 0 : -1}
            aria-selected={selected}
            className={`file-viewer-tab${selected ? ' is-active' : ''}`}
            onClick={() => onChange(t)}
          >
            {t === 'code' ? 'Code' : 'Blame'}
          </button>
        )
      })}
    </div>
  )
}
