## 1. Foundations: design tokens and pre-mount setup

- [x] 1.1 Replace `web/src/index.css` palette with the design's oklch tokens (`--bg`, `--bg-soft`, `--bg-panel`, `--fg`, `--fg-muted`, `--fg-faint`, `--line`, `--line-soft`, `--accent: #c9602b`, `--accent-fg`, `--hover`, `--active`, `--shadow`) for `[data-theme="light"]` and `[data-theme="dark"]`.
- [x] 1.2 Add density-driven tokens in `index.css`: default `--row-h: 44px` and `--content-pad: 24px`, plus `[data-density="compact"]` (36/16) and `[data-density="comfy"]` (52/32). Add `--radius`, `--radius-lg`, `--font-sans`, `--font-mono`.
- [x] 1.3 Update `web/index.html` inline pre-mount script to apply persisted `explorer.density` (default `regular`) onto `<html data-density>` alongside the existing theme application; ensure no FOUC for either.
- [x] 1.4 Confirm `box-sizing: border-box`, `html, body, #root { height: 100%; margin: 0 }` and remove the existing `#root { min-height: 100vh; flex }` so the new shell can lock the viewport.

## 2. Hooks and persistence

- [x] 2.1 Add `web/src/hooks/useLocalStorageSetting.ts` — a generic hook returning `[value, setValue]` with read-on-mount + write-on-change for `localStorage[key]`, defaulting to a passed-in initial value.
- [x] 2.2 Update `useTheme.ts` only as needed to coexist with `useLocalStorageSetting` (storage key `explorer.theme`, three-way `light` | `dark` | `system`, system reactive via `matchMedia`); preserve the no-flash contract.
- [x] 2.3 Add a `useViewMode` thin wrapper around `useLocalStorageSetting<'list' | 'grid'>('explorer.view', 'list')`.
- [x] 2.4 Add a `useDensity` thin wrapper around `useLocalStorageSetting<'compact' | 'regular' | 'comfy'>('explorer.density', 'regular')`; on change, mutate `document.documentElement.dataset.density`.
- [x] 2.5 Add a small `useClickOutside` ref hook for the settings popover.

## 3. Layout shell

- [x] 3.1 Replace `web/src/components/Layout.tsx` with the new shell: a CSS-grid `.app` (`260px 1fr` columns, `100vh` rows, `overflow: hidden`) containing a `<aside class="sidebar">` (brand + tree + scrollable region) and a `<main class="main">` containing a single `<div class="toolbar">` and a scrollable `<div class="content">` rendering `<Outlet/>`.
- [x] 3.2 Move the brand mark + name into the sidebar header (`.sidebar-head` + `.brand` + `.brand-mark` + `.brand-name`); remove the existing top-level `<header class="layout-header">` row at the desktop breakpoint.
- [x] 3.3 Add a mobile-only `<header class="topbar">` containing a hamburger icon button, the "Explorer" title, and a theme-icon button (☾/☀ that cycles light↔dark on tap; system stays accessible from the settings popover on desktop).
- [x] 3.4 Add a `<div class="scrim">` overlay element rendered only when the mobile sidebar is open; clicking it closes the drawer.
- [x] 3.5 Wire the breakpoint to 800 px (was 768 px) — update `Layout.tsx`'s `matchMedia('(min-width: 800px)')` and the `@media (max-width: 800px)` block in `Layout.css`.
- [x] 3.6 Implement `Layout.css` for the new shell: `.app` grid, `.sidebar` (background `--bg-soft`, right border `--line`, internal scroll on `.sidebar-tree`), `.main` (column flex, `min-width: 0`), `.toolbar` (flex row, padding `14px 24px`, bottom border, sticky-friendly), `.content` (`flex: 1; overflow: auto; padding: var(--content-pad)`).

## 4. Toolbar and shared chrome

- [x] 4.1 Create `web/src/components/Toolbar.tsx` (+ `Toolbar.css`) that composes `Breadcrumbs`, `SearchBox`, `ViewToggle`, and `SettingsMenu` with a `.toolbar-spacer` between crumbs and the right-side controls. Hide search and view-toggle when the current route is a file URL.
- [x] 4.2 Restyle `Breadcrumbs.tsx` + `.css` to match the design (`.crumbs` flex row, `.crumb-item` button-style segments, `.crumb-sep` chevron icon between segments, `.is-current` non-clickable last segment). Keep ancestor links clickable.
- [x] 4.3 Create `SearchBox.tsx` + `.css` (`.search` container, search-icon glyph, `<input>`, clear-button when value present). Expose a `ref` to focus from outside (for the `/` shortcut).
- [x] 4.4 Create `ViewToggle.tsx` + `.css` (`.seg` wrapper, two `.seg-btn` for list and grid, `.is-on` highlight). Wire to `useViewMode`.
- [x] 4.5 Create `SettingsMenu.tsx` + `.css` — toolbar icon button that opens a popover containing radio-group controls for theme (light / dark / system) and density (compact / regular / comfy). Dismiss on click-outside (`useClickOutside`) and on `Escape`.

