## Context

The current SPA chrome has grown organically and now distributes related controls across three surfaces:

- **Mobile topbar (`<800px`)** — `[≡ menu]  Explorer  [☀ theme toggle]`. The theme toggle is a single-purpose entry point.
- **Mobile toolbar (`.toolbar` row, `<800px`)** — `Breadcrumbs · ViewToggle · SettingsMenu`, with SearchBox forced to its own row via `order: 10`. The SettingsMenu popover here renders `position: absolute; right: 0` against a small `.settings` wrapper, with `min-width: 220px` and no viewport guard.
- **Desktop toolbar (`≥800px`)** — one flex row: `Breadcrumbs · spacer · BranchPicker · ChangesBadge · SearchBox · ViewToggle · SettingsMenu`.

The Settings popover already houses Theme and Density. View mode (list/grid) sits one click away in the toolbar instead of inside the same "global preferences" surface. On mobile this also means the theme toggle appears twice (once in the topbar, once inside the Settings popover) — discoverable, but redundant.

Constraints we cannot break:

- Touch targets ≥44×44 CSS px; no hover-only affordances (web-ui spec).
- The mobile drawer is still the home of `BranchPicker + ChangesBadge` below 800 px; the new desktop two-row layout does not exist on mobile (no room).
- Persisted-storage keys (`explorer.theme`, `explorer.density`, `explorer.view`) must stay stable.
- The chrome design token vocabulary in `web-ui/spec.md` is closed — no new ad-hoc CSS colour values; surfaces use `var(--bg-panel)`, `var(--line)`, etc.
- Keyboard contract: `/` focuses search, `Escape` clears/exits, `Backspace` navigates up. All still need to work after the row split.

## Goals / Non-Goals

**Goals:**

- Single canonical surface for global preferences (theme, density, view mode) — the Settings popover.
- Desktop toolbar split into a controls row + a path row, with the controls right-aligned to mirror the existing "anchored to chrome corner" convention.
- Mobile topbar promotes Settings to the top-right slot, retiring the standalone theme toggle.
- Settings popover never extends past the left edge of the viewport at any supported width.

**Non-Goals:**

- Redesigning the popover into a bottom-sheet on mobile (kept as a popover; explicitly discussed and rejected as scope creep).
- Hiding the View mode row in Settings on file/git routes (treated as a global preference — always shown).
- Moving BranchPicker/ChangesBadge anywhere new on mobile (drawer header stays as today).
- Renaming the `Toolbar` React component or restructuring the React file tree.
- Server-side, API, or persistence changes.

(Note: regenerating `docs/desktop.gif` and `docs/mobile.gif` is **in scope** — both GIFs show chrome that this change rewrites. See tasks §8.)

## Decisions

### Decision 1: Two-row desktop toolbar (controls above breadcrumb), right-aligned controls

`Toolbar.tsx` renders two sibling rows wrapped by `.toolbar`:

```
.toolbar
├── .toolbar-controls   (right-aligned: BranchPicker, ChangesBadge, SearchBox, SettingsMenu)
└── .toolbar-path       (Breadcrumbs only)
```

- Right-alignment is achieved by `justify-content: flex-end` on `.toolbar-controls` (no `.toolbar-spacer` needed; the row is purely controls). This mirrors the existing "chrome controls hug the trailing edge" convention used by the file-viewer header's secondary actions.
- The path row hosts breadcrumbs at the start; nothing else competes for space, so long paths can take the full row width with `overflow` already handled by the existing breadcrumb component.
- On mobile, the same component still mounts but renders a single row (breadcrumb), with SearchBox keeping its current full-width-on-its-own-row behaviour. The controls row is collapsed (`display: contents` or hidden) on mobile because BranchPicker/ChangesBadge live in the drawer and SettingsMenu now lives in the topbar.

**Alternatives considered**:

