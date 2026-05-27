## 1. Server: commits-list path filter

- [x] 1.1 In `internal/server/git/commits.go`, extend the commits log walk to accept an optional repo-relative `path`. When set, after computing each commit's first-parent diff (the same source the existing commit-detail endpoint already uses), emit the commit only if the diff touches `path` as either an old or new path. Preserve existing cursor semantics — the cursor still names a commit sha; the next page filters with the same path.
- [x] 1.2 In the HTTP handler for `/api/git/commits`, parse the optional `path` query parameter. Pass it through to the walker. No new validation needed — go-git pathspec rules will reject escapes at lookup time (matches the existing "Path semantics declaration" requirement); a syntactically valid but nonexistent path simply yields zero commits, no error.
- [x] 1.3 Extend `internal/server/git/commits_test.go` with cases: (a) `path=` on a tracked file returns only commits that touched it; (b) `path=` on an untracked path returns an empty list with `next_cursor: null`; (c) `path=` plus `cursor` walks the next page filtered the same way; (d) a commit that renames the file shows up under its `new_path` when `path` matches the new name; (e) `path=` with `..` collapses to empty (path-resolver / pathspec rejection).
- [x] 1.4 Smoke-check `make test ./internal/server/git/...` passes.

## 2. Server: blame endpoint

- [x] 2.1 Add `internal/server/git/blame.go` with a `Blame(repo, path, ref, deadline) (BlameResult, error)` entry point. For an explicit historical `ref` (anything not HEAD or empty), call go-git `Blame(commit, path)` and emit one chunk per run of consecutive same-commit lines.
- [x] 2.2 Add a "dirty" branch in `Blame`: when `ref` is empty/HEAD and the file appears in the worktree status as `staged` or `unstaged`, (a) read HEAD's blob for `path`, (b) read working-tree bytes via `resolver.Resolve` (this is the documented exception where the path-resolver chokepoint *does* apply inside `/api/git/*`), (c) run the existing diff pipeline from `internal/server/git/patch.go` to get a line-level diff, (d) call go-git `Blame(HEAD, path)`, (e) walk the working-tree lines applying the diff — unchanged lines look up HEAD blame by HEAD-line index; inserted/modified lines emit `uncommitted: true`, (f) coalesce consecutive same-commit and consecutive uncommitted runs into chunks. Set `dirty: true` on the result.
- [x] 2.3 Wire `/api/git/blame` into the existing `/api/git/*` mux. Query params: `path` (required), `ref` (optional). Enforce the 5 MB cap on the file size; map oversize to the existing `too_large` typed error.
- [x] 2.4 Add a context deadline of ~10s around the blame computation. On `context.DeadlineExceeded`, return a new `blame_timeout` typed error.
- [x] 2.5 In `internal/server/errors.go`, add the `blame_timeout` kind (HTTP 503) to the typed-errors union and the kind-to-status map.
- [x] 2.6 Write `internal/server/git/blame_test.go` covering: (a) clean tracked file (single-author and multi-author chunking); (b) untracked file → `not_found`; (c) dirty file unchanged content (single staged whitespace tweak elsewhere) — chunks still resolve to HEAD blame; (d) dirty file with an insertion in the middle — middle chunk is `uncommitted`; (e) dirty file with a deletion — corresponding HEAD chunk omitted, neighbours coalesce; (f) merge commit blame (first parent only); (g) explicit historical ref skips the dirty branch even when worktree is dirty; (h) file over 5 MB → `too_large`; (i) deadline exceeded → `blame_timeout`; (j) rename predecessor history NOT included (blame stops at rename boundary).
- [x] 2.7 Smoke-check `make test ./internal/server/...` passes.

## 3. SPA: API client + types

- [x] 3.1 In `web/src/api/types.ts`, extend `ApiError['error']` with `'blame_timeout'`. Add `GitCommitsParams` (with optional `path`), `BlameResponse`, `BlameChunk`, and `BlameChunkUncommitted` types matching the wire shape in design.md Decision 3.
- [x] 3.2 In `web/src/api/client.ts`, extend the existing commits fetcher to accept `path`. Add `blame(path: string, ref?: string)` returning `Result<BlameResponse, ApiError>`.

## 4. SPA: status context + changes-badge refactor

- [x] 4.1 Add `web/src/git/GitStatusContext.tsx` exposing the `/api/git/status` response, a refresh trigger (called on initial repo-aware page load), and a `pathStatus(path)` helper returning `'clean' | 'staged' | 'unstaged' | 'untracked'`.
- [x] 4.2 Wire the context provider into the SPA root (next to the existing repo-info provider, whichever component owns it today). The context fetch SHALL only fire when `/api/git/info`'s `is_repo` is true.
- [x] 4.3 Migrate the existing changes-badge component to read from the context instead of doing its own `/api/git/status` fetch. Confirm the badge count and behaviour are unchanged (no UX regression).
- [x] 4.4 Add a unit test on the helper: `pathStatus` returns the expected discriminator for a sample status payload covering each bucket.

