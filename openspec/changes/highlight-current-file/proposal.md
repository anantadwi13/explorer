## Why

When a user opens a file — especially via a shared or bookmarked deep link such as `/view/notes/2026/report.md` — the sidebar tree renders from its collapsed default state and gives no indication of where that file lives in the hierarchy. A recipient of a shared link lands on the content with no sense of the path context. The tree is path-unaware: every node derives its own "active" class from the URL, but ancestor folders start collapsed and are never fetched, so the active leaf is never rendered and the `is-active` highlight can never fire for a deep link.

## What Changes

- The sidebar tree SHALL learn the **active path** (the file/folder the current URL points at) and **auto-expand its ancestor folders**, loading each ancestor level on demand so the active file's row is actually rendered.
- The **active leaf** SHALL be visually highlighted (the existing `is-active` treatment) and **scrolled into view** within the sidebar tree container, so a deep link reveals the file at or near the top of the visible panel.
- Auto-expansion SHALL be **reactive** to navigation: moving to a *different* deep link SHALL expand that link's ancestor chain within the same session, **without wiping folders the user has manually collapsed or expanded**. A deep link is treated as an explicit "take me here" signal and SHALL override any prior manual collapse of an ancestor on the new path.
- On viewports below 800 px, the tree SHALL still auto-expand internally, but the mobile drawer SHALL **not** open over the content; expansion is simply ready when the user opens the drawer.
- The desktop/`is-active` chevron-vs-name affordances and the GitHub-style expand/collapse behavior are unchanged; this change adds path-driven reveal on top of them.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `web-ui`: adds a new requirement covering the tree's active-path tracking — auto-expand of ancestor folders, active-leaf highlight, scroll-into-view, reactive re-expansion on navigation that preserves manual collapse/expand state, and the mobile drawer-not-auto-opened behavior.

## Impact

- SPA only. No server, API, or spec-shape changes; the tree still fetches per level via `/api/tree` (now driven by the active path instead of only by user clicks).
- Files touched (implementation, not captured here): `web/src/components/TreeSidebar.tsx` (reactive expand/loaded-children state, active-path effect, scroll-into-view), `web/src/components/LayoutSidebar.tsx` and `web/src/components/Layout.tsx` (thread the active path from the existing `currentPath` helper into the tree), `web/src/components/TreeSidebar.css` (reveal/focus styling if any). Tests alongside the components.
- The embedded SPA bundle (`internal/server/ui/dist/`) must be rebuilt and committed (`make web-commit`) so module-proxy installs ship the behavior.
- The README demo GIFs (`docs/desktop.gif`, `docs/mobile.gif`) must be regenerated in the same change, per the repository's demo-GIF convention.
- No new dependencies.
