## Context

The `explorer` SPA today (`web/src/`) renders a serviceable but visually plain interface: a top header with logo + 3-way theme toggle, a separate breadcrumb row, a sidebar tree at `≥768px`, and a single `<table>`-based folder listing or a basic file viewer (markdown / text / image). The whole page scrolls.

A design hand-off from Claude Design (`Explorer-handoff.zip`, unpacked at `/tmp/explorer-handoff/explorer/`) ships a complete prototype: `Explorer.html` + `app.jsx` + `viewers.jsx` + `styles.css`. The README is explicit that the prototype is a *visual reference*, not code to copy verbatim ("recreate them pixel-perfectly in whatever technology makes sense for the target codebase").

We adopt the prototype's layout, palette, type, spacing, and the new client-side interactions (search, list/grid, sort, density, copy-link toast, keyboard shortcuts, mobile drawer). We do **not** adopt the prototype's hand-rolled markdown parser (security regression), its crude code highlighter, its mock-data-only viewers (JSON/CSV/code/PDF/audio/video/binary card — these need server changes), its "Tweaks" panel (design-tool chrome), its mobile-preview toggle, or its CDN-loaded React + Babel-standalone runtime.

## Goals / Non-Goals

**Goals:**

- Match the prototype's visual output: oklch palette, `#c9602b` accent, 8/12 px radii, density-driven row heights, 11 px uppercase column labels, sticky folder header.
- Restructure the SPA shell: brand into the sidebar; a single main toolbar containing breadcrumbs + search + view toggle + settings menu; viewport-locked grid with internal scroll regions; mobile drawer + scrim.
- Add client-side capabilities that need no API changes: search (filter current folder), list/grid view, sortable columns, density toggle, copy-link toast, keyboard shortcuts.
- Restyle the file detail header (back / icon+name / meta / copy-link / download) and the markdown body — without touching the renderer pipeline.
- Preserve every server contract, the resolver/security boundary, and the existing renderer sanitization.

**Non-Goals:**

- New file viewers (JSON, CSV, code-with-gutter, PDF, audio, video, binary card). Each needs an `internal/server/mime` extension-table addition, a `fileKind` change, and a rethink of the `inlineSizeCap` (5 MiB) and the `not_utf8` UX. Will be its own change.
- A user-customizable accent. Pinned to `#c9602b`.
- A "Tweaks" panel. The few real settings (theme, density, view) live in a small popover from the toolbar (and the existing top-bar theme toggle on mobile).
- Replacing `react-markdown` / `rehype-sanitize`.
- Server / Go changes of any kind. No edits under `cmd/` or `internal/`.

## Decisions

### D1. Viewport-locked layout (`height:100vh; overflow:hidden`) over page-scroll

The prototype's `.app { display: grid; grid-template-rows: 100vh; height: 100vh; overflow: hidden }` shell with internally scrolling `.sidebar-tree` and `.content` is the modern file-browser idiom (Finder, VS Code, Notion). It keeps the toolbar pinned, gives the sidebar its own scroll, and matches user expectation for an "explorer" app. Behavioural change for long markdown documents (they now scroll inside `.content` instead of the page). Acceptable given the application shape.

