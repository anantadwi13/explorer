import './Toast.css'

interface Props {
  message: string
}

export default function Toast({ message }: Props) {
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}
