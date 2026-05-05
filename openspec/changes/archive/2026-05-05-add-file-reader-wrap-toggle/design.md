## Context

Standalone code/text files are rendered by `web/src/components/FileViewer.tsx` → `web/src/components/CodeBlock.tsx`. The `<pre class="code-block">` styles in `web/src/components/FileViewer.css` hard-code wrapping (`white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere`) so long code lines fold to fit the viewport. This is friendly on mobile but destroys column alignment for source code. There is no setting today to opt out.

The `FileViewer` header (`.file-head`) already has a constrained right-side action area (`.file-head-actions`) holding **Copy link** (`.icon-btn`, 32×32) and **Download** (`.btn` with a `.btn-label` that is hidden by `@media (max-width: 800px)`). That media-query pattern is the proven way to compact actions on mobile in this codebase. Theme persistence already uses `localStorage["explorer.theme"]`; the same shape is the natural home for a wrap preference.

## Goals / Non-Goals

**Goals:**
- Let the reader switch between wrapped and horizontally-scrolling code views in standalone text files.
- Keep wrap **on** by default so today's mobile experience is unchanged for users who don't touch the toggle.
- Persist the choice across reloads and across files (one setting, like the theme).
- On viewports `< 800px`, the toggle takes no more horizontal space than an existing `.icon-btn` (32×32) — no text label.
- Visually identical footprint to the existing Copy-link `.icon-btn` so the toolbar layout is unchanged.

**Non-Goals:**
- Markdown fenced code blocks: out of scope. They keep their current wrapping. (`MarkdownRenderer` is not modified.)
- Server / API changes. This is SPA-only.
- Per-file overrides or URL-encoded state.
- A visible setting outside the file viewer (e.g. a global preferences panel).

## Decisions

### 1. Toggle lives in `FileViewer`'s header, conditionally rendered

The wrap toggle is a new `.icon-btn` placed in `.file-head-actions`, rendered only when `meta.kind === 'text'`. Markdown and image views never see it. Rationale: the toggle is a property of the code view, so co-locating it with the rest of the file actions keeps the contract obvious and avoids a separate toolbar component. State lives in `FileViewer` and is passed to `CodeBlock` as a `wrap: boolean` prop.

Alternatives considered:
- **Global toolbar at the app shell.** Rejected — the toggle has no meaning outside text files; it would look broken when viewing markdown/images/folders.
- **Inside `CodeBlock` itself.** Rejected — `CodeBlock` is a leaf renderer, also used by markdown via `rehype-highlight` integration in the future; pushing UI chrome into it would muddy that boundary.

### 2. State persists in `localStorage["explorer.wrap"]`

Mirrors the existing `explorer.theme` convention. Values: `"on"` | `"off"`; missing key → default `"on"`. A small `useWrap()` hook in `web/src/hooks/useWrap.ts` is built on the project's `useLocalStorageSetting` primitive (the same one `useDensity` and `useViewMode` already use), so subscription/notification semantics are reused rather than reimplemented. No flash-of-wrong-state mitigation is needed because, unlike the theme (which paints the page background), wrap state only affects line-folding inside an already-rendered block.

Alternatives considered:
- **`useState` only (no persist).** Rejected — the user explicitly asked for the setting and would have to re-toggle on every navigation; defeats the purpose.
- **URL query param `?wrap=0`.** Rejected — pollutes shareable deep links (a copied URL would carry the linker's preference) and the user explicitly chose localStorage.

### 3. Wrap-off is plain `white-space: pre` + horizontal scroll on the `<pre>`

Two CSS classes on `.code-block`: `.wrap-on` (current behavior) and `.wrap-off` (`white-space: pre; overflow-x: auto; word-break: normal; overflow-wrap: normal`). Toggling adds/removes the class on the `<pre>`. The viewer container already uses `overflow-x: hidden` to keep horizontal scroll constrained to the code block, not the page — that stays. Rationale: simplest possible CSS swap, no JS measurement, and lets the browser's native scrollbar do the work.

Alternatives considered:
- **CSS variable instead of class.** Rejected — `white-space` and `word-break` aren't a single variable, and class-based styling reads better in devtools.

### 4. Mobile compactness: icon-only at `< 800px`, label optional above

Reuse the existing `@media (max-width: 800px)` block in `FileViewer.css` to hide a `.btn-label` span if we choose to render one for desktop. Simpler approach: render an `.icon-btn` (32×32) at all sizes — same footprint as Copy link — with `aria-pressed` reflecting the current state. This guarantees mobile parity with existing actions without any label-hiding logic. Tooltip (`title`) and `aria-label` carry the descriptive text ("Wrap lines: on/off").

Alternatives considered:
- **Segmented control (Wrap | No wrap).** Rejected — wider on mobile than current actions; conflicts with the explicit "don't take a lot of space on mobile" requirement.
- **Toggle switch (`role="switch"`).** Equivalent semantically to `aria-pressed`, but draws a sliding thumb that's wider than 32px. Rejected for footprint.

### 5. Icon

Add a single `WrapIcon` to `web/src/components/icons.tsx` (a "return arrow into a wall" glyph is conventional for word-wrap; e.g., the Unicode ↵ inside a vertical bar). The icon is the same regardless of state; pressed state is communicated via `aria-pressed` and a tinted background using existing `.icon-btn[aria-pressed="true"]` styling — if that selector doesn't exist yet, add a small rule that uses `var(--bg-soft)` / `var(--accent)` so it matches the theme system.

Alternatives considered:
- **Two icons (wrap-on / wrap-off).** Adds visual noise and a second SVG; the pressed-state pattern is enough.

## Risks / Trade-offs

- **Risk:** Long single-token strings (e.g., a 4 KB minified JS line) under wrap-off produce a very wide horizontal scroll, which can feel awkward on mobile.
  → **Mitigation:** Wrap-on is the default; users only land in the wide-scroll state by deliberately toggling. Acceptable given the explicit ask.
- **Risk:** `localStorage` writes from inside `useEffect` could race the first render and cause SSR/hydration warnings — but this app is purely CSR, so this is a non-issue. No mitigation needed.
- **Risk:** Adding `aria-pressed` styling globally could conflict with future toggle buttons.
  → **Mitigation:** Scope the pressed-state CSS to `.icon-btn[aria-pressed="true"]` (already a button-shaped class), not a new selector.
- **Trade-off:** Markdown code blocks behave differently from standalone text files (markdown wraps; standalone honors the toggle). Documented as a non-goal; can be revisited if user feedback asks for parity.
- **Embed step:** Forgetting to commit `internal/server/ui/dist/` after `make web` would ship a binary without the toggle via `go install`. The repo's `dist/` rule in `.gitignore` previously matched `internal/server/ui/dist/` accidentally (the rule is intended only for the release-archive directory at the repo root); this change anchors the rule to `/dist/` so `make web-commit`'s `git add internal/server/ui/dist` works correctly.
