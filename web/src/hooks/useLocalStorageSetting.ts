import { useCallback, useSyncExternalStore } from 'react'

const subscribers = new Map<string, Set<() => void>>()

function subscribe(key: string, cb: () => void): () => void {
  let set = subscribers.get(key)
  if (!set) {
    set = new Set()
    subscribers.set(key, set)
  }
  set.add(cb)
  return () => {
    set!.delete(cb)
    if (set!.size === 0) subscribers.delete(key)
  }
}

function notify(key: string) {
  const set = subscribers.get(key)
  if (!set) return
  for (const cb of set) cb()
}

export function useLocalStorageSetting<T extends string>(
  key: string,
  initial: T,
  isValid?: (v: string) => v is T,
): [T, (v: T) => void] {
  const getSnapshot = useCallback(() => {
    const stored = localStorage.getItem(key)
    if (stored === null) return initial
    if (isValid) return isValid(stored) ? stored : initial
    return stored as T
  }, [key, initial, isValid])

  const value = useSyncExternalStore(
    useCallback((cb) => subscribe(key, cb), [key]),
    getSnapshot,
    getSnapshot,
  )

  const setValue = useCallback(
    (v: T) => {
      localStorage.setItem(key, v)
      notify(key)
    },
    [key],
  )

  return [value, setValue]
}
