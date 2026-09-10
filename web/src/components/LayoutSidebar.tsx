import TreeSidebar from './TreeSidebar'
import { CloseIcon } from './icons'
import BranchPicker from '../git/BranchPicker'
import ChangesBadge from '../git/ChangesBadge'

interface Props {
  isOpen: boolean
  isMobileDrawer: boolean
  onClose: () => void
  activePath: string
}

export function LayoutSidebar({ isOpen, isMobileDrawer, onClose, activePath }: Props) {
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
      {isMobileDrawer && (
        <div className="sidebar-git">
          <BranchPicker />
          <ChangesBadge />
        </div>
      )}
      <div className="sidebar-section">Folders</div>
        <div className="sidebar-tree">
          <TreeSidebar activePath={activePath} />
        </div>
    </aside>
  )
}