*Alternative considered:* keep page-scroll with `position: sticky` toolbar. Rejected — it makes the sidebar awkward (either it doesn't scroll independently, or it gets `position: sticky; height: calc(100vh - …)` which is fiddly), and the design's tile grid + toast + future viewers all assume a fixed viewport.

### D2. Breakpoint at 800 px (was 768 px)

The prototype uses `@media (max-width: 800px)`. We could keep `768px` for continuity, but the design's mobile-only adaptations (column hiding, button collapsing, drawer) were authored against `800px`. Aligning avoids the awkward 769–800 px window where layout would be desktop-shaped but cramped. Cost: trivial behavioural change for users sized in that 32 px band.

*Alternative considered:* keep 768. Rejected — picks up that awkward band and forces us to re-derive every responsive value.

### D3. Pin accent to `#c9602b`; no per-user customization

The prototype's "Tweaks" panel exposes accent as a colour picker — that's a design-tool feature for previewing tints, not a product feature. Real user value of a customizable accent is near zero; the cost is brand inconsistency in screenshots, docs, and embedded use. Lock to the design value.

*Alternative considered:* expose `--accent` in the settings popover. Rejected as scope creep with low payoff.

### D4. Drop the "Tweaks" panel; ship a tiny settings popover instead

Real persisted settings: theme (3-way), density (3-way). View (list/grid) lives in the toolbar's segmented control because it's a per-page concern, not a global preference, even though we persist it. Implement the popover as a small menu anchored to a toolbar icon button — no new dependency, just CSS + a click-outside hook.

*Alternative considered:* port the prototype's "Tweaks" panel verbatim. Rejected — README explicitly tells us not to copy the prototype's structure, and the panel exposes mobile-preview / accent / view toggles that don't belong in a real product.

### D5. Keep three-way theme (light / dark / system); add density alongside

The existing spec already requires light/dark/**system**. The design omits `system` because the prototype author didn't think about it. Removing it would silently regress users whose OS theme drives their preference. Keep three-way; persist density next to it under a sibling localStorage key.

Storage shape: `localStorage["explorer.theme"]` (`light` | `dark` | `system`, existing) and a new `localStorage["explorer.density"]` (`compact` | `regular` | `comfy`, default `regular`). View persisted as `localStorage["explorer.view"]` (`list` | `grid`, default `list`).

*Alternative considered:* nest into a single JSON setting. Rejected — three independent flags, each cheap to read independently before mount.

### D6. Apply density to `<html>` before React mounts (same path as theme)

Density drives `--row-h` and `--content-pad` via a `[data-density="..."]` attribute. To avoid a flash of the wrong row height, apply it via the same inline `<script>` in `web/index.html` that already applies the persisted theme.

### D7. Keep `react-markdown` + `rehype-sanitize` + relative-link rewrite

The prototype's hand-rolled markdown parser is a regression on every axis: no GFM tables/task-lists, no sanitization, no relative-link rewrite (which is security-relevant — `<img>`/`<a>` rewriting in `MarkdownRenderer.tsx` keeps users from being redirected outside the served root or to attacker-controlled hosts). We restyle `MarkdownRenderer.css` to match design values (max-width 760 px, padding 40/48 px, font-size 15 px, heading scale, accent-bordered blockquote, design code styling) and leave the renderer pipeline alone.

### D8. Grid view image thumbnails via `/raw/<path>`

The current `/raw/` endpoint streams bytes with a correct `Content-Type` and no `Content-Disposition`, so an `<img src="/raw/foo.png">` in a tile works today. No new endpoint, no thumbnail generation server-side. Cost: full-resolution images load for tiles. Acceptable for v1 — folder listings of mostly-image folders are rare in this product, and `loading="lazy"` keeps it tolerable. If it becomes a problem, a `?thumb=` query is a localized future change.

*Alternative considered:* generate thumbnails server-side. Rejected — adds an image-decoding dep (or `image/jpeg` + `image/png` + `image/gif` + `image/webp` fan-out), bloats the binary, and we have no users yet who'd benefit.

### D9. `useLocalStorageSetting<T>` hook

Add a single hook to encapsulate read-on-mount + write-on-change for the `view` and `density` settings. Wraps `useState` + `useEffect`. Keeps `useTheme.ts` shape unchanged (it has bespoke `prefers-color-scheme` reactivity).

### D10. Search is current-folder-only, client-side, instant

Filters `entries` returned by `/api/tree` by case-insensitive substring on `name`. No debounce — list size is bounded by one folder. No deep search (would need a new API). The toolbar search disappears when viewing a file; pressing `/` from a file viewer is a no-op.

### D11. Sort state is per-folder-view session-only

Sort column / direction live in component state on `FolderListing`, reset to `name asc` on path change. Persisting per-folder sort is over-engineered for the value.

### D12. Copy-link uses `navigator.clipboard.writeText(window.location.href)`

Toast component reads from a single `useState<string|null>`-style hook with auto-dismiss after 1800 ms. Position: fixed, bottom-centre, animated in.

### D13. Keyboard shortcuts: `/`, `Esc`, `Backspace`

Implemented as a single window-level `keydown` listener in the layout. Skips when `target.tagName` is `INPUT`/`TEXTAREA` or `isContentEditable`. `/` focuses the search box (no-op if not on a folder view). `Esc` clears search, else navigates from file → folder. `Backspace` (when not in a field, not on a file) navigates up; uses `preventDefault()` to suppress browser back-nav.

### D14. Folder header is sticky inside `.content`, not the whole page

`.folder-head { position: sticky; top: 0; background: var(--bg) }` works because `.content` is the scroll container in the new locked-viewport layout. Without D1, this would not work cleanly.

## Risks / Trade-offs

- **Page-scroll → internal-scroll behavioural change** → users who page-scroll long markdown documents will notice. Mitigation: locked viewport is the right idiom; covered in D1; no spec-level wording mandates page-scroll today.
- **800 px breakpoint shift from 768 px** → a 32 px band of viewport widths will see a different layout than before. Mitigation: trivial in practice; covered in D2.
- **`oklch()` colour functions** → require Safari 15.4+ / Chrome 111+ / Firefox 113+. Mitigation: all shipped 2022–2023, well within the project's modern-browser target. No fallback needed.
- **Grid view loads full-resolution images for tiles** → potential network cost on image-heavy folders. Mitigation: `loading="lazy"`; D8 documents the future `?thumb=` escape hatch.
- **`Backspace` shortcut clashes with browser back-nav** → mitigated by `e.preventDefault()` and the field-focus guard; only active when not in an input.
- **Toolbar real estate on narrow desktops** → breadcrumbs + search + view-toggle + settings can crowd at ~900 px. Mitigation: search shrinks via `min-width:0`; breadcrumb segments truncate via `text-overflow: ellipsis` on overlong names; settings + view-toggle are fixed-width icon controls.
- **Settings popover click-outside / Esc dismiss** → standard custom-element pitfall. Mitigation: handled by a small focus-trap-free `useClickOutside` ref hook + `Esc` key handler local to the popover.

## Migration Plan

No data migration; no server change. Rollout is a single SPA build replacing the previous one.

- Existing `localStorage["explorer.theme"]` values continue to work (same keys, same values).
- New keys (`explorer.density`, `explorer.view`) read with sensible defaults when absent (`regular`, `list`).
- No deprecation notices; no behavioural changes that should break bookmarks, deep links, or the API surface.

Rollback: revert the SPA build (the Go binary is unchanged; bisect the SPA commit that introduced the refresh).

## Open Questions

None blocking implementation. Followups (not part of this change):

- Should the deferred "new viewers" change include thumbnail generation server-side, or stay client-side via `/raw/`?
- Is there appetite for a deep-search API (`/api/search?q=…`) once the per-folder filter establishes the UX pattern?
