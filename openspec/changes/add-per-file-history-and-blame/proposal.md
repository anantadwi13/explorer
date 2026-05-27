## Why

The file viewer is the surface users land on most often, and it currently has no git context. To answer "who wrote this line?" or "when did this last change?" today, a user has to leave the file viewer, navigate to `/git/commits`, scroll until they find a commit that mentions the file, and open it. Both questions have well-established UX patterns (GitHub's last-commit strip, blame view) that this project deliberately deferred when the git-reader capability landed — "Blame" is currently called out as a non-goal, and the commit-history endpoint accepts a ref but not a path filter.

The cost of that gap is highest on mobile, which is the primary form factor for this tool: switching surfaces costs an extra round-trip and a lost scroll position every time. Adding the affordances directly to the file viewer collapses three navigations into zero.

## What Changes

- **`/api/git/commits` gains a `path` query parameter** that filters commits to those touching a single repo-relative file. Pagination semantics are unchanged. Untracked / unborn files return an empty list (no new error kind).
- **`/api/git/blame` is a new endpoint** returning per-line blame for a single file as chunks of consecutive same-commit lines. For files modified in the working tree, the response is computed against the working-tree content: lines unchanged from HEAD are attributed to their HEAD blame commit; lines that differ are marked `uncommitted: true`. Enforces the same 5 MB cap as the inline preview, with a ~10 s context deadline mapping to a new `blame_timeout` typed error.
- **File viewer gains a last-commit strip** rendered between the file head and the content area whenever `/api/git/info` reports `is_repo: true`. Three visual states derived from the already-fetched `/api/git/status` and a tiny `/api/git/commits?path=<file>&limit=1` lookup:
  - clean tracked — `short_sha · subject · author · relative time` + "History" button
  - modified locally — same payload plus a `[● Modified locally]` pill
  - untracked — no fetch, renders `[● Untracked] · No commits yet`
- **File viewer gains Code | Blame tabs** for `kind === 'text'` files only. Tab selection is deep-linkable via `?view=blame`. Blame view re-uses the shared `lowlight` instance + `extToLanguage` for per-line syntax highlighting (same approximation already used by the diff renderer) and the shared `useWrap` preference. Layout is responsive: chunk metadata is a left column at `≥768px` and stacks above its lines on mobile.
- **`/git/commits?path=<file>` is treated as a path-filtered list view.** The page renders a sticky banner naming the filter with a `[× clear]` affordance. When the file is dirty or untracked the same status pill from the strip appears as a single info row above the (possibly empty) commit list.
- **Two non-goals are lifted.** The `git-reader` spec's "Non-goals declared" requirement explicitly listed `Blame` and `Log search (searching commit messages, content, or paths)`. The `path` filter and the blame endpoint both fall inside that boundary. The delta narrows "Log search" to keep message and content search as non-goals, and removes the `Blame` bullet outright.
- Regenerate `docs/desktop.gif` and `docs/mobile.gif` in the same change (visible UI change; CLAUDE.md requires GIFs stay in sync).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `git-reader`: extends the commit-history endpoint with a `path` filter; adds the blame endpoint, the file-viewer last-commit strip, the Code/Blame tabs and blame view, the commits-list path-filter banner; modifies the typed-errors requirement to add `blame_timeout`; modifies the non-goals requirement to lift `Blame` and narrow `Log search`.

## Impact

- **Go server** — `internal/server/git/commits.go` gains `path` filtering on the existing log walk. `internal/server/git/blame.go` is new (or `blame.go` next to `commits.go`); it wraps go-git's blame and, for dirty files, runs the existing diff machinery in `patch.go` to produce a working-tree-aligned chunk list. `internal/server/errors.go` adds the `blame_timeout` kind. The HTTP handler wires `/api/git/blame` into the existing `/api/git/*` mux.
- **SPA** — `web/src/components/FileViewer.tsx` reads from a lifted status context, renders the strip, renders the tabs, and routes blame rendering to a new `web/src/git/BlameView.tsx`. `web/src/api/client.ts` and `web/src/api/types.ts` gain `commits({ path })` and `blame(path, ref?)` plus the corresponding response types and the `blame_timeout` `ApiError` variant. `web/src/pages/CommitsListPage.tsx` (or its file equivalent) reads `?path=` and renders the filter banner. New CSS lives next to the new components; chrome uses the documented SPA design tokens per the existing requirement.
- **Tests** — Go: `commits_test.go` adds `path=` cases (filter touches, rename boundary, empty result); new `blame_test.go` covers clean / dirty (overlay) / untracked / merge-commit-first-parent / size-cap / timeout. TS: `FileViewer.test.tsx` adds strip-state cases; new `BlameView.test.tsx` covers chunk grouping, uncommitted treatment, untracked empty-state, deep-link round-trip, wrap toggle, mobile layout class application.
- **APIs** — `/api/git/commits` accepts a new optional `path`. `/api/git/blame` is new. `/raw/` and other endpoints unchanged. The `git-reader` `path` semantics rule (path-resolver bypass, go-git pathspec rejection) applies unchanged to both new surfaces.
- **Dependencies** — none added; reuse `go-git`.
- **Docs / assets** — regenerate `docs/desktop.gif` and `docs/mobile.gif` via the `record-demo-gif` skill.
- **Performance** — `path=` filtering streams commits and inspects parent diffs as it walks, bounded by the existing `limit` clamp (≤100); same cost class as the unfiltered walk on small histories, more I/O on deep histories — acceptable for v1. Blame is the bigger watch-item: capped at 5 MB and ~10 s, with the timeout error surfacing instead of hanging the request.
- **Security** — no new file paths reach the path-resolver. Both `path=` on commits and `path=` on blame are repo-relative git pathspecs (same rule the patch endpoint already follows), so escape attempts collapse to `not_found`.
- **Accessibility** — strip uses semantic structure (`<dl>`-shaped metadata or a labelled row), tabs follow ARIA tab-pattern (`role="tablist"`, `aria-selected`, arrow-key navigation), blame view's chunk metadata is `aria-describedby` for the corresponding line range.
