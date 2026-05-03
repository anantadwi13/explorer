import { useEffect } from 'react'
import { useLocalStorageSetting } from './useLocalStorageSetting'

export type Density = 'compact' | 'regular' | 'comfy'

const isDensity = (v: string): v is Density =>
  v === 'compact' || v === 'regular' || v === 'comfy'

export function useDensity() {
  const [density, setDensity] = useLocalStorageSetting<Density>(
    'explorer.density',
    'regular',
    isDensity,
  )

  useEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])

  return [density, setDensity] as const
}
