## 1. Thread the active path into the tree

- [x] 1.1 Derive `activePath` in `Layout` from the existing `currentPath` helper (`Layout.tsx:231`) and pass it through `LayoutSidebar` into `TreeSidebar` as a prop; verify with a rendered assertion that `TreeSidebar` receives the active path (component test).
- [x] 1.2 Define the tree-level store shape in `TreeSidebar` — `expanded: Set<string>` (open folder paths) and `loadedChildren: Map<string, TreeEntry[]>` (fetched levels keyed by folder path, root = `''`) — and have `DirNode` read its open state and children from it instead of local `useState`; verify chevron toggle and lazy-load still work (existing GitHub-style scenarios in `specs/web-ui/spec.md` "Desktop tree behaves GitHub-style").

## 2. Auto-reveal the active path

- [x] 2.1 Add an effect keyed on `activePath` that derives the ancestor prefixes of the active path (folder chain, plus the leaf target) and adds each prefix to `expanded`, fetching any prefix missing from `loadedChildren` via `/api/tree`; verify a deep link `/view/notes/2026/report.md` expands `notes` and `notes/2026` and renders the `report.md` row (scenario "Deep link reveals the file").
- [x] 2.2 Highlight the active leaf with the existing `is-active` treatment, gated on the leaf being rendered; verify the active row carries `is-active` for both a file and a trailing-slash folder (scenarios "Deep link reveals the file" and "Deep link reveals the folder").
- [x] 2.3 Scroll the active leaf into view within the `.sidebar-tree` container only when it is off-screen (scroll-into-view-if-needed, scoped to the tree container so the main pane does not move); verify the active row ends up inside the container's visible viewport in a test that places it off the initial scroll position.

## 3. Reactivity across navigation

- [x] 3.1 Ensure the reveal effect only *adds* to `expanded`/`loadedChildren` and never removes, so navigating between deep files keeps manually expanded folders open (scenario "Navigate between deep files preserves manual expansion").
- [x] 3.2 Ensure a new deep link re-expands an ancestor that was previously collapsed (scenario "Navigation re-expands a previously collapsed ancestor"), verifying a level already fetched is not re-requested.
- [x] 3.3 Ensure a chevron collapse of an auto-expanded ancestor still toggles inline without navigating and keeps the active leaf highlighted (scenario "Auto-expand does not disturb chevron behavior").

## 4. Mobile and integration

- [x] 4.1 Confirm the reveal effect runs but does not set `sidebarOpen` in `Layout`, so the mobile drawer stays closed on a deep link at < 800 px (scenario "Mobile reveals without opening the drawer").
- [x] 4.2 Run the full SPA component test suite (`cd web && npm run test` or the repo's equivalent) and confirm all scenarios in `specs/web-ui/spec.md` "Tree highlights the active path" pass.

## 5. Embed, verify, and refresh demo GIFs

- [x] 5.1 Rebuild the embedded SPA bundle with `make web-commit` (or `make web` + `git add internal/server/ui/dist`) so `internal/server/ui/dist/` is in sync; verify the binary's embedded bundle contains the build.
- [ ] 5.2 Regenerate `docs/desktop.gif` and `docs/mobile.gif` showing the deep-link reveal (record-demo-gif skill) and confirm both GIFs render the auto-expanded, highlighted tree.
- [x] 5.3 Manual end-to-end check: open `make run` against `./testdata`, open a deep `/view/<nested file>` link in a fresh tab, and confirm the tree auto-expands, highlights, and scrolls to the file on both desktop and mobile widths.
  Verified via headless Chromium in a Docker container (`mcr.microsoft.com/playwright:v1.45.0-jammy`, `--network=host`) against the live `:8080` server, using nested repo paths (`/view/web/src/components/TreeSidebar.tsx`, `/view/internal/server/resolver/resolver.go`) since `./testdata` is not deeply nested. 4/4 cases PASS: desktop reveals + highlights + in-viewport; mobile reveals but keeps the drawer closed. Screenshots in `/tmp/opencode/e2e-*.png`.