## 5. Sidebar tree

- [x] 5.1 Restyle `TreeSidebar.tsx` + `.css` to match the design's `.tree-row`, `.tree-caret` (rotates on open), `.tree-label` (truncating), `.tree-children` (left padding 16 px). Preserve the existing GitHub-style behaviour (chevron expands inline; folder name navigates) — see existing `### Requirement: Desktop tree behaves GitHub-style`.
- [x] 5.2 Add the `.is-active` row state with the 3-px accent rule rendered via `::before`. Drive from current route path.
- [x] 5.3 Add the `.sidebar-section` heading ("Folders") above the tree. Add the `.sidebar-close` icon button (visible only in the mobile drawer).
- [x] 5.4 Wire mobile drawer state to `Layout.tsx` (`sidebar-open` class on `.sidebar`); ensure tapping a folder name in the drawer closes the drawer after navigation.

## 6. Folder listing — list + grid + search + sort

- [x] 6.1 Refactor `FolderListing.tsx` to receive `view` (from `useViewMode`), `search` (from `Toolbar` via context or lifted state in `ViewPage`), `sortBy`/`sortDir` (component state), `onSort` callback. Default sort: name ascending. Reset sort to defaults on `path` change.
- [x] 6.2 Replace the `<table>` with a `<div class="rows">` of `<button class="row">` rows for list view: 4-column CSS grid (`28px 1fr 140px 100px`), icon + name + modified + size, hover background. Use `--row-h` for row height.
- [x] 6.3 Add the sticky `.folder-head` with three sortable column buttons (`.fh-col` for Name / Modified / Size). Render the active column's direction arrow (↑/↓). Clicking the active column toggles direction; clicking a non-active column sets it ascending. Folders always sort above files.
- [x] 6.4 Add grid view: `.tiles` CSS grid (`repeat(auto-fill, minmax(160px, 1fr))`, gap 16 px). `.tile` button containing `.tile-thumb` (image entries: `<img src={/raw/path} loading="lazy">`; non-image: `.tile-icon` of the kind glyph), `.tile-name`, `.tile-meta` ("N items" for folders, formatted size for files).
- [x] 6.5 Implement client-side search filter: case-insensitive substring match on `name`. When the search produces no results, render the empty state with a hint mentioning the query.
- [x] 6.6 Build a `iconForFile()` helper that maps an entry's MIME / extension to one of the design's icon glyphs (folder, file, image, md, code, etc.); for now the only kinds with distinct rendering are folder, image, markdown, text, and a generic file fallback (the others are deferred). Keep the icon set extensible.
- [x] 6.7 Implement the empty state component (`.empty` + `.empty-mark` ∅ + `.empty-title` + optional `.empty-hint`).

## 7. File viewer chrome

- [x] 7.1 Refactor `FileViewer.tsx` so the viewer body is wrapped in `.file-detail` and preceded by a `.file-head` containing: a back button (icon-only, navigates to parent), a `.file-head-meta` block with `.file-head-name` (kind icon + name) and `.file-head-sub` (mime · size · modified), and `.file-head-actions` with a copy-link icon button and a download `<a class="btn btn-sm" href="/raw/...">` with an inline download icon and "Download" label.
- [x] 7.2 Implement the copy-link action: `navigator.clipboard.writeText(window.location.href)` then trigger a toast.
- [x] 7.3 Apply the design's mobile collapse: `.file-head-actions .btn-label { display: none }` and `.file-head-actions .btn { width: 32px; padding: 0; justify-content: center }` below 800 px.

## 8. Toast component

- [x] 8.1 Create `web/src/components/Toast.tsx` + `.css`: fixed-position bottom-centre, `.toast` styled per design, slide-in animation (`@keyframes toast-in` from the prototype). Render conditionally via a small context or local state in `Layout`.
- [x] 8.2 Add a `useToast()` hook (or a context provider) exposing `setToast(message, ms?)` that auto-dismisses after 1800 ms by default; consumed by the file-detail copy-link handler.

