import { useLocalStorageSetting } from './useLocalStorageSetting'

export type ViewMode = 'list' | 'grid'

const isViewMode = (v: string): v is ViewMode => v === 'list' || v === 'grid'

export function useViewMode() {
  return useLocalStorageSetting<ViewMode>('explorer.view', 'list', isViewMode)
}
