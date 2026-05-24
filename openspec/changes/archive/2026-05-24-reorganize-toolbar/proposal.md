## Why

The toolbar and mobile topbar today scatter related controls across multiple surfaces: the mobile topbar exposes a one-off theme toggle while the rest of the global preferences (theme, density) live in a separate Settings popover further down the page, and the view-mode toggle sits in the toolbar as a peer of Settings rather than alongside the other "global preferences". The result is two redundant theme entry points, a control vocabulary that's harder to discover, and a mobile Settings popover that can render off-screen-left because nothing constrains its width against the viewport. Consolidating all global preferences into a single Settings popover and giving the desktop chrome a dedicated controls row above the path breadcrumb tightens the mental model and unblocks the popover-overflow fix at the same time.

## What Changes

- **Mobile topbar**: replace the standalone theme toggle in the top-right slot with the Settings entry point. The menu button on the left and the centered brand title stay.
- **Desktop toolbar**: split into two rows. The top row is right-aligned and hosts the git surface (BranchPicker + ChangesBadge), the search input, and the Settings entry point. The bottom row holds the breadcrumb path on its own.
- **Settings popover** becomes the single home for global preferences: Theme, Density, and View mode (list/grid). The standalone `ViewToggle` rendering from the toolbar is removed; the component still exists but is mounted inside the popover.
- **View mode in Settings is always visible** (treated as a global preference). It is not conditionally hidden on file or git routes — it just persists the next-folder-view choice.
- **Settings popover positioning** is hardened so it can never extend past the left edge of the viewport on small screens: a `max-width: calc(100vw - <gutter>)` guard plus a `min-width` that backs off on tiny viewports.
- The mobile drawer keeps BranchPicker + ChangesBadge in its header (no behavioural change there — that surface is the mobile home for git affordances since there is no desktop-style top toolbar row on mobile).
- **BREAKING (UI only)**: the keyboard/visual contract for the mobile top-right control changes from "theme toggle" to "settings menu"; the desktop toolbar's flat single-row contract changes to a two-row contract. No JSON API, URL, or persisted-storage key changes.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `web-ui`: the chrome layout (mobile topbar contents, desktop toolbar shape) and the Settings popover contract (contents + positioning) change. No other capability is touched — the server, path resolver, git reader, CLI, and release pipeline are not involved.

## Impact

- **Code (SPA only)**:
  - `web/src/components/Layout.tsx`: drop the `SunIcon`/`MoonIcon` import and the standalone theme toggle button in the mobile topbar; render `<SettingsMenu />` in that slot instead.
  - `web/src/components/Toolbar.tsx`: restructure into two rows on desktop; on mobile keep a single row (breadcrumb + full-width search). Remove the standalone `<ViewToggle />` render.
  - `web/src/components/SettingsMenu.tsx`: add a third section (View mode) wired to `useViewMode`.
  - `web/src/components/SettingsMenu.css`: add the viewport-overflow guard (`max-width: calc(100vw - 16px)`; bounded `min-width`).
  - `web/src/components/Toolbar.css` / `Layout.css`: row layout, alignment, breakpoint behaviour.
  - Existing tests: `Layout.keyboard.test.tsx`, `FileViewer.test.tsx`, `MarkdownRenderer.test.tsx`, `web/src/git/BranchPicker.test.tsx` — verify none assert on the removed theme-toggle button or the standalone toolbar `ViewToggle` and update where they do.
- **Specs**: `openspec/specs/web-ui/spec.md` only. The `SPA layout adapts to viewport` requirement is modified; a new `Settings popover` requirement is added covering contents and positioning. The existing `Theme handling` requirement is unaffected (its scenarios already reference "the settings menu" without specifying where it lives in the chrome).
- **Server / API**: no change. `/api/tree`, `/api/meta`, `/raw/*`, and the resolver are untouched.
- **Persistence**: no `localStorage` key changes. Theme (`explorer.theme`), density (`explorer.density`), and view mode (`explorer.view`) keep their existing semantics.
- **Build / embed**: standard `make web-commit` flow; `internal/server/ui/dist/` re-committed alongside `web/src/` changes.
- **Docs**: `CLAUDE.md` mentions the toolbar contents in passing under "SPA conventions" but does not enumerate them; no doc edits required.
- **Demo GIFs**: `docs/desktop.gif` and `docs/mobile.gif` (referenced from the README) both show the toolbar chrome and the mobile topbar that this change restructures. Both GIFs MUST be regenerated via the `record-demo-gif` skill as part of this change, not deferred to a follow-up.
