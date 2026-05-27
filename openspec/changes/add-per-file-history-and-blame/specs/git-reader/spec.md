## MODIFIED Requirements

### Requirement: Commit history endpoint (cursor-based)

The server SHALL expose `GET /api/git/commits` returning commits reachable from a ref, paginated cursor-based.

Query parameters: `ref` (optional — defaults to HEAD; SHALL be a branch name, tag name, or full sha; SHALL match git's ref-name rules), `cursor` (optional — a full or short sha; if present, the returned page starts from the commit *strictly older* than the cursor commit), `limit` (optional — default 30, maximum 100; values above 100 SHALL be clamped to 100), `path` (optional — repo-relative path; if present, the page SHALL contain only commits whose first-parent diff touches `path` as either an old or new path).

The response SHALL be a JSON object with fields `commits` (array of commit summaries, each `{sha, short_sha, author_name, author_email, author_time, subject, body}` where `sha` is the full 40-character hex, `short_sha` is the 7-character prefix, `author_time` is RFC 3339, `subject` is the first line of the commit message and `body` is the remainder after a blank line — empty string if no body) and `next_cursor` (sha to pass as `cursor` to retrieve the next page, or null if the last commit has been returned).

When `path` is set, the cursor still references a commit sha (not a filtered-page index); the next page SHALL filter the same `path` against the next walk segment. The walk SHALL stop at the first rename boundary for the file — earlier history of the file under a different path is NOT followed transparently in v1.

#### Scenario: First page of commits on the default ref

- **WHEN** a request arrives at `GET /api/git/commits` (no parameters) on a repository with HEAD on `main`
- **THEN** the response is HTTP 200 with up to 30 commits, sorted newest-first
- **AND** each commit entry includes all seven fields specified above
- **AND** `next_cursor` is the sha of the oldest commit in the returned page (or null if fewer than 30 commits exist)

#### Scenario: Next page via cursor

- **WHEN** a first request returned `next_cursor: "abc1234..."`
- **AND** a follow-up request arrives at `GET /api/git/commits?cursor=abc1234...`
- **THEN** the response contains commits *strictly older* than `abc1234...` (the cursor commit is NOT repeated)

#### Scenario: Select a specific ref

- **WHEN** a request arrives at `GET /api/git/commits?ref=feature/x`
- **THEN** the response contains commits reachable from `feature/x`, newest first

#### Scenario: Empty repository

- **WHEN** the repository has no commits
- **AND** a request arrives at `GET /api/git/commits`
- **THEN** the response is HTTP 200 with `commits: []` and `next_cursor: null`

#### Scenario: Unknown ref

- **WHEN** a request arrives at `GET /api/git/commits?ref=nonexistent`
- **THEN** the response is a typed `unknown_ref` error (HTTP 404)

#### Scenario: Limit clamping

- **WHEN** a request arrives at `GET /api/git/commits?limit=5000`
- **THEN** the response contains at most 100 commits (the maximum)

#### Scenario: Branch name with slashes

- **WHEN** a request arrives at `GET /api/git/commits?ref=feature%2Fx%2Fy` and the branch `feature/x/y` exists
- **THEN** the response is HTTP 200 with commits from that branch

#### Scenario: Path filter returns only touching commits

- **WHEN** a request arrives at `GET /api/git/commits?path=internal/server/api.go` on a repo where that file has been touched in 3 commits among the 50 reachable from HEAD
- **THEN** the response contains those 3 commit summaries, newest-first
- **AND** commits that did not touch `internal/server/api.go` are omitted
- **AND** `next_cursor` is null (the full filtered set fits in one page)

#### Scenario: Path filter with cursor

- **WHEN** a request arrives at `GET /api/git/commits?path=internal/server/api.go&cursor=abc1234`
- **THEN** the response contains commits strictly older than `abc1234` that also touched `internal/server/api.go`
- **AND** the cursor commit is NOT repeated regardless of whether it touched the path

#### Scenario: Path filter on a nonexistent path

- **WHEN** a request arrives at `GET /api/git/commits?path=does/not/exist.txt`
- **THEN** the response is HTTP 200 with `commits: []` and `next_cursor: null`
- **AND** no typed error is returned (an untracked or never-existed path is a normal empty-result case, not an error)

#### Scenario: Path filter stops at rename boundary

- **WHEN** the file `new.go` was renamed from `old.go` two commits ago
- **AND** a request arrives at `GET /api/git/commits?path=new.go`
- **THEN** the response contains the rename commit and any later commits that touched `new.go`
- **AND** older commits that touched the file under its previous name `old.go` are NOT included

#### Scenario: Path-escape attempt is rejected

- **WHEN** a request arrives at `GET /api/git/commits?path=../../etc/passwd`
- **THEN** the response is HTTP 200 with `commits: []` and `next_cursor: null`
- **AND** no filesystem access occurs outside `.git/` (go-git pathspec rules reject the lookup at the object layer)

### Requirement: Typed errors for git endpoints

The git-reader capability SHALL extend the JSON-error union with three new error kinds: `not_a_repo` (HTTP 404 — the served root has no `.git` at its top level), `unknown_ref` (HTTP 404 — the requested ref, branch, tag, or sha does not exist in the repository), and `blame_timeout` (HTTP 503 — the blame computation exceeded its server-side deadline for the requested file).

Existing error kinds (`not_found`, `internal_error`, `too_large`, etc., as defined by the http-api capability) SHALL be reused where applicable on `/api/git/*`. The SPA's `ApiError` union SHALL mirror these additions.

Error responses SHALL follow the existing `{error: "<kind>", message: "..."}` JSON shape with the appropriate HTTP status code.

#### Scenario: `not_a_repo` shape

- **WHEN** a request arrives at any `/api/git/*` endpoint (except `/info`) on a non-repo served root
- **THEN** the response is HTTP 404
- **AND** the body is JSON `{"error": "not_a_repo", "message": "<descriptive>"}`

#### Scenario: `unknown_ref` shape

- **WHEN** a request arrives at `GET /api/git/commits?ref=nonexistent`
- **THEN** the response is HTTP 404
- **AND** the body is JSON `{"error": "unknown_ref", "message": "<descriptive>"}`

#### Scenario: `blame_timeout` shape

- **WHEN** a blame request exceeds the server-side deadline for the requested file
- **THEN** the response is HTTP 503
- **AND** the body is JSON `{"error": "blame_timeout", "message": "<descriptive>"}`
- **AND** the SPA renders a distinct empty state offering the History view as a fallback (not the generic `internal_error` empty state)

### Requirement: Non-goals declared

The git-reader capability SHALL NOT, in this version, implement the following — they are explicit non-goals:

- Any write operation (no `checkout`, `commit`, `stage`, `fetch`, `push`, `merge`, `rebase`, `cherry-pick`, etc.).
- Submodule traversal (submodules SHALL appear as plain directories from the web-ui side, with no nested git context).
- Stash listing or browsing.
- Log search by commit message or commit content (filtering commits by the words in their subject/body or by the textual content of touched files). Filtering commits by **path** is supported via the `/api/git/commits` `path` query parameter, so log search by *path* is no longer a non-goal — only log search by *message* and *content* remains out of scope.
- Ref-to-ref compare (e.g. `main...feature`).
- Tags as a routed view (tags SHALL appear in the refs dropdown only).
- A "view file content at commit" endpoint. In particular, the existing `/raw/<path>` endpoint SHALL NOT be extended with a `?ref=` or `?sha=` query parameter — the http-api spec's existing requirement that `/raw/` "SHALL NOT inspect query parameters or headers to alter its behaviour" remains binding. If such a feature is added in the future, it SHALL be a new endpoint (e.g., `/api/git/blob`) rather than an extension of `/raw/`.
- Follow-rename in blame. The blame endpoint SHALL stop at the first rename boundary for the requested file; earlier history of the file under its old path SHALL NOT be included in the response.
- Caching of any kind. Every request SHALL invoke go-git fresh.
- Live updates when the repository changes outside `explorer` (no SSE, no polling). A page reload picks up new state.

#### Scenario: `/raw/` query-param rule preserved

- **WHEN** a request arrives at `GET /raw/some/file.txt?ref=abc1234`
- **THEN** the `?ref=` query parameter is ignored
- **AND** the response is the current working-tree bytes (or an existing error if the path is invalid)
- **AND** behaviour matches the existing `/raw/` requirement exactly

#### Scenario: Blame does not follow renames

- **WHEN** the file `new.go` was renamed from `old.go` three commits ago
- **AND** a request arrives at `GET /api/git/blame?path=new.go`
- **THEN** the response contains blame attribution only for commits that touched the file under the name `new.go`
- **AND** lines that the rename commit copied from `old.go` are attributed to the rename commit, not to the original `old.go` author
- **AND** no `old.go` commit appears in any chunk

## ADDED Requirements

### Requirement: Blame endpoint

The server SHALL expose `GET /api/git/blame` returning per-line blame attribution for a single file, grouped into chunks of consecutive lines that share the same source.

Query parameters: `path` (required — repo-relative path), `ref` (optional — defaults to HEAD; SHALL be a branch name, tag name, or full sha matching the existing `ref` validation rules).

The response SHALL be a JSON object with fields:
- `path` (string), `ref` (string), `sha` (full 40-character commit sha the blame was computed against).
- `total_lines` (integer).
- `dirty` (boolean — true iff the working-tree overlay was applied).
- `chunks` — array of chunk objects: each chunk is either a **committed chunk** with `{start_line, line_count, commit}` where `commit` is `{sha, short_sha, author_name, author_email, author_time, subject}`, or an **uncommitted chunk** with `{start_line, line_count, uncommitted: true}` and no `commit` field. `start_line` is 1-based and inclusive; line ranges across chunks SHALL be contiguous and cover exactly `[1, total_lines]`.

Two consecutive chunks attributed to the same commit SHALL be coalesced into one chunk. Two consecutive `uncommitted` chunks SHALL likewise be coalesced.

When `ref` is omitted (or equals HEAD) and the file appears in the working-tree status as `staged` or `unstaged`, the server SHALL compute the blame as a **working-tree overlay**:
1. Read HEAD's blob bytes for `path`.
2. Read the working-tree bytes for `path` via `resolver.Resolve` (this is the documented exception where the path-resolver applies inside `/api/git/*` — see the existing "Path semantics declaration" requirement and the "Blame endpoint working-tree overlay uses path-resolver" scenario below).
3. Compute the line-level diff between (1) and (2).
4. Run go-git blame against HEAD.
5. Walk the working-tree lines: lines unchanged from HEAD are attributed to their HEAD blame entry by HEAD-line index; lines inserted or modified in the working tree are emitted as `uncommitted: true`.
6. Coalesce consecutive same-commit and consecutive uncommitted runs into chunks.
7. Set `dirty: true` in the response.

When `ref` is an explicit historical ref (branch / tag / sha that does not resolve to the same commit as HEAD), the server SHALL NOT apply the working-tree overlay regardless of working-tree state — blame is computed directly against that ref's tree and `dirty` is `false`.

The endpoint SHALL enforce the same 5 MiB inline-preview cap on the resolved file size (the inline cap as defined in the http-api capability). Files exceeding the cap SHALL respond with the existing `too_large` typed error.

The endpoint SHALL enforce a server-side context deadline (target ~10 seconds) around the blame computation. On `context.DeadlineExceeded`, the response SHALL be the new typed `blame_timeout` error (see the "Typed errors for git endpoints" requirement).

Untracked files SHALL respond with the existing `not_found` typed error (HTTP 404). Files not present at the requested ref SHALL likewise respond with `not_found`.

The endpoint SHALL stop at the first rename boundary — earlier history of the file under a different path SHALL NOT be included (see the "Non-goals declared" requirement).

#### Scenario: Clean tracked file blamed against HEAD

- **WHEN** a request arrives at `GET /api/git/blame?path=internal/server/api.go` on a repo where that file is clean and tracked
- **THEN** the response is HTTP 200 with `dirty: false`, `total_lines` matching the file's line count, and `chunks` covering `[1, total_lines]` contiguously
- **AND** every chunk is a committed chunk with a `commit` summary
- **AND** consecutive lines attributed to the same commit are grouped into one chunk

#### Scenario: Untracked file

- **WHEN** a request arrives at `GET /api/git/blame?path=new.txt` where `new.txt` is untracked
- **THEN** the response is a typed `not_found` error (HTTP 404)

#### Scenario: Dirty file with the working-tree overlay

- **WHEN** the file `internal/server/api.go` is modified in the working tree (status: `unstaged`) with 4 lines inserted at original position 42
- **AND** a request arrives at `GET /api/git/blame?path=internal/server/api.go` (no `ref`)
- **THEN** the response is HTTP 200 with `dirty: true`
- **AND** `total_lines` equals the working-tree file's line count (i.e. 4 more than HEAD's)
- **AND** the 4 inserted lines appear as a single `uncommitted: true` chunk starting at the working-tree line where the insertion lives
- **AND** lines before and after the insertion are attributed to their HEAD blame commits, with no overlap or gap in `start_line` ranges

