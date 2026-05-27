import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FileViewerTabs from './FileViewerTabs'

// FileViewerTabs is the pure tablist control rendered above the file viewer
// content. The integration with `?view=blame` URL state lives in FileViewer
// and is exercised in the higher-level component test — here we cover the
// ARIA pattern (selected attr + keyboard navigation) in isolation.
describe('FileViewerTabs', () => {
  it('marks the active tab via aria-selected', () => {
    const { getByRole } = render(<FileViewerTabs active="code" onChange={() => {}} />)
    const code = getByRole('tab', { name: 'Code' })
    const blame = getByRole('tab', { name: 'Blame' })
    expect(code.getAttribute('aria-selected')).toBe('true')
    expect(blame.getAttribute('aria-selected')).toBe('false')
  })

  it('switches tabs on click', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<FileViewerTabs active="code" onChange={onChange} />)
    fireEvent.click(getByRole('tab', { name: 'Blame' }))
    expect(onChange).toHaveBeenCalledWith('blame')
  })

  it('moves the active tab on ArrowRight/ArrowLeft', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<FileViewerTabs active="code" onChange={onChange} />)
    fireEvent.keyDown(getByRole('tablist'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('blame')
    fireEvent.keyDown(getByRole('tablist'), { key: 'ArrowLeft' })
    // wraps: code -> blame (right) and blame -> code (left) — but onChange
    // is called with the result *from the prop active*, which stays "code"
    // here because we don't actually re-render with the new active value.
    // The assertion is that Home/End/Arrow always emit a target, never
    // silently no-op.
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('jumps to first/last on Home/End', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<FileViewerTabs active="blame" onChange={onChange} />)
    fireEvent.keyDown(getByRole('tablist'), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('code')
    fireEvent.keyDown(getByRole('tablist'), { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('blame')
  })

  it('uses tabIndex roving: only the active tab is in the tab order', () => {
    const { getByRole } = render(<FileViewerTabs active="blame" onChange={() => {}} />)
    const code = getByRole('tab', { name: 'Code' })
    const blame = getByRole('tab', { name: 'Blame' })
    expect(code.getAttribute('tabindex')).toBe('-1')
    expect(blame.getAttribute('tabindex')).toBe('0')
  })
})
