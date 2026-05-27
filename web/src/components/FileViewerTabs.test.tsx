import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FileViewerTabs from './FileViewerTabs'

const TEXT_TABS = ['code', 'blame'] as const
const MD_TABS = ['preview', 'code', 'blame'] as const

// FileViewerTabs is the pure tablist control rendered above the file viewer
// content. The integration with `?view=` URL state lives in FileViewer
// and is exercised in the higher-level component test — here we cover the
// ARIA pattern (selected attr + keyboard navigation) in isolation, for both
// the two-tab (text) and three-tab (markdown) variants.
describe('FileViewerTabs (text: 2 tabs)', () => {
  it('marks the active tab via aria-selected', () => {
    const { getByRole } = render(
      <FileViewerTabs tabs={[...TEXT_TABS]} active="code" onChange={() => {}} />,
    )
    expect(getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true')
    expect(getByRole('tab', { name: 'Blame' }).getAttribute('aria-selected')).toBe('false')
  })

  it('switches tabs on click', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <FileViewerTabs tabs={[...TEXT_TABS]} active="code" onChange={onChange} />,
    )
    fireEvent.click(getByRole('tab', { name: 'Blame' }))
    expect(onChange).toHaveBeenCalledWith('blame')
  })

  it('moves the active tab on ArrowRight/ArrowLeft', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <FileViewerTabs tabs={[...TEXT_TABS]} active="code" onChange={onChange} />,
    )
    fireEvent.keyDown(getByRole('tablist'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('blame')
    fireEvent.keyDown(getByRole('tablist'), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('jumps to first/last on Home/End', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <FileViewerTabs tabs={[...TEXT_TABS]} active="blame" onChange={onChange} />,
    )
    fireEvent.keyDown(getByRole('tablist'), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('code')
    fireEvent.keyDown(getByRole('tablist'), { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('blame')
  })

  it('uses tabIndex roving: only the active tab is in the tab order', () => {
    const { getByRole } = render(
      <FileViewerTabs tabs={[...TEXT_TABS]} active="blame" onChange={() => {}} />,
    )
    expect(getByRole('tab', { name: 'Code' }).getAttribute('tabindex')).toBe('-1')
    expect(getByRole('tab', { name: 'Blame' }).getAttribute('tabindex')).toBe('0')
  })
})

describe('FileViewerTabs (markdown: 3 tabs)', () => {
  it('renders Preview, Code, Blame in that order', () => {
    const { getAllByRole } = render(
      <FileViewerTabs tabs={[...MD_TABS]} active="preview" onChange={() => {}} />,
    )
    const labels = getAllByRole('tab').map((el) => el.textContent)
    expect(labels).toEqual(['Preview', 'Code', 'Blame'])
  })

  it('marks Preview as the default active tab via aria-selected', () => {
    const { getByRole } = render(
      <FileViewerTabs tabs={[...MD_TABS]} active="preview" onChange={() => {}} />,
    )
    expect(getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected')).toBe('true')
    expect(getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('false')
    expect(getByRole('tab', { name: 'Blame' }).getAttribute('aria-selected')).toBe('false')
  })

  it('ArrowRight cycles Preview → Code', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <FileViewerTabs tabs={[...MD_TABS]} active="preview" onChange={onChange} />,
    )
    fireEvent.keyDown(getByRole('tablist'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('code')
  })

  it('ArrowLeft from Preview wraps to Blame', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <FileViewerTabs tabs={[...MD_TABS]} active="preview" onChange={onChange} />,
    )
    fireEvent.keyDown(getByRole('tablist'), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('blame')
  })

  it('Home jumps to Preview, End jumps to Blame', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <FileViewerTabs tabs={[...MD_TABS]} active="code" onChange={onChange} />,
    )
    fireEvent.keyDown(getByRole('tablist'), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('preview')
    fireEvent.keyDown(getByRole('tablist'), { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('blame')
  })

  it('clicking Code emits the right tab id', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <FileViewerTabs tabs={[...MD_TABS]} active="preview" onChange={onChange} />,
    )
    fireEvent.click(getByRole('tab', { name: 'Code' }))
    expect(onChange).toHaveBeenCalledWith('code')
  })

  it('only the active tab is in the tab order', () => {
    const { getByRole } = render(
      <FileViewerTabs tabs={[...MD_TABS]} active="blame" onChange={() => {}} />,
    )
    expect(getByRole('tab', { name: 'Preview' }).getAttribute('tabindex')).toBe('-1')
    expect(getByRole('tab', { name: 'Code' }).getAttribute('tabindex')).toBe('-1')
    expect(getByRole('tab', { name: 'Blame' }).getAttribute('tabindex')).toBe('0')
  })
})
