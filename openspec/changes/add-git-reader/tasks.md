## 1. Dependency and project setup

- [x] 1.1 Add `github.com/go-git/go-git/v5` to `go.mod` and run `go mod tidy`
- [x] 1.2 Update `CLAUDE.md` Conventions section: change "No external Go dependencies — stdlib only" to declare go-git as the documented exception for the git-reader capability
- [x] 1.3 Verify `make build` still produces a working binary with go-git linked (no build-tool changes expected)

## 2. Test fixture (sample repo)

- [x] 2.1 Add `testdata/sample-repo/` to `.gitignore` so the nested `.git/` is never accidentally committed
- [x] 2.2 Create `make sample-repo` target that initialises a fresh repo under `testdata/sample-repo/` with: 3 commits on `main`, a secondary branch `feature/x` with 1 additional commit, an annotated tag `v0.1.0` on the second `main` commit, a binary file modified across two commits, a rename across two commits, one staged modification, one unstaged modification, and one untracked file. Commits MUST use fixed `GIT_AUTHOR_DATE`, `GIT_COMMITTER_DATE`, `GIT_AUTHOR_NAME`/`EMAIL`, `GIT_COMMITTER_NAME`/`EMAIL` so the resulting shas are reproducible across runs (required by the e2e suite in section 18).
- [x] 2.3 Add `make dev-git-server` target (or extend `make dev-server`) so dev workflow can target the fixture repo
- [x] 2.4 Document the new make targets in the README's development section

## 3. Git package — repository gate and info

- [x] 3.1 Create `internal/server/git/` package
- [x] 3.2 Implement `Open(root string) (*Repo, error)` that returns a wrapper around `go-git`'s `PlainOpen`, gated on `.git` existing at the served root only (not via `DetectDotGit: true`). Handle both directory-`.git` and file-`.git` (worktree pointer) cases.
- [x] 3.3 Implement `Repo.Info() (InfoResult, error)` returning `{is_repo, head_ref, head_sha, detached}` — handle normal-branch, detached-HEAD, and empty-repo states
- [x] 3.4 Add typed errors `ErrNotARepo` and `ErrUnknownRef` to the package
- [x] 3.5 Unit tests for `Open` covering: served root with `.git` directory, with `.git` worktree pointer file, without `.git`, with `.git` only in an ancestor (must fail)
- [x] 3.6 Unit tests for `Info` covering: normal branch, detached HEAD, empty repo

## 4. Git package — refs

- [x] 4.1 Implement `Repo.Refs() (RefsResult, error)` returning `{branches: [{name, sha}], tags: [{name, sha}]}`, with branch names stripped of `refs/heads/` and tag names stripped of `refs/tags/`, sorted case-insensitively, remote-tracking branches excluded, annotated tags peeled to commit shas
- [x] 4.2 Unit tests covering: lightweight tag, annotated tag (peeling), local and remote-tracking branches (only local listed), empty repo

## 5. Git package — commit log

- [x] 5.1 Implement `Repo.Commits(ref, cursor string, limit int) (CommitsResult, error)` using go-git's `Log` with `From: <resolved ref>` and walking until cursor or limit. Limit defaults to 30, clamped to 100. Cursor (when set) is treated as an exclusive "older than" marker — the cursor commit itself is NOT included.
- [x] 5.2 Ref resolution: accept branch name (no `refs/heads/` prefix needed), tag name, short or full sha. Return `ErrUnknownRef` for invalid inputs.
- [x] 5.3 Commit summary mapping: extract `sha`, `short_sha` (7 chars), `author_name`, `author_email`, `author_time` (RFC 3339), `subject` (first line), `body` (rest after blank line; empty string if absent)
- [x] 5.4 `next_cursor`: sha of the last commit in the returned page if the limit was reached, otherwise null
- [x] 5.5 Unit tests: default ref (HEAD), explicit branch, branch with slashes, tag, sha cursor, unknown ref, empty repo, limit clamping, cursor exclusivity (cursor commit not duplicated)

## 6. Git package — commit detail

