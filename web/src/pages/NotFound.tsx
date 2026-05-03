import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>404</div>
      <p>Page not found.</p>
      <Link to="/">Go to root</Link>
    </div>
  )
}
