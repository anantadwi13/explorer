import { Link } from 'react-router-dom'
import { Fragment } from 'react'
import { ChevronIcon, FolderIcon } from './icons'
import './Breadcrumbs.css'

interface Props {
  path: string
}

export default function Breadcrumbs({ path }: Props) {
  const segments = path ? path.split('/').filter(Boolean) : []

  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <Link
        to="/"
        className={`crumb-item${segments.length === 0 ? ' is-current' : ''}`}
        aria-current={segments.length === 0 ? 'page' : undefined}
      >
        <FolderIcon width={14} height={14} />
        <span>Home</span>
      </Link>
      {segments.map((seg, i) => {
        const target = '/view/' + segments.slice(0, i + 1).join('/') + '/'
        const isLast = i === segments.length - 1
        return (
          <Fragment key={target}>
            <span className="crumb-sep" aria-hidden="true">
              <ChevronIcon />
            </span>
            {isLast ? (
              <span className="crumb-item is-current" aria-current="page">
                {seg}
              </span>
            ) : (
              <Link to={target} className="crumb-item">{seg}</Link>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