- [x] 6.1 Implement `Repo.Commit(sha string, fileOffset, fileLimit int) (CommitResult, error)` returning commit metadata + paginated file list
- [x] 6.2 Implement file-header extraction: status (A/M/D/R), `old_path`, `new_path`, `additions`, `deletions`, `is_binary`, `old_size?`, `new_size?`. Compute per-file additions/deletions by walking go-git's `FilePatch.Chunks()`.
- [x] 6.3 Compute totals (`total_files`, `total_additions`, `total_deletions`) before pagination slicing
- [x] 6.4 Merge commit handling: diff against `Parents[0]` only; populate `parents` with all parent shas
- [x] 6.5 Rename detection: rely on go-git's built-in rename detection where available; for renames, populate both `old_path` and `new_path` and set `status: "R"`
- [x] 6.6 Binary detection: use go-git's `FilePatch.IsBinary()`; set sizes by reading the blob lengths from the from/to file objects
- [x] 6.7 `next_file_offset` logic: null when the returned page is the last (offset + len(returned) >= total)
- [x] 6.8 Unit tests: addition, deletion, rename, modification, binary file, merge commit (first-parent), empty commit, file-list pagination boundaries, unknown sha, invalid sha format, short-sha lookup

## 7. Git package — working-tree status

- [x] 7.1 Implement `Repo.Status() (StatusResult, error)` returning `{staged: [...], unstaged: [...], untracked: [...]}`
- [x] 7.2 For staged entries: compute diff between HEAD tree and index. For unstaged entries: compute diff between index and working tree. Each entry uses the same file-header shape as commit detail (status, paths, additions, deletions, is_binary, sizes).
- [x] 7.3 Untracked entries: array of `{path}` only — no diff possible
- [x] 7.4 Conflict resilience: never crash on a conflicted/merging repo state. Either omit conflicted entries or surface them under an additional `conflicted` array. Document the choice with a code comment.
- [x] 7.5 Unit tests: clean tree, staged-only, unstaged-only, untracked-only, mixed, staged-add (new file), staged-delete, unstaged-modify of a tracked file, conflicted-merge state (no crash)

## 8. Git package — lazy hunk patch

- [x] 8.1 Implement `Repo.Patch(source string, sha string, path string, hunkOffset, hunkLimit int) (PatchResult, error)` returning `{path, is_binary, total_hunks, hunks, next_hunk_offset, more_available}` — `source` is one of `commit`, `staged`, `unstaged`
- [x] 8.2 Reject `source=commit` without `sha`; reject `source=staged|unstaged` *with* `sha`. Validate `sha` against `[0-9a-f]{4,64}` when present.
- [x] 8.3 Hunk extraction: convert go-git's chunk-by-chunk diff into a canonical hunk representation (`old_start`, `old_lines`, `new_start`, `new_lines`, header, lines[]) with line types `context|add|del`. Strip trailing newlines from each line's text.
- [x] 8.4 Defensive byte cap: a single response SHALL NOT carry more than ~512 KiB of patch text (sum of all `text` and `header` fields). Define a named constant `patchResponseByteCap = 512 * 1024`.
- [x] 8.5 Byte-cap behaviour: when the requested batch would exceed the cap, return fewer hunks (never breaking mid-hunk) and set `more_available: true`. If a single hunk alone exceeds the cap, return it in isolation.
- [x] 8.6 Binary file response: `is_binary: true`, `total_hunks: 0`, `hunks: []`
- [x] 8.7 Path traversal: pass `path` through go-git's lookup unchanged; rely on go-git to reject `..`/absolute paths. Map "file not found in tree/index" to `not_found` error.
- [x] 8.8 Unit tests: first batch / next batch / last batch, total_hunks, more_available semantics, binary file, byte cap with multiple hunks, byte cap with single oversized hunk, path traversal attempts (`../../etc/passwd`, `/etc/passwd`), unknown path, source/sha argument mismatches

## 9. HTTP layer — endpoint wiring

- [x] 9.1 Add new typed error kinds `not_a_repo` and `unknown_ref` to `internal/server/errors.go` with appropriate HTTP statuses (404 for both)
- [x] 9.2 Register new exact-match routes in `internal/server/routes.go`: `/api/git/info`, `/api/git/refs`, `/api/git/commits`, `/api/git/commit`, `/api/git/status`, `/api/git/patch`
- [x] 9.3 Implement input validation helpers: `validateSha(s) bool` matching `[0-9a-f]{4,64}` and `validateRef(s) bool` enforcing git's ref-name rules. Wire these into the handlers before any go-git call.
- [x] 9.4 Handler: `handleGitInfo` — short-circuit `is_repo: false` when no `.git` at served root; otherwise delegate to `Repo.Info()`. ALWAYS HTTP 200; never `not_a_repo` for this endpoint.
- [x] 9.5 Handler: `handleGitRefs` — gate on `.git`; delegate to `Repo.Refs()`
- [x] 9.6 Handler: `handleGitCommits` — parse `ref`, `cursor`, `limit` (clamp limit to [1, 100], default 30); validate; delegate
- [x] 9.7 Handler: `handleGitCommit` — parse `sha` (required), `file_offset` (default 0), `file_limit` (default 50, clamp to [1, 200]); validate; delegate
- [x] 9.8 Handler: `handleGitStatus` — gate on `.git`; delegate to `Repo.Status()`
- [x] 9.9 Handler: `handleGitPatch` — parse `source` (required, one of `commit|staged|unstaged`), `sha` (required iff `source=commit`), `path` (required), `hunk_offset` (default 0), `hunk_limit` (default 3, clamp to [1, 50]); validate; delegate
- [x] 9.10 Open the repo lazily once per request inside each handler (no startup caching — re-evaluating the gate on every request is part of the spec)
- [x] 9.11 Black-box HTTP integration tests in `internal/server/server_test.go` (or a new `internal/server/git_test.go`) covering every endpoint × every scenario in the spec

