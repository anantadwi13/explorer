import { Link } from 'react-router-dom'
import './Breadcrumbs.css'

interface Props {
  path: string
}

export default function Breadcrumbs({ path }: Props) {
  const segments = path ? path.split('/').filter(Boolean) : []

  return (
    <ol className="breadcrumbs" aria-label="Breadcrumb navigation">
      <li>
        <Link to="/" aria-label="Root">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1.5L1 7h2v7h4v-4h2v4h4V7h2L8 1.5z"/>
          </svg>
          <span className="breadcrumb-root">root</span>
        </Link>
      </li>
      {segments.map((seg, i) => {
        const href = '/view/' + segments.slice(0, i + 1).join('/')
        const isLast = i === segments.length - 1
        return (
          <li key={href}>
            <span className="breadcrumb-sep" aria-hidden="true">/</span>
            {isLast ? (
              <span className="breadcrumb-current" aria-current="page">{seg}</span>
            ) : (
              <Link to={href + '/'}>{seg}</Link>
            )}
          </li>
        )
      })}
    </ol>
  )
}
