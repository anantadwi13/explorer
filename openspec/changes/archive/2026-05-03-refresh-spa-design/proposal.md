## Why

The current SPA is a serviceable but bare GitHub-flavoured listing: a single header row, a separate breadcrumb row, a plain HTML table, and a basic file viewer. A design hand-off (`Explorer-handoff.zip` from Claude Design) provides a coherent, opinionated visual system and a stronger interaction model — toolbar-integrated breadcrumbs, in-folder search, list/grid views, sortable columns, density controls, restyled file detail chrome, and a mobile drawer. Adopting it gives the product an identity and brings interactions in line with what users expect from a modern file browser.

## What Changes

- **Layout shell rebuilt**: brand moves into the sidebar; breadcrumbs move into a single main toolbar alongside search, view toggle, and a settings menu; the app uses a viewport-locked grid (`height:100vh; overflow:hidden`) with internally scrolling regions instead of page-scroll.
- **New visual system**: oklch warm-grey palette, fixed accent `#c9602b` (orange), 8/12 px radii, density-driven row heights via CSS variables (`--row-h`, `--content-pad`), 11 px uppercase column labels, sticky folder header.
- **New folder interactions** (all client-side, no API change):
  - In-folder **search** input that filters the current listing's children.
  - **List ↔ grid** view toggle, persisted in `localStorage`. Grid uses image thumbnails sourced from the existing `/raw/<path>` endpoint for image kinds and an icon tile otherwise.
  - **Sortable column headers** (name / modified / size) with toggleable direction.
  - **Density** toggle (compact / regular / comfy), persisted in `localStorage`.
- **File detail header restyled**: back button, kind-icon + name, meta line (mime · size · modified), copy-link icon (writes the current URL to the clipboard, shows a toast), download button (existing `/raw/` link).
- **Toast component** for transient confirmations (initial use: "Link copied").
- **Keyboard shortcuts**: `/` focuses search; `Escape` clears search or returns from a file to its folder; `Backspace` (when no field focused and not viewing a file) navigates to the parent folder.
- **Mobile (<800 px)**: hamburger button opens the sidebar as a drawer with a scrim overlay; a top bar shows the brand and a theme toggle; the modified column is hidden in list view; the search input becomes full-width; download / copy-link buttons collapse to icon-only.
- **Markdown styling** updated to match the design (`max-width: 760px`, `padding: 40px 48px`, `font-size: 15px`, design heading scale, accent-bordered blockquote, redesigned code blocks). The renderer itself (`react-markdown` + `rehype-sanitize` + the relative-link rewrite plugin) is preserved unchanged because it is a security-relevant component.
- **Theme toggle** retained as three-way (light / dark / system) — the design omits "system" but losing it would be a regression on the existing capability.
- **Empty state** restyled with a large monospace `∅` glyph plus title + hint.

Out of scope (deferred to a follow-up change):

- New file viewers from the design (JSON, CSV, code-with-gutter, PDF, audio, video, binary card). These require server changes to `internal/server/mime` and `internal/server/api.go` (extension table, `fileKind`, the `inlineSizeCap` and `not_utf8` UX) — different blast radius from a CSS/SPA refresh.
- The prototype's "Tweaks" panel and mobile-preview toggle (design-tool chrome, not product surface).
- User-customizable accent colour — pinned to `#c9602b`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `directory-browser`: requirement-level changes to the SPA presentation and interaction surface. Existing requirements modified:
  - **SPA folder URL renders folder listing** — adds search filter, list/grid view modes, sortable columns.
  - **SPA file URL renders file viewer** — adds the new detail header (back / icon+name / meta / copy-link / download) and the link-copied toast.
  - **SPA layout adapts to viewport** — restated for the new shell (sidebar + single toolbar; viewport-locked; mobile drawer + scrim; breakpoint changed from `md` (768 px) to 800 px to align with the design's responsive cutover).
  - **Theme handling** — extended with a `density` setting (compact / regular / comfy) persisted alongside the theme choice.
  - **Markdown rendering** — visual-only updates to body width, padding, type scale, and code/blockquote styling. The sanitization and relative-link rewrite contracts are unchanged.

No requirement removals. No changes to API shapes, the path-traversal contract, the typed error responses, the `inlineSizeCap` (5 MiB), the SPA URL convention (`/view/<path>` vs `/view/<path>/`), or CLI invocation.

## Impact

- **Affected SPA code** (`web/src/`): `Layout.{tsx,css}`, `Breadcrumbs.{tsx,css}`, `TreeSidebar.{tsx,css}`, `FolderListing.{tsx,css}`, `FileViewer.{tsx,css}`, `MarkdownRenderer.css`, `index.css`, `hooks/useTheme.ts`, `pages/ViewPage.tsx`. New component files for `Toolbar`, `SearchBox`, `SettingsMenu`, `Toast`, plus a `useLocalStorageSetting` hook (or equivalent) for the persisted view/density toggles.
- **Affected SPA dependencies**: none added; no removal of `react-markdown`, `rehype-sanitize`, `react-router-dom`.
- **Server / Go**: no changes. All endpoints, the resolver, mime detection, and the embed wrapper are untouched.
- **Spec**: delta against `openspec/specs/directory-browser/spec.md` only (no new capability files).
- **Build**: no changes to `make build`, the Vite config, or the embed step.
- **Behavioural**: page-scroll → internal-scroll is a visible change for users who scroll long markdown documents; modern file-browser idiom and accepted as part of the design.
- **Browser support**: relies on `oklch()` colours (Safari 15.4+, Chrome 111+, Firefox 113+ — all shipped 2022–2023, well within the project's implicit modern-browser target).