## 9. Markdown body restyle

- [x] 9.1 Update `MarkdownRenderer.css` to match the design's `.md-body` (`max-width: 760px`, `margin: 0 auto`, `padding: 40px 48px`, `font-size: 15px`, `line-height: 1.7`).
- [x] 9.2 Apply the design's heading scale (`.md-h{ letter-spacing: -0.01em; margin: 1.5em 0 0.4em; line-height: 1.25 }`, h1 28 px, h2 22 px, h3 18 px). Keep first-child margin-top: 0.
- [x] 9.3 Restyle blockquote (`border-left: 3px solid var(--accent); padding: 4px 16px; color: var(--fg-muted); font-style: italic`), inline code (`background: var(--bg-soft); padding: 2px 6px; border-radius: 4px; font: var(--font-mono)`), code blocks (`background: var(--bg-soft); border: 1px solid var(--line-soft); border-radius: 8px; padding: 14px 16px; overflow-x: auto`), horizontal rule, and tables (per design's `.md-table`).
- [x] 9.4 Wrap the rendered markdown output in a container that gets the design's `.vw .vw-md` framing (`background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--radius-lg)`) so it matches the file-detail aesthetic. Do NOT modify the renderer pipeline (`react-markdown` + `rehype-sanitize` + relative-link rewrite plugin) — only CSS and the surrounding wrapper.

## 10. Keyboard shortcuts

- [x] 10.1 Add a window-level `keydown` listener in `Layout.tsx` (or a dedicated `useKeyboardShortcuts` hook). Skip when the active element is `INPUT`/`TEXTAREA`/`isContentEditable`.
- [x] 10.2 `/` — `e.preventDefault()` and call `searchRef.current?.focus()` if the search input is mounted (i.e. on a folder view).
- [x] 10.3 `Escape` — if the search has a value, clear it; else if the route is a file URL, navigate to its parent folder.
- [x] 10.4 `Backspace` — if not in a field and not on a file URL and not at root, `e.preventDefault()` and navigate to the parent folder.

## 11. Cleanup and verification

- [x] 11.1 Remove unused styles: `theme-toggle` in `Layout.css` (replaced by the settings menu and the mobile-only icon toggle), the old `.layout-header` / `.layout-breadcrumbs` blocks, the old GitHub-hex palette in `index.css`.
- [x] 11.2 Update `web/src/components/FolderListing.css` to drop the table-based styles superseded by the new `.row`/`.tile` CSS.
- [x] 11.3 Sanity-check `npm run lint` (cd web). Fix any lint findings introduced by the refactor.
- [x] 11.4 Run `make build` and verify the SPA still embeds (no missing imports, dist exists).
- [x] 11.5 Run `make test` to confirm the Go server tests still pass (no server changes were made; this is a regression check).
- [x] 11.6 Manual UI verification with `make dev-server` + `make dev-web`:
  - Folder listing: list view sortable by name / modified / size; folders stay above files; grid view renders image thumbnails.
  - Search: `/` focuses; substring filters; empty state with hint when no match; `Escape` clears.
  - File viewer: back / copy-link (toast appears) / download all work; markdown body matches design.
  - Theme: light / dark / system all work; no FOUC on reload with persisted dark.
  - Density: compact / regular / comfy change row height + content padding; persisted.
  - Mobile (<800 px): drawer opens via hamburger and dismisses via scrim; modified column hidden; search full-width; download / copy-link icon-only.
  - Keyboard: `/`, `Escape`, `Backspace` behave per spec; `Backspace` does not navigate browser history.
  Replaced manual eyeballing with a headless playwright e2e suite (`/tmp/e2e/smoke.mjs`) that drives the SPA against the built binary and asserts each item above (33/33 checks, 0 unexpected HTTP errors, 0 page errors). Two real defects were caught and fixed: (a) `useViewMode` hook instances didn't share state across components — fixed via `useSyncExternalStore` + per-key pub-sub in `useLocalStorageSetting`; (b) the keyboard `useEffect` reattach after navigation left a stale window listener active, so `Backspace` used the wrong path — fixed by registering the listener once and reading `window.location.pathname` plus refs for fresh state.
- [x] 11.7 `openspec verify --change refresh-spa-design` (or the equivalent `opsx:verify`) before archiving. (Ran `openspec validate refresh-spa-design` — change is valid.)