#### Scenario: Explicit historical ref skips the overlay

- **WHEN** the working tree is dirty for `path=foo.go`
- **AND** a request arrives at `GET /api/git/blame?path=foo.go&ref=v1.0.0`
- **THEN** the response has `dirty: false`
- **AND** every chunk is a committed chunk
- **AND** the `sha` field is the tag's peeled commit sha, not HEAD's

#### Scenario: File over the 5 MiB cap

- **WHEN** a request arrives for a path whose resolved file size exceeds the 5 MiB inline cap
- **THEN** the response is the typed `too_large` error
- **AND** no blame computation is attempted

#### Scenario: Blame deadline exceeded

- **WHEN** a request arrives for a large file whose blame walk exceeds the server-side deadline
- **THEN** the response is the typed `blame_timeout` error (HTTP 503)
- **AND** the SPA renders the distinct timeout empty state, not the generic internal-error state

#### Scenario: Path-escape attempt is rejected

- **WHEN** a request arrives at `GET /api/git/blame?path=../../etc/passwd`
- **THEN** the response is the typed `not_found` error (HTTP 404)
- **AND** no filesystem access occurs outside the served root (the path-resolver chokepoint applies to the working-tree read step; go-git's pathspec rules apply to the HEAD blob lookup)

#### Scenario: Blame endpoint working-tree overlay uses path-resolver

- **WHEN** the dirty branch of blame reads working-tree bytes for `path`
- **THEN** the read SHALL go through `resolver.Resolve` (clean, reject `..` / absolute, join to root, `EvalSymlinks`, prefix-check)
- **AND** an out-of-root symlink at `path` SHALL produce the typed `outside_root` error rather than leaking the linked content
- **AND** this is the documented exception to the "Path semantics declaration" requirement — every other `/api/git/*` `path` parameter remains a repo-relative pathspec into the git object tree, not a filesystem path

### Requirement: Per-file last-commit strip in the file viewer

When the served root is a git repository (`is_repo: true`), the file viewer at `/view/<path>` (file route, no trailing slash) SHALL render a "last commit" strip between the file header and the content area. The strip SHALL render for every file kind (text, markdown, image, non-previewable, error states) — its visibility is gated only on `is_repo` and on the path itself, not on the file's preview kind.

The strip SHALL render in one of three states, determined by the file's working-tree status (read from the same `/api/git/status` response used by the changes badge — see the "SPA renders git affordances only when repo is present" requirement and the "Changes badge affordance" requirement) and by the result of a `GET /api/git/commits?path=<path>&limit=1` lookup:

- **Clean tracked file** (path absent from staged, unstaged, untracked; one or more commits exist): the strip displays `<short_sha> · <subject> · <author_name> · <relative-time>` followed by a "History" affordance linking to `/git/commits?path=<encoded path>&ref=<active ref>`. The short_sha and subject SHALL be linked to `/git/commits/<sha>`. The subject SHALL truncate with `text-overflow: ellipsis` when the strip is narrower than the content; the rest of the metadata SHALL remain visible.
- **Modified locally** (path present in staged or unstaged): the strip displays the same one-line commit summary as the clean state PLUS a status pill labelled `Modified locally` above the summary. The History affordance behaves identically to the clean state.
- **Untracked** (path present in untracked, or path is tracked but produced an empty commits response on the active ref): the strip displays a status pill labelled `Untracked` together with the message `No commits yet`. The History affordance SHALL still be present and SHALL link to `/git/commits?path=<encoded path>` (the commits-list page will render its own untracked banner).

The strip SHALL NOT render when `is_repo` is false. When the strip is in a non-clean state (modified locally or untracked), the status pill SHALL use the same visual treatment as the changes-badge pill (chrome from the documented SPA design-token vocabulary — see the "Git surfaces use the documented SPA design tokens" requirement).

On viewport widths below `768px`, the strip MAY wrap to two rows (status pill on the first row, commit summary on the second) to keep the layout readable on a 360 px viewport.

#### Scenario: Clean tracked file

- **WHEN** the file viewer renders `/view/internal/server/api.go` on a clean tracked file in a repo
- **THEN** the strip renders between the file head and the content area
- **AND** the strip body reads `<short_sha> · <subject> · <author_name> · <relative-time>`
- **AND** the History affordance is a link to `/git/commits?path=internal%2Fserver%2Fapi.go&ref=<active ref>`
- **AND** the short_sha is a link to `/git/commits/<sha>`

#### Scenario: Modified locally

- **WHEN** the file viewer renders `/view/internal/server/api.go` on a file present in the unstaged section of `/api/git/status`
- **THEN** the strip renders a `Modified locally` status pill above the commit summary
- **AND** the rest of the strip body matches the clean state

#### Scenario: Untracked file

- **WHEN** the file viewer renders `/view/notes.txt` on a file present in the untracked section of `/api/git/status`
- **THEN** the strip renders an `Untracked` status pill and the message `No commits yet`
- **AND** the History affordance links to `/git/commits?path=notes.txt`
- **AND** no commit metadata is shown (no short_sha, no author, no time)
- **AND** the SPA SHALL NOT issue the `GET /api/git/commits?path=<path>&limit=1` request for untracked files

#### Scenario: Not in a repo

- **WHEN** the served root has no `.git`
- **THEN** the file viewer renders no strip at all (no fetch, no DOM)

#### Scenario: Strip renders for all file kinds

- **WHEN** the file viewer renders an image file or a non-previewable file in a repo
- **THEN** the strip still renders in its appropriate state (clean / modified / untracked)
- **AND** the absence of an inline preview does not suppress the strip

### Requirement: Code and Blame tabs in the file viewer

For files whose preview kind is `text` (i.e. `kind === 'text'` in the `meta` response), the file viewer SHALL render a tablist above the content area with two tabs: "Code" and "Blame". The active tab SHALL be reflected in the URL via a `view` query parameter:
- absent or any value other than `blame` → Code tab active
- `view=blame` → Blame tab active

Activating a tab SHALL update the URL via the SPA router (no page reload). Reloading the page with `?view=blame` present SHALL restore the Blame tab.

The tablist SHALL follow standard ARIA tab-pattern semantics: `role="tablist"` on the container, `role="tab"` on each button, `aria-selected` on the active tab, left/right arrow keys move the active tab, Home/End jump to first/last.

For files whose preview kind is NOT `text` (markdown, image, non-previewable, or error), the tablist SHALL NOT render. A URL bearing `?view=blame` on such a file SHALL fall back silently to the existing Code-equivalent render (markdown render, image, fallback) with no error — the query parameter has no effect outside its supported scope.

#### Scenario: Tabs render for text files

- **WHEN** the file viewer renders `/view/internal/server/api.go` (`kind === 'text'`)
- **THEN** a tablist with Code and Blame tabs appears above the content area
- **AND** the Code tab is the default active tab

#### Scenario: Activating Blame writes the URL

- **WHEN** the user activates the Blame tab
- **THEN** the URL becomes `/view/internal/server/api.go?view=blame`
- **AND** the Blame view renders in place of `<CodeBlock>`

#### Scenario: Deep link restores Blame

- **WHEN** the SPA loads `/view/internal/server/api.go?view=blame`
- **THEN** the Blame tab is active on first paint
- **AND** the Blame view fetches its data

#### Scenario: Tabs absent on markdown

- **WHEN** the file viewer renders `/view/README.md`
- **THEN** no tablist is rendered
- **AND** the markdown renderer renders the file as before

#### Scenario: `?view=blame` on a non-text file is inert

- **WHEN** the file viewer renders `/view/logo.png?view=blame`
- **THEN** no tablist is rendered
- **AND** the image preview renders as if the parameter were absent
- **AND** no error message appears

### Requirement: Blame view rendering

The Blame view rendered by the file viewer's Blame tab SHALL show every working-tree line of the file paired with its blame attribution from `/api/git/blame`.

The view SHALL render the file content from `/raw/<path>` (the same source used by `<CodeBlock>`), paired by line number with the chunks from the blame response.

Each blame chunk SHALL render as a visually distinct section:
- **Committed chunks** SHALL display metadata `<short_sha> · <subject> · <author_name> · <relative-time>`. The short_sha and subject SHALL be linked to `/git/commits/<sha>`.
- **Uncommitted chunks** (`uncommitted: true` in the response) SHALL display the label `Working tree · uncommitted` in place of commit metadata, with no author, no timestamp, and no link. The chunk body SHALL render with a distinct background using a themed CSS custom property (e.g. `--blame-uncommitted-bg`) so the chunk reads as visually different from a committed chunk at a glance.

Within each chunk, lines SHALL render in order with a single-column line-number gutter. The gutter SHALL be 1-based and continuous across chunks (i.e. the first line of the second chunk is `chunk1.start_line + chunk1.line_count`). Per-line syntax highlighting SHALL use the shared `lowlight` instance from `web/src/components/syntax/grammars.ts` with the language derived from the file path via `extToLanguage` (the same per-line approximation already used by `DiffHunk`). When `extToLanguage` returns `null`, lines SHALL render as plain monospace text.

The Blame view SHALL respect the `localStorage["explorer.wrap"]` preference via the existing `useWrap` hook (no separate wrap toggle inside the Blame view — the file viewer's existing wrap toggle controls both Code and Blame views). When wrap is on, lines wrap inside the code cell; when off, the code cell scrolls horizontally and the line-number gutter (and, on viewports ≥768px, the chunk-metadata column) remain sticky-left in the same pattern used by the diff hunk gutter.

When the blame response has `dirty: true`, the Blame view SHALL render a `Modified locally` status pill above the chunk list — the same pill used by the last-commit strip.

The Blame view SHALL be responsive at the existing `768px` SPA layout breakpoint:
- **≥768px**: each chunk is a row with three columns — chunk metadata (left), line-number gutter, code cell. The metadata column SHALL be narrow enough that the code cell remains the dominant visual element (suggested width ~200–280 px; exact value SHALL be defined in CSS).
- **<768px**: each chunk's metadata stacks above its line range as a compact header strip. The line-number gutter and code cell remain side-by-side below the strip. This matches the "must work on mobile" constraint stated by the user.

#### Scenario: Committed chunks render the commit metadata

- **WHEN** the Blame view renders a committed chunk attributed to commit `abc1234`
- **THEN** the chunk's metadata cell shows `abc1234 · <subject> · <author_name> · <relative-time>`
- **AND** the short_sha is linked to `/git/commits/abc1234`

#### Scenario: Uncommitted chunks render the Working tree label

- **WHEN** the Blame view renders an uncommitted chunk (`uncommitted: true`)
- **THEN** the metadata cell reads `Working tree · uncommitted`
- **AND** no author, timestamp, or link is shown
- **AND** the chunk body has a visually distinct background driven by `--blame-uncommitted-bg`

#### Scenario: Line numbers are continuous across chunks

- **WHEN** the Blame view renders chunks with start_line/line_count of (1,5), (6,3), (9,2)
- **THEN** the line-number gutter reads 1..10 across the three chunks with no gap or repetition

#### Scenario: Modified-locally banner

- **WHEN** the Blame view renders a response with `dirty: true`
- **THEN** a `Modified locally` status pill appears above the chunk list
- **AND** the pill uses the same visual treatment as the file viewer strip's pill

#### Scenario: Wrap toggle is shared with the file viewer

- **WHEN** the user toggles wrap off in the file viewer's Code tab
- **AND** then switches to the Blame tab
- **THEN** the Blame tab also renders in wrap-off mode (the code cell scrolls horizontally)
- **AND** in wrap-off the line-number gutter remains sticky-left while the code cell scrolls

#### Scenario: Sticky-left on desktop pins both metadata and gutter

- **WHEN** the user views the Blame tab at viewport width ≥768px with wrap off
- **AND** scrolls a chunk's code cell horizontally
- **THEN** the chunk-metadata column AND the line-number gutter both remain pinned to the left edge of the visible viewport
- **AND** only the code cell scrolls

#### Scenario: Mobile layout stacks metadata above lines

- **WHEN** the user views the Blame tab at viewport width below 768px
- **THEN** each chunk renders its metadata as a header strip above its line range
- **AND** the line range renders below in a two-column layout (gutter + code cell)
- **AND** no horizontal scrolling is required to see the metadata

#### Scenario: Untracked empty state

- **WHEN** the user activates the Blame tab on a file the blame endpoint reports as `not_found` because it is untracked
- **THEN** the view renders an empty state reading `This file is untracked. No blame available.`
- **AND** an "Open History" affordance links to `/git/commits?path=<encoded path>`
- **AND** no chunk is rendered

#### Scenario: Timeout empty state

- **WHEN** the blame endpoint responds with `blame_timeout`
- **THEN** the Blame view renders an empty state distinct from the generic internal-error state
- **AND** the empty state surfaces the "Open History" affordance as a fallback path
- **AND** no chunk is rendered

#### Scenario: Unknown language falls back to plain monospace

- **WHEN** the Blame view renders a file whose extension has no registered grammar (`extToLanguage` returns `null`)
- **THEN** the code cell renders as plain monospace text with no `hljs-*` token spans
- **AND** chunk grouping and the line-number gutter are unaffected

### Requirement: Commits list view supports path filter

The commits-list view at `/git/commits` SHALL accept an optional `path` query parameter (URL-encoded repo-relative path). When present:

- The view SHALL pass `path` to the `/api/git/commits` request alongside the existing `ref` and `cursor` parameters.
- The view SHALL render a sticky banner row above the commit list reading `Commits affecting <path>`, with `<path>` rendered as an inline `<code>` element. The banner SHALL include a `[× clear]` affordance that navigates to `/git/commits` preserving the active `ref` (i.e. removes `path` and keeps `ref`).
- If the working-tree status (read from the same `/api/git/status` data the changes badge uses) reports the path as `staged`, `unstaged`, or `untracked`, the view SHALL render a single status row directly below the banner using the same status pill the file viewer's strip uses (`Modified locally` or `Untracked`). For `untracked`, the view SHALL also render an info line reading `This file is not yet tracked by git.`
- If the filtered response is empty AND the working-tree status is `clean`, the view SHALL render an empty state reading `No commits have touched <path> on this ref.`
- The "Load older commits" pager SHALL continue to function and SHALL forward the `path` parameter on subsequent requests.

When `path` is absent, the view's behaviour SHALL be unchanged from the previously specified commits-list view.

#### Scenario: Banner renders with the filter path

- **WHEN** the SPA navigates to `/git/commits?path=internal%2Fserver%2Fapi.go`
- **THEN** a sticky banner appears above the commit list reading `Commits affecting internal/server/api.go`
- **AND** a `[× clear]` affordance is visible in the banner

#### Scenario: Clear filter preserves ref

- **WHEN** the user is on `/git/commits?path=internal%2Fserver%2Fapi.go&ref=feature%2Fx`
- **AND** activates the `[× clear]` affordance
- **THEN** the SPA navigates to `/git/commits?ref=feature%2Fx`
- **AND** the banner and any status row disappear

#### Scenario: Modified-locally status row

- **WHEN** the SPA renders `/git/commits?path=<file>` and the file appears in `/api/git/status`'s `unstaged`
- **THEN** a status row with a `Modified locally` pill appears directly below the banner
- **AND** the commit list renders below the status row

#### Scenario: Untracked status with empty list

- **WHEN** the SPA renders `/git/commits?path=<file>` and the file is in `/api/git/status`'s `untracked`
- **THEN** a status row with an `Untracked` pill appears directly below the banner
- **AND** an info line reads `This file is not yet tracked by git.`
- **AND** no commit cards render
- **AND** the "Load older commits" pager does not render

#### Scenario: Filtered empty list on a tracked file

- **WHEN** the SPA renders `/git/commits?path=<file>&ref=<ref>` and the response is empty while the file is clean and tracked
- **THEN** the empty state reads `No commits have touched <file> on this ref.`
- **AND** no status pill is rendered

#### Scenario: Pager forwards path

- **WHEN** the initial response includes `next_cursor`
- **AND** the user activates "Load older commits"
- **THEN** the SPA fetches `/api/git/commits?path=<file>&ref=<ref>&cursor=<next_cursor>`
- **AND** the appended commits are also filtered to those touching `<file>`
