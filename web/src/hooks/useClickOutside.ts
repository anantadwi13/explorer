import { useEffect, useRef } from 'react'

export function useClickOutside<T extends HTMLElement>(
  active: boolean,
  onOutside: () => void,
) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent | TouchEvent) => {
      const node = ref.current
      if (!node) return
      if (e.target instanceof Node && !node.contains(e.target)) {
        onOutside()
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [active, onOutside])

  return ref
}