## 10. SPA — API client and types

- [x] 10.1 Extend `web/src/api/types.ts` with all new response and request shapes: `GitInfo`, `GitRefs`, `GitCommits`, `GitCommit`, `GitFileHeader`, `GitHunk`, `GitPatch`, `GitStatus`, `GitUntracked`
- [x] 10.2 Extend the `ApiError` union with `not_a_repo` and `unknown_ref`
- [x] 10.3 Extend `web/src/api/client.ts` with helpers: `getGitInfo`, `getGitRefs`, `getGitCommits`, `getGitCommit`, `getGitStatus`, `getGitPatch` — each handling URL encoding (especially for `ref` containing `/`)
- [x] 10.4 Add a top-level React context (`GitInfoContext` or similar) populated by one `/api/git/info` call on SPA mount; cache for the session. The context exposes `is_repo`, `head_ref`, `head_sha`, `detached`, and the current changes count (refreshed when status is re-fetched).
- [x] 10.5 Unit tests for the new client helpers (mock fetch)

## 11. SPA — routing

- [x] 11.1 Add `react-router-dom` routes for `/git/commits`, `/git/commits/:sha`, `/git/status` to `web/src/App.tsx` (or wherever the route table lives)
- [x] 11.2 Add a fallback render: navigating to any `/git/*` route when `is_repo` is false shows a `NoGitRepo` placeholder component with a link back to `/`
- [x] 11.3 Ensure existing `/view/*` routes are unaffected

## 12. SPA — chrome (branch pill + changes badge)

- [x] 12.1 Create `BranchPicker` component: button labelled per current ref state (branch name | `Detached at <short_sha>` | `(no commits)`), dropdown opens listing branches + tags from `/api/git/refs` with distinct visual sections, selecting navigates to `/git/commits?ref=<encoded>`. Dropdown also includes "View commits" (current ref) and "Local changes" (count + link to `/git/status`).
- [x] 12.2 Create `ChangesBadge` component: rendered only when staged + unstaged + untracked > 0; reads count from `GitInfoContext`; activates `/git/status`
- [x] 12.3 Wire desktop toolbar (`Toolbar.tsx`) to show `BranchPicker` and `ChangesBadge` between breadcrumbs and search input, gated on `is_repo`
- [x] 12.4 Wire sidebar drawer header (mobile) to show `BranchPicker` and `ChangesBadge` above the tree, gated on `is_repo`. The mobile top bar is NOT modified.
- [x] 12.5 Add CSS for both components using existing `--color-*` and `--space-*` custom properties; respect the theme switch without a flash
- [x] 12.6 Tests: `BranchPicker.test.tsx` (label variants, dropdown content, navigation), `ChangesBadge.test.tsx` (hidden when clean, count rendering)

## 13. SPA — commits list view

- [x] 13.1 Create `web/src/pages/git/CommitsListPage.tsx` rendering the response from `/api/git/commits` as commit cards (subject, author, short_sha, relative time)
- [x] 13.2 Implement pager: when `next_cursor` non-null, render a "Load older commits" button that fetches the next page and appends
- [x] 13.3 Honour `?ref=<ref>` query parameter; pass it to the API call and highlight in the branch picker
- [x] 13.4 Empty state: "No commits on this branch" with appropriate hint
- [x] 13.5 CSS in `CommitsListPage.css` using existing tokens
- [x] 13.6 Tests: rendering, pagination, empty state, ref filtering

## 14. SPA — commit detail view with lazy hunks

