## Why

Long lines in standalone text/code files currently always wrap (`white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere`). That's good for prose and narrow viewports, but bad for code where indentation and column alignment carry meaning — users reading source files have no way to switch to a horizontal-scroll view. Adding a wrap toggle gives readers control without sacrificing the mobile-friendly default.

## What Changes

- Add a wrap/no-wrap toggle to the file viewer header, visible whenever a `text` (code) file is being shown. Markdown and image views are unaffected.
- Default to **wrap on** (matches today's behavior). Persist the user's choice in `localStorage["explorer.wrap"]` so it survives reloads and applies across files.
- When wrap is **off**, the standalone code block scrolls horizontally (`white-space: pre`, `overflow-x: auto`) instead of wrapping.
- On viewports `< 800px` (mobile), the toggle SHALL render as an icon-only button matching the existing `.icon-btn` size (32×32) — no text label — to stay consistent with the existing mobile compaction of the Download button. On wider viewports it MAY show a short label.
- Markdown fenced code blocks are out of scope for this change; their wrap behavior is unchanged.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `directory-browser`: adds a new requirement covering the file-reader wrap toggle (visibility, default, persistence, mobile compactness, and wrap-off scroll behavior).

## Impact

- SPA only. No server, API, or spec-shape changes.
- Files touched: `web/src/components/FileViewer.tsx` (toolbar slot + state), `web/src/components/CodeBlock.tsx` (wrap prop), `web/src/components/FileViewer.css` (wrap/no-wrap class), `web/src/components/Layout.css` (`.icon-btn[aria-pressed="true"]` rule), a new `useWrap` hook in `web/src/hooks/` (built on the existing `useLocalStorageSetting` primitive), `web/src/components/icons.tsx` (new `WrapIcon`), plus `useWrap`/`CodeBlock`/`FileViewer` test additions.
- Embedded SPA bundle (`internal/server/ui/dist/`) must be rebuilt and committed (`make web-commit`) so module-proxy installs ship the toggle. The over-broad `dist/` rule in `.gitignore` is also tightened to `/dist/` so the SPA build output is no longer accidentally ignored.
- No new dependencies.
