import { useCallback } from 'react'
import { useLocalStorageSetting } from './useLocalStorageSetting'

export type WrapChoice = 'on' | 'off'

const isWrap = (v: string): v is WrapChoice => v === 'on' || v === 'off'

export function useWrap(): [boolean, (wrap: boolean) => void] {
  const [choice, setChoice] = useLocalStorageSetting<WrapChoice>(
    'explorer.wrap',
    'on',
    isWrap,
  )
  const setWrap = useCallback(
    (wrap: boolean) => setChoice(wrap ? 'on' : 'off'),
    [setChoice],
  )
  return [choice === 'on', setWrap]
}