- [x] 14.1 Create `web/src/pages/git/CommitDetailPage.tsx` consuming `/api/git/commit`
- [x] 14.2 Render header: subject, body (preserved linebreaks, no markdown), author/committer with relative times, short_sha, parents (linked to `/git/commits/<parent_sha>`), summary counts
- [x] 14.3 Render file list as paginated cards (50 at a time). Each card: status badge (A/M/D/R/●binary), path (showing `old → new` for renames), per-file +/- counts.
- [x] 14.4 Auto-expand the first 3 cards on first paint; pre-fetch their first 3 hunks
- [x] 14.5 Create reusable `FileDiffCard` component handling: collapsed state, expand → fetch first batch of hunks, "Load N more changes (M remaining)" pager, binary file rendering (non-expandable row)
- [x] 14.6 Create reusable `DiffHunk` component rendering one hunk (header line + lines with `+`/`−`/context markers and themed backgrounds). Source text in each line is syntax-highlighted via the shared `lowlight` instance, with language detected from the file path via `extToLanguage`. The marker stays a sibling span outside the highlighted content so the diff palette governs its colour. Unknown languages fall back to plain monospace.
- [x] 14.7 File-list pager: "Load next 50 files" when `next_file_offset` non-null
- [x] 14.8 Unknown-commit fallback: render a placeholder if API returns `unknown_ref`
- [x] 14.9 CSS in `CommitDetailPage.css`, `FileDiffCard.css`, `DiffHunk.css` using existing tokens; declare new `--color-diff-add-bg`, `--color-diff-del-bg` custom properties in `web/src/styles/` light + dark
- [x] 14.10 Tests: rendering, file expand/collapse, hunk pagination, file pagination, binary file row, rename rendering, empty commit, unknown commit
- [x] 14.11 Wrap/no-wrap toggle in the commit detail and status page headers — reuse the existing `useWrap` hook (so the preference is shared with the file viewer via `localStorage["explorer.wrap"]`) and `WrapIcon`; pass `wrap` down to `FileDiffCard` → `DiffHunk`. Add `.diff-hunk-body.wrap-on` / `.diff-hunk-body.wrap-off` CSS (`pre-wrap` vs `pre + overflow-x: auto`). Add unit + e2e tests.

## 15. SPA — working-tree status view

- [x] 15.1 Create `web/src/pages/git/StatusPage.tsx` consuming `/api/git/status`
- [x] 15.2 Render three sections (Staged, Unstaged, Untracked) using the same `FileDiffCard` from commit detail for the Staged/Unstaged entries
- [x] 15.3 Auto-expand the first 3 entries combined across Staged + Unstaged in source order
- [x] 15.4 Untracked section renders non-expandable rows where the path is a link to `/view/<path>` (`target="_blank"`, `rel="noopener noreferrer"`); no diff is loaded
- [x] 15.5 Empty state ("No local changes") when all three sections are empty
- [x] 15.6 CSS in `StatusPage.css`
- [x] 15.7 Tests: mixed, clean tree, untracked-only, expanding a staged file, expanding an unstaged file

## 16. SPA — keyboard shortcuts on git pages

- [x] 16.1 Extend the existing global keyboard-shortcut handler to recognise git routes (`/git/commits`, `/git/commits/<sha>`, `/git/status`)
- [x] 16.2 On git pages: `/` is no-op; `Escape` navigates "up one level" within git nav (detail → list, list/status → most-recent folder route or `/`); `Backspace` matches `Escape` on commit detail and is no-op on top-level git pages (browser default prevented)
- [x] 16.3 Preserve the existing "inert when typing in an input/textarea" rule across all git pages
- [x] 16.4 Tests: each scenario in the spec

## 17. SPA — non-repo placeholder

- [x] 17.1 Create `NoGitRepo.tsx` rendered when `is_repo` is false and the route is `/git/*`. Includes a clear message and a link back to `/`.
- [x] 17.2 Ensure `BranchPicker` and `ChangesBadge` short-circuit to render nothing when `is_repo` is false
- [x] 17.3 Tests: non-repo SPA load shows no git affordances anywhere; direct nav to `/git/commits` shows placeholder

## 18. End-to-end test (Playwright)