- *Single row, controls inline with breadcrumbs (status quo with ViewToggle removed)*: keeps less vertical space but blurs the "current location vs. controls acting on it" distinction. Rejected because the user explicitly asked for the two-row split.
- *Search next to the breadcrumb (Option B from explore)*: visually couples filter with the current folder, but the user preferred Option A. Honoured.
- *Left-aligned controls*: denser look, but visually competes with the path row immediately below for the user's leading-edge attention. Right-aligned wins (user picked "best for me", and right-aligned matches the chrome-corner anchoring pattern already used).

### Decision 2: ViewToggle moves into Settings, always visible

`<ViewToggle />` is no longer rendered by `Toolbar.tsx`. Instead, `SettingsMenu.tsx` adds a third section after Density:

```
Theme    [Light]  [Dark]  [System]
Density  [Compact][Regular][Comfy]
View     [List]   [Grid]
```

- The View section uses the same `.settings-options` / `.settings-opt` styling as Theme and Density for visual consistency; the existing `ViewToggle` component is *not* embedded directly, because its visual style (icon-only `.seg` buttons) is the toolbar look. Instead, we render the same label/value pattern by calling `useViewMode()` inside `SettingsMenu`. The `ViewToggle` component file is retained so removing it later (if it becomes truly unused) is a clean follow-up, but right now it stays unused after this change.
- "Always visible" means no route-aware conditional — even on `/view/<file>` or `/git/*`, the row renders and is clickable. Behaviour mirrors Theme and Density, which are also always shown regardless of route.

**Alternatives considered**:

- *Embed `<ViewToggle />` directly in the popover*: reuses the component but mixes two visual idioms (icon segmented control vs. label + text radio buttons). Rejected for visual consistency. The cost is two places that touch view mode — small, both via `useViewMode()`, type-safe.
- *Hide the View row on non-folder routes*: marginally cleaner UX, but context-sensitive contents in a "global preferences" surface is the surprising thing. The user picked option (a) from explore.
- *Delete `ViewToggle.tsx` and `ViewToggle.css` outright*: would be the principled cleanup, but invalidates any tests / imports outside the toolbar. Keep for now; flag in tasks as a possible follow-up.

### Decision 3: Mobile topbar — Settings replaces theme toggle in the top-right slot

`Layout.tsx` swaps the `<button …><SunIcon|MoonIcon /></button>` for `<SettingsMenu />` directly. The brand title stays centered; the menu affordance on the left stays. The `useTheme` import in `Layout.tsx` is removed (still used inside `SettingsMenu.tsx`).

This naturally pushes the Settings popover's anchor to the screen's right edge, which is where it always wanted to be for "right-aligned popover extending leftward".

**Alternatives considered**:

- *Keep both buttons (Settings + Theme) in the topbar*: duplicates a control already inside Settings. Rejected.
- *Move Settings to the topbar **and** mount a second `<SettingsMenu />` in the toolbar*: two mounted instances of the same popover risks double-renders and double-handlers. Rejected.

### Decision 4: Popover viewport-overflow guard via `max-width` + bounded `min-width`

`SettingsMenu.css` gains two declarations inside `.settings-popover`:

```css
.settings-popover {
  /* existing: position: absolute; top: ...; right: 0; */
  max-width: calc(100vw - 16px);
  min-width: min(220px, calc(100vw - 16px));
}
```

- `max-width: calc(100vw - 16px)` clamps the popover to the viewport with an 8 px gutter on each side. Because the popover anchors `right: 0` to the (small) `.settings` wrapper, this guarantees the popover can never extend past the left edge regardless of the button's position.
- The bounded `min-width` lets the popover shrink on hypothetical tiny viewports (<236 px wide) instead of overflowing — defence in depth.
- The new content section (View) is shorter than Density's segmented control, so the panel's natural width does not grow.

**Alternatives considered**:

