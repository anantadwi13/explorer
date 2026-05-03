interface Props {
  title: string
  hint?: string | null
}

export default function EmptyState({ title, hint }: Props) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden="true">∅</div>
      <div className="empty-title">{title}</div>
      {hint && <div className="empty-hint">{hint}</div>}
    </div>
  )
}