## 5. SPA: file-viewer last-commit strip

- [x] 5.1 Add `web/src/git/FileLastCommitStrip.tsx` taking `path: string`. Reads `is_repo` from the git-info provider and `pathStatus(path)` from the status context.
- [x] 5.2 When `is_repo: false`, return null.
- [x] 5.3 When status is `untracked`, render the no-commit state: `[● Untracked] · No commits yet` plus a History pill that links to `/git/commits?path=<encoded>` (the commits page will render its own untracked banner — keep the affordance consistent).
- [x] 5.4 Otherwise, fetch `/api/git/commits?path=<path>&limit=1`. On empty response (rare — file exists but no commits ever touched it on this ref), render the same no-commit shape with a clarifying label. On success, render `short_sha · subject · author · relative-time` with `text-overflow: ellipsis` on the subject; if status is `staged` or `unstaged` also render a `[● Modified locally]` pill on the line above.
- [x] 5.5 The History pill links to `/git/commits?path=<encoded>&ref=<active-ref>` (active ref read from the existing branch-picker state). The short_sha and subject are clickable links to `/git/commits/<sha>`.
- [x] 5.6 Mount `<FileLastCommitStrip>` inside `web/src/components/FileViewer.tsx` between `<FileHead>` and the content area (in both the error and success branches — the strip is independent of the body's loading/error state).
- [x] 5.7 CSS: chrome uses the documented SPA design tokens (per the existing "Git surfaces use the documented SPA design tokens" requirement). Status pills follow the existing changes-badge pill pattern. On viewports below `768px`, the strip wraps to two rows (pill row, then commit-summary row).
- [x] 5.8 Test in `FileViewer.test.tsx` (or a new `FileLastCommitStrip.test.tsx`): (a) absent when `is_repo: false`; (b) clean state renders the commit summary; (c) modified-locally state renders the pill plus summary; (d) untracked state renders the no-commits message; (e) History pill href encodes the path correctly.

## 6. SPA: Code | Blame tabs in the file viewer

- [x] 6.1 In `web/src/components/FileViewer.tsx`, render a tablist (`role="tablist"`) above the content area when `meta.kind === 'text'`. Tabs: "Code" and "Blame". Selection comes from `useSearchParams().get('view')` — anything other than `'blame'` is Code. Switching tabs writes the param via `setSearchParams({ view: 'blame' | undefined })`.
- [x] 6.2 When the Blame tab is active, render the new `<BlameView>` (built in section 7); the existing `<CodeBlock>` render path stays untouched.
- [x] 6.3 Tab keyboard support: left/right arrow keys move the active tab, Home/End jump to first/last (standard ARIA tab pattern). Tab buttons participate in the existing keyboard-shortcut "inert when typing" rule.
- [x] 6.4 Update the keyboard tests in `Layout.keyboard.test.tsx` (or wherever the file-viewer key-handling lives) if any new shortcut is added; otherwise just confirm the existing handlers stay inert when focus is on a tab button.
- [x] 6.5 Test: tab toggle round-trips via the URL (`?view=blame` persists across reload simulated by re-mount); Blame tab does not render when `kind !== 'text'` (markdown / image / no-preview); URL with `?view=blame` on a non-text file falls back to the existing render with no error.

## 7. SPA: Blame view

- [x] 7.1 Add `web/src/git/BlameView.tsx` taking `path: string`, `ref?: string`. Fetches `/api/git/blame` and `/raw/<path>` in parallel; pairs them by line number; renders the layout described in design.md Decision 8.
- [x] 7.2 Render structure: for each chunk, a `<section class="blame-chunk">` containing a metadata cell and a line-range cell. Metadata is `short_sha · subject · author · relative-time` linked to `/git/commits/<sha>` (or a muted "Working tree" label for `uncommitted` chunks). Line-range cell contains one row per line with a line-number gutter and a code cell.
- [x] 7.3 Per-line syntax highlighting: reuse the shared lowlight instance from `web/src/components/syntax/grammars.ts`, language via `extToLanguage(path)`. Same approximation as `DiffHunk`. When `extToLanguage` returns `null`, render plain monospace.
- [x] 7.4 Wrap behaviour: read `useWrap()`; when wrap is on, lines wrap inside their code cell; when off, the code cell scrolls horizontally and the line-number gutter (and, on desktop, the metadata column) stay sticky-left. Mirror the sticky-left pattern already in `DiffHunk.css`.
- [x] 7.5 Uncommitted chunk treatment: distinct background via `--blame-uncommitted-bg` (themed via the existing light/dark token pattern). Metadata cell reads `Working tree · uncommitted` with no author/time and no link.
- [x] 7.6 Modified-locally banner: when the blame response has `dirty: true`, render a `[● Modified locally]` pill above the chunk list.
- [x] 7.7 Empty / error states: untracked file (or `not_found` from the API) → "This file is untracked. No blame available." Timeout → "Blame took too long for this file. Try the History view." Plus a "Open History" button linking to `/git/commits?path=<encoded>`.
- [x] 7.8 Responsive: ≥768px renders the three-column layout (metadata | gutter | code); below 768px stacks the metadata above the line range per chunk. Use a media query at the same `768px` breakpoint the rest of the SPA uses.
- [x] 7.9 CSS chrome uses the documented SPA design tokens (per the existing "Git surfaces use the documented SPA design tokens" requirement). Diff/code-line backgrounds are NOT used here — blame doesn't have add/del semantics, only commit grouping.
- [x] 7.10 Test `BlameView.test.tsx`: (a) chunk metadata renders for committed chunks and is replaced by "Working tree" for uncommitted chunks; (b) sha and subject link to `/git/commits/<sha>`; (c) line numbers count up monotonically through chunks; (d) wrap toggle changes the code-cell class; (e) untracked empty state renders without fetching blame; (f) timeout error state renders the History pivot; (g) the desktop layout class is applied at ≥768px and the stacked layout class below (jsdom: assert via a viewport-helper or class-name test, not pixel-perfect).

## 8. SPA: commits-list path filter

- [x] 8.1 In the commits-list page (`web/src/pages/CommitsListPage.tsx` or the equivalent), read `?path=<file>` from `useSearchParams`. When present, pass it to the existing commits fetcher.
- [x] 8.2 Render a sticky banner row above the list: `Commits affecting <path>` plus a `[× clear]` link that navigates to `/git/commits` preserving `?ref=`. Path is rendered as an inline `<code>` and is keyboard-accessible (clear link is a real `<a>` or button).
- [x] 8.3 When `pathStatus(<path>)` reports `staged` / `unstaged` / `untracked`, render a single status row directly below the banner — the same pill the file viewer's strip uses. For `untracked`, also render an info line: `This file is not yet tracked by git.`
- [x] 8.4 When the filtered response is empty AND status is `clean`, render an empty state: `No commits have touched <path> on this ref.`
- [x] 8.5 Update or add tests in `CommitsListPage.test.tsx`: (a) banner appears when `?path=` is present; (b) `[× clear]` navigates to the unfiltered list preserving `?ref=`; (c) untracked status renders the info line and a zero-commit body; (d) modified-locally status renders the pill above the commit list.

## 9. SPA: spec-doc updates

- [x] 9.1 No code change here. Sanity check that the existing "SPA renders git affordances only when repo is present" requirement still covers the new affordances (it does — strip, tabs, banner all gate on `is_repo: true`).
- [x] 9.2 Verify the "Path semantics declaration" requirement still holds. Both new SPA fetchers send the path as a query parameter and let the server map it via pathspec; the SPA itself does no path resolution. The blame endpoint's working-tree read is the one server-side exception, called out in its requirement.

## 10. Cross-cutting verification

- [x] 10.1 `cd web && npm run lint` from `web/` and fix any new warnings.
- [x] 10.2 `cd web && npm test` — all existing tests still pass, plus the new ones added in sections 3-8.
- [x] 10.3 `make test` — Go-side passes including the new commits filter and blame tests.
- [x] 10.4 `make build` produces a fresh `./explorer` binary with the rebuilt SPA embedded; commit the rebuilt `internal/server/ui/dist/` alongside the `web/src/` changes (per CLAUDE.md embed contract).
- [x] 10.5 `make dev-server`, then exercise: (a) open a clean tracked file — strip shows last commit; click History → filtered commits list with banner; (b) edit a tracked file in the working tree, refresh — strip shows Modified locally; open Blame, see the modified lines marked Working tree; (c) create a new untracked file, navigate to it — strip shows Untracked, no commits state; Blame tab shows the untracked empty state; (d) deep link to `/view/<path>?view=blame`, reload, confirm Blame tab is active; (e) on a 360px viewport, repeat (a) and (b), confirm the stacked layout reads cleanly.

## 11. Demo GIFs and docs

- [x] 11.1 Regenerate `docs/desktop.gif` via the `record-demo-gif` skill so it reflects the strip + tabs + Blame view + path-filtered commits list.
- [x] 11.2 Regenerate `docs/mobile.gif` via the same skill for the mobile-viewport recording.
- [x] 11.3 Confirm the README still renders both GIFs and decide whether any narrative copy needs adjustment to mention blame or per-file history (the README's feature bullets may want a one-line addition).
