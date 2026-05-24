## 1. SettingsMenu — add View section and overflow guard

- [x] 1.1 Import `useViewMode` (and its `ViewMode` type) into `web/src/components/SettingsMenu.tsx`.
- [x] 1.2 Add a third `<div className="settings-section">` after Density labelled "View" with radio-style buttons for `list` and `grid`, mirroring the Theme/Density section markup (use the same `.settings-options` / `.settings-opt` classes; `role="radiogroup"` with `aria-label="View"`).
- [x] 1.3 Wire the new radios to `useViewMode()`; clicking a radio sets the view mode immediately and reflects `aria-checked` / `.is-on` based on the active value.
- [x] 1.4 In `web/src/components/SettingsMenu.css`, add `max-width: calc(100vw - 16px)` to `.settings-popover`.
- [x] 1.5 In the same `.settings-popover` rule, change `min-width: 220px` to `min-width: min(220px, calc(100vw - 16px))` so the popover can shrink on hypothetical sub-236 px viewports.
- [x] 1.6 Manually verify in `make dev-web` at viewport widths 320 px, 375 px, and 800 px that the popover opens fully inside the viewport with all three sections visible and tappable.

## 2. Toolbar — remove standalone ViewToggle and split desktop into two rows

- [x] 2.1 In `web/src/components/Toolbar.tsx`, remove the `import ViewToggle from './ViewToggle'` and the `<ViewToggle />` render site inside the `showFolderControls` branch.
- [x] 2.2 Restructure the returned JSX so the desktop toolbar renders two child rows wrapped in `.toolbar`:
  - `.toolbar-controls` containing `<BranchPicker />`, `<ChangesBadge />`, `<SearchBox … />` (only when `showFolderControls`), `<SettingsMenu />`.
  - `.toolbar-path` containing `<Breadcrumbs path={path} />`.
- [x] 2.3 Keep the existing `showFolderControls` gate on `<SearchBox />` so it still hides on file routes and git routes; do not gate `<SettingsMenu />` (it is always present).
- [x] 2.4 Update `web/src/components/Toolbar.css`:
  - Remove or repurpose `.toolbar-spacer` (no longer needed once `.toolbar-controls` is right-aligned).
  - `.toolbar` becomes a vertical flex container (`flex-direction: column`) on desktop; controls and path rows stack.
  - `.toolbar-controls` is a horizontal flex row with `justify-content: flex-end` and the existing 12 px gap; preserves `align-items: center`.
  - `.toolbar-path` is a horizontal flex row that lets the breadcrumb take the full width.
- [x] 2.5 Inside `@media (max-width: 800px)`:
  - Hide `.toolbar-controls` (its members live in the topbar / drawer on mobile).
  - Keep `.toolbar` rendering the path row + the full-width SearchBox row using the existing `order: 10` pattern; do not change SearchBox's mobile behaviour.
- [x] 2.6 Confirm the `.toolbar-git` rule (currently used for the inline BranchPicker/ChangesBadge pair) is reachable from inside `.toolbar-controls`; either keep the wrapper in JSX or fold its `display: inline-flex; gap: 8px` into `.toolbar-controls` directly. Keep the mobile `.toolbar-git { display: none }` semantics (now naturally satisfied by hiding the controls row).

## 3. Layout — replace mobile theme toggle with SettingsMenu

- [x] 3.1 In `web/src/components/Layout.tsx`, remove the mobile topbar's theme-toggle `<button>` (the one with `aria-label="Toggle theme"`).
- [x] 3.2 Render `<SettingsMenu />` in the same trailing-edge slot of the `.topbar` header.
- [x] 3.3 Remove the now-unused imports: `SunIcon`, `MoonIcon` from `./icons`, and the `themeChoice` / `setThemeChoice` destructuring from `useTheme()` if those values are no longer referenced anywhere else in `Layout.tsx`. (Keep the `useTheme` hook call only if other parts of `Layout.tsx` still use it; otherwise drop the import entirely.)
- [x] 3.4 Verify the topbar still renders the menu affordance on the left and the brand title centered; ensure `<SettingsMenu />` does not break the topbar's flex layout (it may need a wrapping `<div>` if the popover's `position: relative` causes alignment shifts, but `SettingsMenu` already wraps itself in `.settings { position: relative; }` so it should drop in cleanly).