- [x] 18.1 Add a top-level `e2e/` directory with its own `package.json` and `playwright.config.ts`. Pin `@playwright/test` to a specific version. Keep it separate from `web/package.json` so SPA builds don't pull Playwright as a transitive dev dep.
- [x] 18.2 Configure Playwright: chromium-only project (Firefox/WebKit not required), headless, `baseURL` matching the spawned binary. Use Playwright's `webServer` to spawn `./explorer testdata/sample-repo --host 127.0.0.1 --port <free port>` for the main project, and a second project pointing at non-repo `./testdata` on a different port for the no-repo scenarios.
- [x] 18.3 Add `make e2e` target: depends on `build` and `sample-repo`; runs `cd e2e && npm ci && npx playwright install chromium && npx playwright test`. Add a `make e2e-deps` target that runs `sudo npx playwright install-deps chromium` once on a fresh machine.
- [x] 18.4 Add `.gitignore` entries for `e2e/node_modules/`, `e2e/test-results/`, `e2e/playwright-report/`, `e2e/.cache/`
- [x] 18.5 Spec test `e2e/tests/info.spec.ts` — load SPA against sample-repo; assert branch pill shows `main`, changes badge renders the expected staged+unstaged+untracked count
- [x] 18.6 Spec test `e2e/tests/branch-picker.spec.ts` — open dropdown; assert branches (`main`, `feature/x`) and tag (`v0.1.0`) appear in separate sections, sorted; selecting `feature/x` navigates to `/git/commits?ref=feature%2Fx` (url-encoded slash)
- [x] 18.7 Spec test `e2e/tests/commits-list.spec.ts` — navigate to `/git/commits`; assert commit cards render with subject, short_sha, author, relative time; "Load older commits" pager appears when `next_cursor` non-null (lower the limit via query param if fixture is small)
- [x] 18.8 Spec test `e2e/tests/commit-detail.spec.ts` — open the rename commit; assert header (subject, body, parents, summary counts); first 3 file cards auto-expand; rename card shows `old → new`; binary file card is non-expandable; expanding a collapsed card fetches hunks; "Load N more changes" appears for the multi-hunk file
- [x] 18.9 Spec test `e2e/tests/status.spec.ts` — load `/git/status` against sample-repo; assert Staged, Unstaged, Untracked sections each render their expected entries; first 3 entries across Staged+Unstaged auto-expand
- [x] 18.10 Spec test `e2e/tests/no-repo.spec.ts` — using the non-repo Playwright project; assert no `BranchPicker` / `ChangesBadge` in toolbar; navigating to `/git/commits` shows the `NoGitRepo` placeholder with link back to `/`
- [x] 18.11 Spec test `e2e/tests/keyboard.spec.ts` — on `/git/commits/<sha>`, `Escape` and `Backspace` navigate to list; on `/git/commits` and `/git/status`, `Escape` navigates to most-recent folder route (or `/`) and `Backspace` is no-op; `/` is no-op on all git pages; shortcuts are inert while focus is in an input
- [x] 18.12 Spec test `e2e/tests/themes.spec.ts` — toggle theme to dark; assert branch picker dropdown, diff add/del row backgrounds, and file cards pick up `[data-theme="dark"]` styling (snapshot-based or computed-style assertions, no flash on initial load)

## 19. Build, embed, and integration verification

- [x] 19.1 Run `make web` to rebuild `internal/server/ui/dist/` with all new SPA code
- [x] 19.2 Run `make build` and verify the binary embeds the new SPA assets
- [x] 19.3 Run `make test` and verify Go + SPA tests pass (Go 103 + SPA 129)
- [x] 19.4 Run `make e2e` and verify all Playwright e2e tests pass against the built binary (18/18 passed)
- [x] 19.5 Run `make sample-repo` followed by `make dev-git-server` and manually spot-check the git surface (covered by e2e suite running live chromium against the built binary + sample-repo fixture)
- [x] 19.6 Manually verify non-repo behaviour by running `make dev-server` (covered by `e2e/tests/no-repo.spec.ts` against the non-repo Playwright project)
- [x] 19.7 Manually verify in both light and dark themes (covered by `e2e/tests/themes.spec.ts`)
- [x] 19.8 Commit `internal/server/ui/dist/` along with `web/src/` changes (per the existing `make web-commit` workflow described in CLAUDE.md)

## 20. Documentation

- [x] 20.1 README: add a brief section describing the git surface (commits, branches, status). (Screenshot/GIF deferred — left for a follow-up using the `record-demo-gif` skill.)
- [x] 20.2 README: note the `.git`-at-root gate and the read-only stance
- [x] 20.3 README: document `make e2e` and `make e2e-deps`; note that the e2e suite spawns the built binary against `testdata/sample-repo` and requires `make sample-repo` to have been run
- [x] 20.4 Update CLAUDE.md if any new conventions emerge (the dependency note in 1.2 is the only known one)
