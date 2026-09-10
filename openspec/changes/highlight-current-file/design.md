## Context

The desktop tree sidebar (`web/src/components/TreeSidebar.tsx`) renders lazily: `TreeSidebar` fetches the root level once on mount, and each `DirNode` holds its own `open`/`children`/`loadStarted` local state, collapsed by default, fetching its level only when the user clicks its chevron. Every node already computes an `isActive` flag from `useLocation()` and applies the `is-active` CSS treatment (`TreeSidebar.css`), but for a deep link the ancestor folders are collapsed and never fetched, so the active leaf is never in the DOM and the highlight can never fire.

The active path is re-derived independently in three places — `ViewPage.tsx`, the `currentPath` helper in `Layout.tsx`, and the breadcrumb in `Toolbar.tsx` — with no single value the tree consumes. `web/src/components/LayoutSidebar.tsx` mounts `<TreeSidebar/>` with no path input. See proposal.md (Why) for motivation; the requirements are in `specs/web-ui/spec.md`.

## Goals / Non-Goals

**Goals:**
- The tree learns the active path and auto-expands its ancestor chain, loading each ancestor level so the active entry's row is rendered.
- The active entry is highlighted (existing `is-active` treatment) and scrolled into view within the sidebar tree container.
- Reactivity: navigating to a different deep link re-expands the new chain within a session **without** collapsing folders the user manually expanded; a deep link overrides a prior manual collapse of an ancestor.
- Mobile (< 800 px): same auto-expansion, but the drawer is not opened.
- Preserve the GitHub-style chevron-vs-name affordances unchanged.

**Non-Goals:**
- No server / API / spec-shape change; `/api/tree` is called the same way (one level per request), just path-driven.
- No persistence of the expanded set to `localStorage` — session-only reactive store.
- No change to breadcrumb, folder-listing, or file-viewer chrome.
- No change to the tree's data model on the wire (`TreeEntry` gains nothing).

## Decisions

**D1 — Feed the active path into the tree via a prop, not a new context.**
The active path is threaded from `Layout` (which already computes it via the `currentPath` helper) through `LayoutSidebar` into `TreeSidebar`. A shared context was considered but rejected: the tree only needs to *consume* the path, never push state upward, so a prop is the minimal, idiomatic choice. The reactive store lives inside the tree.

**D2 — Reactive expanded/loaded store (chosen) over a local cascade.**
Expansion and child-loading move from per-`DirNode` local state into a tree-level store: `expanded: Set<string>` (folder paths that are open) and `loadedChildren: Map<string, TreeEntry[]>` (levels already fetched, key = folder path; the root level is key `''`). A `DirNode` derives its open state and children from these instead of owning them.

An effect keyed on the active path runs auto-reveal: it derives the ancestor prefixes of the active path (`report` → `["notes", "notes/2026"]`, plus the leaf as the final target), adds each prefix to `expanded`, and ensures each prefix's level is present in `loadedChildren` (fetching any missing level via `/api/tree`). Because the full active path is known from the URL, the entire ancestor chain fetches in one effect **without ordering dependencies between parent and child responses** — a level's listing is requested as soon as its prefix is identified, not after its parent resolves.

Reactivity across navigation is a consequence of the store being keyed by path, not the active path: navigating to a new path runs the effect, adds the new ancestors to `expanded`/`loadedChildren`, and the map/set retain any manually opened folders — only adds, never removes. This is what "preserve manual expansion" and "re-expand a collapsed ancestor" reduce to. The local-cascade alternative (initialize each `DirNode`'s `open` from an ancestor prefix set) handles the fresh-load case but cannot re-mount a not-mounted ancestor on a *different* navigation, so it was rejected.

**D3 — Scroll the active leaf into view after render.**
After the active entry's row is rendered (post-effect, in a `useLayoutEffect`/ref), scroll it into view within the `.sidebar-tree` container. A `ref` is attached to the active row; scrolling is scoped to the tree container so the main pane does not move. `scroll-into-view-if-needed` behavior (only scroll when off-screen) is preferred over forcing the top, to avoid jarring jumps when the active entry is already visible.

**D4 — Mobile drawer is not auto-opened.**
The auto-reveal effect runs unconditionally so the tree is ready, but the mobile drawer open state (`sidebarOpen` in `Layout`) is not touched on navigation. On < 800 px the reveal is inert until the user opens the drawer.

**D5 — `is-active` and chevron affordances are untouched.**
The highlight reuses the existing `is-active` treatment; highlight of the leaf is gated on D2 making the leaf present in the DOM. Chevron toggles a folder's membership in `expanded` (adds/removes one entry) without navigating and without affecting other paths.

## Risks / Trade-offs

- [Refetching levels on navigation that are still mounted] → `loadedChildren` is keyed by folder path and retained across navigations, so a level already fetched is not re-requested; the effect fetches only missing prefixes.
- [Scrolling into view fighting user scroll] → use scroll-into-view-if-needed (scroll only when the active row is not already in view) rather than forcing it to the top.
- [A deep link to a path the tree can no longer resolve, e.g. a renamed/moved file in a new session] → the auto-reveal fetches ancestors and renders whatever the server returns; if a prefix 404s the tree renders what it can and simply cannot highlight the leaf — no crash, matches today's lazy-load tolerance. No special handling required.
- [Expanded set grows unbounded over a long session] → session-only; reset on full page reload. Acceptable for a read-only browser; no cap needed.

## Migration Plan

SPA-only, no data or API migration. Implementation order:
1. Thread `activePath` from `Layout` → `LayoutSidebar` → `TreeSidebar`.
2. Introduce the `expanded`/`loadedChildren` store in `TreeSidebar`; convert `DirNode` to read from it (chevron toggles become set adds/removes).
3. Add the active-path auto-reveal effect (derive prefixes, expand + fetch missing levels, scroll active leaf into view).
4. Ensure the mobile drawer is not opened by the effect.
5. Component tests for the scenarios in `specs/web-ui/spec.md`.
6. `make web-commit` to rebuild and commit the embedded bundle.
7. Regenerate `docs/desktop.gif` and `docs/mobile.gif` (record-demo-gif skill) in the same change.

Rollback is a single-component revert; no persisted state or schema to unwind.

## Open Questions

- Whether to also persist the *manual* (non-auto) expanded set to `localStorage` for session-to-session continuity. Deferred: out of scope now; the spec says session-only. Does not affect the approach or tasks if deferred.
