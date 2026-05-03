import { useViewMode } from '../hooks/useViewMode'
import { ListIcon, GridIcon } from './icons'
import './ViewToggle.css'

export default function ViewToggle() {
  const [view, setView] = useViewMode()
  return (
    <div className="seg" role="group" aria-label="View mode">
      <button
        className={`seg-btn${view === 'list' ? ' is-on' : ''}`}
        onClick={() => setView('list')}
        aria-label="List view"
        aria-pressed={view === 'list'}
      >
        <ListIcon />
      </button>
      <button
        className={`seg-btn${view === 'grid' ? ' is-on' : ''}`}
        onClick={() => setView('grid')}
        aria-label="Grid view"
        aria-pressed={view === 'grid'}
      >
        <GridIcon />
      </button>
    </div>
  )
}
