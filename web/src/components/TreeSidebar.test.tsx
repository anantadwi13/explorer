import { render, waitFor, fireEvent, act } from '@testing-library/react'
import { createRef } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TreeResponse, TreeEntry } from '../api/types'
import { LayoutContext } from './LayoutContext'
import TreeSidebar from './TreeSidebar'

const treeMock = vi.fn<(path: string) => Promise<{ ok: true; data: TreeResponse }>>()

vi.mock('../api/client', () => ({
  tree: (path: string) => treeMock(path),
}))

function level(...items: [string, 'dir' | 'file'][]): TreeEntry[] {
  return items.map(([name, type]) => ({ name, type }))
}

// folder level -> its direct children. The root is keyed by ''.
const TREE: Record<string, TreeEntry[]> = {
  '': level(['notes', 'dir'], ['x', 'dir'], ['readme', 'file']),
  notes: level(['2026', 'dir'], ['draft', 'dir'], ['readme', 'file']),
  'notes/2026': level(['report.md', 'file'], ['a.md', 'file'], ['b.md', 'file']),
  x: level(['x-inner', 'file']),
  'notes/draft': level(['d1', 'file']),
}

const layoutValue = {
  search: '',
  setSearch: () => {},
  searchRef: createRef<HTMLInputElement>(),
  isFileRoute: true,
  showToast: () => {},
  closeSidebar: () => {},
}

function renderTree(initialActivePath: string) {
  const state = { activePath: initialActivePath }
  function Harness() {
    // Reads state.activePath so navigation tests can advance it.
    const activePath = state.activePath
    return (
       <MemoryRouter initialEntries={[`/view/${activePath}`]}>
         <LayoutContext.Provider value={layoutValue}>
           <TreeSidebar activePath={activePath} />
         </LayoutContext.Provider>
       </MemoryRouter>
      )
  }
  const utils = render(<Harness />)
  return {
    ...utils,
    navigate: (p: string) => {
      state.activePath = p
      utils.rerender(<Harness />)
    },
   }
}

function activeRow(container: HTMLElement): HTMLAnchorElement | null {
  return container.querySelector('.tree-row.is-active')
}

// Find a folder's caret by the label rendered in its row.
function findCaret(container: HTMLElement, label: string): HTMLButtonElement | null {
  const buttons = Array.from(
     container.querySelectorAll<HTMLButtonElement>('button.tree-caret'),
     )
  const hit = buttons.find((b) => {
    const row = b.closest('.tree-row') as HTMLElement | null
    return row?.querySelector('.tree-label')?.textContent === label
     })
  return hit ?? null
}

beforeEach(() => {
  treeMock.mockReset()
  treeMock.mockImplementation((path: string) =>
     Promise.resolve({ ok: true, data: { entries: TREE[path] ?? [] } }),
     )
   // jsdom lacks scrollIntoView; install a spy so the active row can scroll.
  Element.prototype.scrollIntoView = vi.fn() as unknown as HTMLElement['scrollIntoView']
})

describe('TreeSidebar active-path reveal', () => {
  it('deep link to a file auto-expands ancestors, highlights and scrolls the leaf', async () => {
    const { container } = renderTree('notes/2026/report.md')

    await waitFor(() => expect(activeRow(container)).not.toBeNull())
    expect(activeRow(container)!.textContent).toContain('report.md')

    // The root, the 'notes' level, and the 'notes/2026' level are all fetched
    // so the active leaf can be rendered.
    const fetched = treeMock.mock.calls.map((c) => c[0]).sort()
    expect(fetched).toEqual(['', 'notes', 'notes/2026'].sort())

     // The active row scrolls itself into view within the tree.
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
     })

  it('deep link to a folder expands its ancestors and highlights the folder', async () => {
    const { container } = renderTree('notes/2026')

    await waitFor(() => expect(activeRow(container)).not.toBeNull())
    expect(activeRow(container)!.textContent).toContain('2026')

     // 'notes' is the single auto-expanded ancestor of the active folder.
    const expanded = Array.from(
       container.querySelectorAll<HTMLAnchorElement>('a[aria-expanded="true"]'),
        ).map((el) => el.getAttribute('href'))
   expect(expanded).toContain('/view/notes/')
     })

  it('navigating between deep files keeps a manually opened sibling expanded', async () => {
    const { container, navigate } = renderTree('notes/2026/report.md')
     await waitFor(() => expect(activeRow(container)).not.toBeNull())

      // Manually open the sibling 'x' folder, which is not on the active path.
     await act(async () => {
       fireEvent.click(findCaret(container, 'x')!)
        })
    expect(container.textContent).toContain('x-inner')

    // Navigate to another file under the same chain.
     await act(async () => {
       navigate('notes/2026/a.md')
        })
    await waitFor(() => {
      const row = activeRow(container)
      if (!row) throw new Error('active row not rendered')
      expect(row.textContent).toContain('a.md')
       })

     // 'x' and its child remain open across the navigation.
    expect(container.textContent).toContain('x-inner')
     })

  it('a new deep link re-expands an ancestor that was manually collapsed', async () => {
    const { container, navigate } = renderTree('notes/2026/report.md')
     await waitFor(() => expect(activeRow(container)).not.toBeNull())

      // Collapse the 'notes' ancestor.
     await act(async () => {
       fireEvent.click(findCaret(container, 'notes')!)
        })
    expect(activeRow(container)).toBeNull()

    // A new link under the collapsed ancestor re-opens it.
     await act(async () => {
       navigate('notes/2026/b.md')
        })
    await waitFor(() => expect(activeRow(container)).not.toBeNull())
    expect(activeRow(container)!.textContent).toContain('b.md')
     })

  it('reveal works without opening any drawer (drawer is Layout-owned, not the tree)', async () => {
    // TreeSidebar only reads an activePath prop and never raises a drawer-open
    // flag; it renders the revealed leaf regardless of viewport.
    const { container } = renderTree('notes/2026/report.md')
     await waitFor(() => expect(activeRow(container)).not.toBeNull())
    expect(activeRow(container)!.textContent).toContain('report.md')
    // No drawer/scrim markup exists in the tree.
    expect(container.querySelector('.scrim')).toBeNull()
     })

  it('a chevron collapse hides nested rows while keeping active state consistent', async () => {
    const { container } = renderTree('notes/2026/report.md')
     await waitFor(() => expect(activeRow(container)).not.toBeNull())
    expect(activeRow(container)).not.toBeNull()

      // Collapsing '2026' unmounts the nested active leaf.
     await act(async () => {
       fireEvent.click(findCaret(container, '2026')!)
        })
    expect(activeRow(container)).toBeNull()
     })
})
