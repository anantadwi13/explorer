import { createContext, useContext } from 'react'
import type { RefObject } from 'react'

export interface LayoutContextValue {
  search: string
  setSearch: (v: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  isFileRoute: boolean
  showToast: (message: string, ms?: number) => void
  closeSidebar: () => void
}

export const LayoutContext = createContext<LayoutContextValue | null>(null)

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext)
  if (!ctx) throw new Error('useLayout must be used inside <Layout>')
  return ctx
}
