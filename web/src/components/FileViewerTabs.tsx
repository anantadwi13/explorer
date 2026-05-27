import { useCallback, useRef } from 'react'
import './FileViewerTabs.css'

export type FileViewerTab = 'preview' | 'code' | 'blame'

interface Props {
  tabs: FileViewerTab[]
  active: FileViewerTab
  onChange: (next: FileViewerTab) => void
}

const LABELS: Record<FileViewerTab, string> = {
  preview: 'Preview',
  code: 'Code',
  blame: 'Blame',
}

// FileViewerTabs renders the ARIA tablist above the content area of
// `<FileViewer>`. The tab set is provided by the caller — text files pass
// `['code','blame']`, markdown files pass `['preview','code','blame']` — so a
// single component covers every kind that has a tablist. URL state and tab
// dispatch live in FileViewer; this component is pure UI.
export default function FileViewerTabs({ tabs, active, onChange }: Props) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (tabs.length === 0) return
      const i = Math.max(0, tabs.indexOf(active))
      let next: number
      switch (e.key) {
        case 'ArrowLeft':
          next = (i - 1 + tabs.length) % tabs.length
          break
        case 'ArrowRight':
          next = (i + 1) % tabs.length
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = tabs.length - 1
          break
        default:
          return
      }
      e.preventDefault()
      onChange(tabs[next])
      // Move focus to the freshly-activated tab so the ARIA contract is met.
      refs.current[next]?.focus()
    },
    [tabs, active, onChange],
  )

  return (
    <div className="file-viewer-tabs" role="tablist" aria-label="File view" onKeyDown={onKeyDown}>
      {tabs.map((t, i) => {
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
            {LABELS[t]}
          </button>
        )
      })}
    </div>
  )
}
