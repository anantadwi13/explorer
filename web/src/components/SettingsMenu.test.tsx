import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import SettingsMenu from './SettingsMenu'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-view')
})

describe('SettingsMenu View section', () => {
  it('renders a View section with List and Grid options when the popover opens', () => {
    render(<SettingsMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    const viewGroup = screen.getByRole('radiogroup', { name: 'View' })
    const listOpt = within(viewGroup).getByRole('radio', { name: 'List' })
    const gridOpt = within(viewGroup).getByRole('radio', { name: 'Grid' })

    expect(listOpt).toBeInTheDocument()
    expect(gridOpt).toBeInTheDocument()
  })

  it('reflects the persisted explorer.view value on open', () => {
    localStorage.setItem('explorer.view', 'grid')
    render(<SettingsMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    const viewGroup = screen.getByRole('radiogroup', { name: 'View' })
    expect(within(viewGroup).getByRole('radio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true')
    expect(within(viewGroup).getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'false')
  })

  it('updates the persisted view mode when an option is clicked', () => {
    render(<SettingsMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    const viewGroup = screen.getByRole('radiogroup', { name: 'View' })
    fireEvent.click(within(viewGroup).getByRole('radio', { name: 'Grid' }))

    expect(localStorage.getItem('explorer.view')).toBe('grid')
    expect(within(viewGroup).getByRole('radio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true')
  })
})
