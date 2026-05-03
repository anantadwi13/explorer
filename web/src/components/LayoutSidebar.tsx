import TreeSidebar from './TreeSidebar'
import { CloseIcon } from './icons'

interface Props {
  isOpen: boolean
  isMobileDrawer: boolean
  onClose: () => void
}

export function LayoutSidebar({ isOpen, isMobileDrawer, onClose }: Props) {
  const className = `sidebar${isMobileDrawer && isOpen ? ' is-open' : ''}`
  return (
    <aside className={className} aria-label="File tree">
      <div className="sidebar-head">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">⌹</div>
          <div className="brand-name">Explorer</div>
        </div>
        {isMobileDrawer && (
          <button
            className="icon-btn sidebar-close"
            onClick={onClose}
            aria-label="Close folders"
          >
            <CloseIcon />
          </button>
        )}
      </div>
      <div className="sidebar-section">Folders</div>
      <div className="sidebar-tree">
        <TreeSidebar />
      </div>
    </aside>
  )
}