- *Switch to `position: fixed; top: <topbar-h>+6; right: 8px;` on mobile*: more robust against future re-parents, but introduces a CSS variable for the topbar height and slightly detaches the popover from its trigger visually. Rejected as over-investment for the current problem — the `max-width` guard is the minimal correct fix, and the topbar move alone already eliminates the practical overflow path.
- *Floating-UI or popper.js with collision detection*: adds a dependency for a problem solvable in three CSS lines. Rejected (stdlib-only spirit; no new deps).
- *JS-driven boundary detection on resize*: adds runtime cost and React state for what CSS already expresses declaratively. Rejected.

### Decision 5: Mobile toolbar — drop the standalone ViewToggle, search on its own row above the breadcrumb

On mobile (`<800px`), `Toolbar.tsx` renders a full-width SearchBox as the first toolbar row (directly under the topbar), with the breadcrumb path on the row below. This is achieved by:

- `.toolbar-controls` switches to `display: contents` so its descendant `<SearchBox />` becomes a direct flex child of `.toolbar` (alongside `.toolbar-path`).
- The `.toolbar-git` wrapper and the toolbar's `<SettingsMenu />` are hidden individually on mobile, since BranchPicker/ChangesBadge live in the drawer header and Settings lives in the topbar.
- `.search { width: 100% }` forces a wrap so search occupies its own row. Source order in the toolbar is `SearchBox` then `.toolbar-path`, so default flex order is what we want — no `order` overrides are needed.

Putting search above the breadcrumb keeps the filter affordance at thumb-reach on phones (directly under the topbar) instead of below the breadcrumb where it can be pushed off-screen when the breadcrumb wraps.

### Decision 6: Keyboard shortcuts unchanged

`Layout.tsx`'s window-level `keydown` handler is not touched. `/` still focuses search via `searchRef`, which is still passed to `<SearchBox>` (now in the path row on mobile, in the controls row on desktop). `Escape` and `Backspace` semantics are independent of toolbar layout.

## Risks / Trade-offs

- **Risk**: Existing snapshot/DOM tests assert on the theme toggle button's `aria-label="Toggle theme"` or on a standalone `<ViewToggle />` inside the toolbar.
  - **Mitigation**: Audit `web/src/components/Layout.keyboard.test.tsx`, `web/src/components/FileViewer.test.tsx`, and the `git/` test files for these selectors during implementation; update assertions to look for the Settings button or for the radio buttons inside the popover instead. Tasks list calls this out as an explicit step.

- **Risk**: View mode shown on file/git routes confuses users into thinking it affects the *current* view.
  - **Mitigation**: It only takes effect on the next folder listing render. The same is true of theme/density transitions — users already understand the "global preference, applies next time" model. Accepted.

- **Risk**: The popover's `max-width` clamp visually shrinks the segmented controls on a 320 px-wide phone, making them harder to tap (touch-target risk).
  - **Mitigation**: Three options per row × ~76 px each fits in 228 px of content + 32 px padding ≈ 260 px popover ≤ 304 px (320 − 16). Comfortable. Verify in `make dev-web` on a 320 px frame and at iOS SE width during implementation.

- **Risk**: Two-row desktop toolbar takes more vertical space than today.
  - **Mitigation**: Rows are compact (existing 14 px vertical padding × 2 rows = ~80 px chrome height vs. ~56 px today). The user's existing "Locked viewport on long content" scenario still holds — toolbar pinned, content scrolls. Accepted; matches the user's explicit ask.

- **Risk**: Removing the standalone theme toggle from the mobile topbar costs one tap to switch theme (now Settings → Theme → Choice instead of one tap).
  - **Mitigation**: User explicitly requested this trade. Accepted.

- **Risk**: `ViewToggle.tsx` becomes unused but is not deleted, leaving dead code.
  - **Mitigation**: Tasks include a step to check for any remaining import sites; if none, delete the component and its CSS. If any non-obvious import remains (e.g. story/test fixture), leave the file in and flag it as a follow-up task explicitly.

- **Trade-off**: Two visual idioms for view-mode (existing icon segmented control, vs. the new label + text radio buttons inside Settings). After this change only the text-radio version is reachable, so it's a temporary inconsistency only as long as `ViewToggle.tsx` lingers in the tree.