## 4. Tests — update assertions that touch removed UI

- [x] 4.1 Search for `Toggle theme` (the aria-label) across `web/src/**/*.test.*`; for any test asserting on this button, replace with assertions on the Settings button (`aria-label="Settings"`) or on Theme radios inside the opened popover.
- [x] 4.2 Search for `ViewToggle` and the `List view` / `Grid view` aria-labels in tests; verify none assert that the toggle sits in the toolbar. Update wording or move the assertion into the Settings popover open path.
- [x] 4.3 If `web/src/components/Layout.keyboard.test.tsx` renders the topbar or asserts on its DOM, confirm it still passes after the swap. Adjust as needed.
- [x] 4.4 Add (or extend) a SettingsMenu test that opens the popover and asserts the View section is rendered with two options (`List`, `Grid`) reflecting the persisted `explorer.view` value.

## 5. Dead-code follow-up for ViewToggle

- [x] 5.1 After the changes in §2, grep the repo for remaining imports of `./ViewToggle` or `ViewToggle.css`; expect zero in production code.
- [x] 5.2 If no production code references `ViewToggle.tsx` or `ViewToggle.css`, delete both files in the same change. If any test or fixture still imports them, leave the files in place and add a follow-up note (do NOT keep them through a code change just to be safe — only retain if there is a real referrer).

## 6. Build, lint, embed

- [x] 6.1 Run `cd web && npm run lint` and fix any new findings introduced by the changes.
- [x] 6.2 Run `cd web && npm run build` to refresh `internal/server/ui/dist/`; commit the regenerated artifacts alongside the `web/src/` changes (per CLAUDE.md's "any change under web/src/ requires running make web-commit" rule).
- [x] 6.3 Run `make build` from the repo root and confirm the resulting `./explorer` binary boots; smoke-test against `./testdata` on both desktop width (e.g. 1024 px) and mobile width (e.g. 375 px in devtools).
- [x] 6.4 Run `make test` and confirm Go tests still pass. (No server behaviour has changed; failures here would indicate accidental regression.)

## 7. Manual UX verification against the spec

- [x] 7.1 At ≥800 px: open the SPA and confirm the controls row (BranchPicker, ChangesBadge, SearchBox, SettingsMenu) renders right-aligned above a breadcrumb row.
- [x] 7.2 At <800 px: confirm the topbar shows `[menu]   Explorer   [⚙]` and that the standalone theme toggle is gone.
- [x] 7.3 Open the Settings popover at 320 px, 375 px, and 800 px; verify it stays inside the viewport at every width and that Theme, Density, and View sections are all visible and tappable.
- [x] 7.4 On a file route (`/view/<file>`) and a git route (`/git/commits`), open Settings and confirm the View section is still visible and interactive.
- [x] 7.5 Change view to Grid in Settings on a file route, then navigate to a folder URL; confirm the listing renders as a grid.
- [x] 7.6 Verify the keyboard shortcuts still work post-refactor: `/` focuses search; `Escape` clears search; `Backspace` navigates up from a folder.

## 8. Regenerate demo GIFs

- [x] 8.1 Invoke the `record-demo-gif` skill to regenerate `docs/desktop.gif`, capturing the new two-row desktop toolbar (controls row above breadcrumb row) and an open Settings popover that shows Theme + Density + View.
- [x] 8.2 Invoke the `record-demo-gif` skill to regenerate `docs/mobile.gif`, capturing the new mobile topbar (Settings replacing the theme toggle in the top-right slot) and an open Settings popover demonstrating the viewport-overflow fix at a narrow width.
- [x] 8.3 Commit both regenerated GIFs in the same commit (or PR) as the `web/src/` changes; do not split into a follow-up.
