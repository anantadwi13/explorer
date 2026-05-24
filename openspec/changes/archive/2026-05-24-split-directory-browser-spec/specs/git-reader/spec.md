## MODIFIED Requirements

### Requirement: Lazy hunk endpoint

The server SHALL expose `GET /api/git/patch` returning unified-diff hunks for a single file, paginated by hunk index.

Query parameters:
- `source` (required — one of `commit`, `staged`, `unstaged`).
- `sha` (required when `source=commit`; rejected otherwise).
- `path` (required — repo-relative path; for renamed files, this SHALL be the `new_path` from the commit/status response, or for deletions the `old_path`).
- `hunk_offset` (optional — default 0).
- `hunk_limit` (optional — default 3, maximum 50).

The response SHALL be a JSON object with fields:
- `path`, `is_binary`, `total_hunks` (integer).
- `hunks` — array of hunk objects: `{old_start, old_lines, new_start, new_lines, header, lines}` where `header` is the text after `@@ ... @@` on the hunk header line (may be empty), and `lines` is an array of `{type, text}` with `type` one of `context`, `add`, `del`. The trailing newline on each line is stripped from `text`.
- `next_hunk_offset` (integer or null).
- `more_available` (boolean) — true iff there are hunks the client has not yet seen.

The server SHALL enforce a defensive bound: a single response SHALL NOT include more than ~512 KiB of patch text (summed across all returned `lines.text` and `header` fields). If the requested batch would exceed the bound, the server SHALL return fewer hunks (never breaking a hunk mid-way) and set `more_available: true`. In the pathological case where one hunk alone exceeds the bound, that hunk SHALL still be returned (a single oversized hunk is preferable to a stuck client).

For binary files, the server SHALL respond with `is_binary: true`, `total_hunks: 0`, `hunks: []`, `next_hunk_offset: null`, `more_available: false`. The SPA never expands binary files inline.

The `path` parameter is a repo-relative path interpreted against git's object tree. It is NOT a filesystem path and is NOT routed through the path-resolver `resolver.Resolve` chokepoint. Path-escape (`..`, absolute paths) is prevented by go-git's pathspec rules, which forbid such paths at the lookup layer.

#### Scenario: First batch of hunks for a commit file

- **WHEN** a request arrives at `GET /api/git/patch?source=commit&sha=abc1234&path=internal/x.go&hunk_offset=0&hunk_limit=3`
- **AND** the file has 7 hunks in that commit
- **THEN** the response is HTTP 200 with the first 3 hunks
- **AND** `total_hunks: 7`, `next_hunk_offset: 3`, `more_available: true`

#### Scenario: Last batch of hunks

- **WHEN** a follow-up request arrives at `hunk_offset=6&hunk_limit=3` for the same 7-hunk file
- **THEN** the response contains 1 hunk
- **AND** `next_hunk_offset: null`, `more_available: false`

#### Scenario: Staged file patch

- **WHEN** a request arrives at `GET /api/git/patch?source=staged&path=internal/x.go`
- **AND** the file has staged changes
- **THEN** the response contains hunks representing the diff between HEAD and the index for that file

#### Scenario: Unstaged file patch

- **WHEN** a request arrives at `GET /api/git/patch?source=unstaged&path=internal/x.go`
- **THEN** the response contains hunks representing the diff between the index and the working tree for that file

#### Scenario: Binary file patch request

- **WHEN** a request arrives for a binary file (e.g., `logo.png`)
- **THEN** the response has `is_binary: true`, `total_hunks: 0`, `hunks: []`

#### Scenario: Defensive byte cap with multiple hunks

- **WHEN** the requested hunk batch would exceed the ~512 KiB defensive bound
- **THEN** the server returns fewer hunks than requested (never breaking mid-hunk)
- **AND** `more_available: true`
- **AND** the next page picks up from the first unreturned hunk

#### Scenario: Single oversized hunk

- **WHEN** a single hunk alone exceeds the ~512 KiB bound
- **AND** the client requests it
- **THEN** that single hunk is returned in isolation
- **AND** `more_available` reflects whether further hunks exist after it

#### Scenario: Unknown path

- **WHEN** a request arrives with `path=` for a file not present in the requested commit/index
- **THEN** the response is a typed `not_found` error (HTTP 404)

#### Scenario: `source=commit` without `sha`

- **WHEN** a request arrives at `GET /api/git/patch?source=commit&path=x.go` with no `sha`
- **THEN** the response is HTTP 400 with a typed error

#### Scenario: `source=staged` or `unstaged` with `sha`

- **WHEN** a request arrives at `GET /api/git/patch?source=staged&sha=abc&path=x.go`
- **THEN** the response is HTTP 400 with a typed error (`sha` is rejected when source is not `commit`)

#### Scenario: Path traversal attempt

- **WHEN** a request arrives with `path=../../etc/passwd`
- **THEN** the response is a typed `not_found` error (HTTP 404) — go-git's pathspec rules reject the lookup
- **AND** no filesystem access occurs outside the served root

### Requirement: Typed errors for git endpoints

The git-reader capability SHALL extend the JSON-error union with two new error kinds: `not_a_repo` (HTTP 404 — the served root has no `.git` at its top level) and `unknown_ref` (HTTP 404 — the requested ref, branch, tag, or sha does not exist in the repository).

Existing error kinds (`not_found`, `internal_error`, etc., as defined by the http-api capability) SHALL be reused where applicable on `/api/git/*`. The SPA's `ApiError` union SHALL mirror these additions.

Error responses SHALL follow the existing `{error: "<kind>", message: "..."}` JSON shape with the appropriate HTTP status code.

#### Scenario: `not_a_repo` shape

- **WHEN** a request arrives at any `/api/git/*` endpoint (except `/info`) on a non-repo served root
- **THEN** the response is HTTP 404
- **AND** the body is JSON `{"error": "not_a_repo", "message": "<descriptive>"}`

#### Scenario: `unknown_ref` shape

- **WHEN** a request arrives at `GET /api/git/commits?ref=nonexistent`
- **THEN** the response is HTTP 404
- **AND** the body is JSON `{"error": "unknown_ref", "message": "<descriptive>"}`

### Requirement: Working-tree status view

The SPA SHALL serve a working-tree status view at `/git/status` that renders the response from `/api/git/status` in three sections: **Staged**, **Unstaged**, **Untracked**.

The Staged and Unstaged sections SHALL render file rows using the same collapsible-card pattern as the commit detail view, with the same lazy-hunk loading via `/api/git/patch?source=staged|unstaged&path=<path>`. The first 3 entries (combined across staged + unstaged in source order) SHALL be auto-expanded on first paint.

The Untracked section SHALL render each entry as a non-expandable row whose path is a link to the web-ui file viewer at `/view/<path>`. Activating the link SHALL open the target in a new browser tab (`target="_blank"` with `rel="noopener noreferrer"`), so the user keeps the status page in their original tab. No diff is rendered for untracked entries (the file is not tracked by git).

When all three sections are empty, the view SHALL render a "No local changes" empty state.

#### Scenario: Mixed status

- **WHEN** the SPA navigates to `/git/status` with 2 staged, 1 unstaged, 1 untracked
- **THEN** all three sections render with the expected counts in their headers
- **AND** the first 3 entries (across staged + unstaged) are auto-expanded with hunks

#### Scenario: Clean working tree

- **WHEN** the SPA navigates to `/git/status` and there are no changes
- **THEN** the view renders a "No local changes" empty state

#### Scenario: Loading hunks for a staged file

- **WHEN** the user expands a staged file row
- **THEN** the SPA fetches `/api/git/patch?source=staged&path=<path>&hunk_offset=0&hunk_limit=3` and renders the hunks

#### Scenario: Untracked file row links to the file viewer in a new tab

- **WHEN** the working tree contains an untracked file `new.txt`
- **THEN** the Untracked section shows a row with the path
- **AND** the path is rendered as a link whose `href` is `/view/new.txt`
- **AND** the link has `target="_blank"` and `rel="noopener noreferrer"` so it opens in a new tab without granting the new tab access to the opener
- **AND** the row itself is not expandable (no hunk loader, no diff)

### Requirement: Diff rendering rules

In commit detail and status views, rendered hunks SHALL follow these rules:

- Unified diff format only (no side-by-side).
- The hunk header (`@@ -O,L +N,L @@ <header>`) is displayed above each hunk's lines.
- Each line is rendered in a fixed-pitch font with a leading single-character marker indicating its type: a space for context, `+` for additions, `−` for deletions.
- Line backgrounds are themed via CSS custom properties: a light-green tint for additions, a light-red tint for deletions, default for context. The exact colours follow the active theme (light, dark, system) using the same custom-property pattern as the existing file viewer.
- Source lines SHALL be syntax-highlighted using the same shared `lowlight` instance the file viewer uses (`web/src/components/syntax/grammars.ts`), with the language detected from the file path via the same `extToLanguage` helper. Highlighting is performed *per line* (the SPA does not have the surrounding file context), which is a known approximation for multi-line constructs (e.g. long string literals) but matches how widely-used diff viewers behave. When the file path has no registered grammar (`extToLanguage` returns `null`), lines render as plain monospace text.
- The single-character `+`/`−`/space marker SHALL remain outside the highlighted span so its colour is driven by the diff palette, not the language grammar.
- Long lines wrap inside the hunk block by default (no horizontal scroll on the page).
- The commit detail and status views SHALL expose a wrap/no-wrap toggle button in their page header (same `WrapIcon` button used by the web-ui file viewer). The current wrap state SHALL be read from and written to the existing `localStorage["explorer.wrap"]` key via the existing `useWrap` hook — so toggling wrap inside the file viewer and inside the diff views shares one global preference (single key, no surprise). When wrap is OFF, hunk bodies SHALL allow horizontal scroll instead of wrapping (`white-space: pre` + `overflow-x: auto`). When wrap is ON (the default), behaviour matches the previous bullet (no horizontal scroll on the page).

#### Scenario: Line backgrounds by theme

- **WHEN** a hunk is rendered under `[data-theme="light"]`
- **THEN** additions render with the light-mode green tint and deletions with the light-mode red tint

- **WHEN** the user switches to `[data-theme="dark"]`
- **THEN** the same hunk re-renders with the dark-mode green and red tints via the CSS custom properties

#### Scenario: Syntax highlighting follows the file's grammar

- **WHEN** a hunk for `internal/server/api.go` is rendered
- **THEN** the lines are tokenised with the registered Go grammar
- **AND** keyword / string / comment tokens carry the same `hljs-*` class names used by the file viewer
- **AND** the `+`/`−` line marker is a sibling span outside the highlighted content, so it picks up the diff palette colour and not a grammar colour

#### Scenario: Unknown language falls back to plain monospace

- **WHEN** a hunk for `notes.foobar` is rendered (the extension has no grammar registered)
- **THEN** the lines render as plain monospace text with no `hljs-*` token spans

#### Scenario: Long line wraps inside the hunk block

- **WHEN** a line in a hunk is wider than the viewport
- **AND** the wrap preference is ON (the default)
- **THEN** the line wraps inside the hunk block
- **AND** the page itself does not scroll horizontally

#### Scenario: Toggling wrap off enables horizontal scroll inside hunks

- **WHEN** the user activates the wrap toggle in the commit detail or status page header
- **AND** wrap was previously ON
- **THEN** the wrap preference becomes OFF
- **AND** every rendered hunk body switches to `white-space: pre` with horizontal scroll inside the hunk block
- **AND** the preference persists across page reloads via `localStorage["explorer.wrap"]`
- **AND** the file viewer (when next opened on a text file) reads the same preference, so the wrap state is shared across both surfaces

#### Scenario: Wrap toggle does not render on web-ui routes

- **WHEN** the SPA is on a web-ui folder URL (`/` or `/view/<path>/`)
- **THEN** no diff wrap toggle is present in the toolbar
- **AND** the existing file-viewer wrap toggle (for `kind === 'text'` files) is unchanged

### Requirement: Git surfaces use the documented SPA design tokens

All git-reader SPA surfaces — `BranchPicker`, `ChangesBadge`, `FileDiffCard`, `DiffHunk` chrome (the hunk container, header, borders, and pager — distinct from the +/− line-tint backgrounds covered by the "Diff rendering rules" requirement), `CommitsListPage`, `CommitDetailPage`, and `StatusPage` — SHALL paint their backgrounds, borders, foreground text, padding, radii, shadows, and fonts using the documented SPA design-token vocabulary defined in the `web-ui` capability's "SPA design tokens" requirement.

Git-reader component CSS SHALL NOT introduce ad-hoc token names via `var(--newname, <hardcoded-fallback>)` patterns. The historical regression that motivated this requirement (BranchPicker dropdown menu items invisible in light theme because `var(--bg-1, #1a1a1a)` fell back to a dark value) is the class of bug this rule prevents.

This requirement is additive to the existing "Diff rendering rules" requirement:

- "Diff rendering rules" governs the *inside* of a hunk — line backgrounds (`--color-diff-add-bg` / `--color-diff-del-bg`), markers, syntax highlighting, and wrap.
- This requirement governs the *outside* — the card frame around a file diff, the hunk container border, the page padding on commit detail / commits list / status, the branch picker popover surface, the changes badge pill — all of which use the standard chrome tokens (`--bg-panel`, `--line`, `--fg`, etc.).

When a new git-reader surface is added in the future, it SHALL follow the same rule: chrome from the documented vocabulary, diff-internal coloring from the existing diff/syntax requirements.

#### Scenario: Branch picker popover uses documented tokens

- **WHEN** the branch picker dropdown is opened under `[data-theme="light"]`
- **THEN** the popover surface, item text, hover background, border, and shadow all resolve to the light-theme values of the documented vocabulary
- **AND** the menu items are visible (no dark-on-dark or light-on-light text)

- **WHEN** the user switches the theme to dark
- **AND** re-opens the branch picker
- **THEN** every chrome surface in the popover re-renders with the dark-theme values of the same tokens

#### Scenario: File diff card frame uses documented tokens

- **WHEN** a commit detail page renders one or more `FileDiffCard` components
- **THEN** the card border, hover state, expanded-body separator, badge backgrounds, and pager button all resolve to tokens from the documented vocabulary
- **AND** the +/− line tints inside each hunk are still driven by `--color-diff-add-bg` / `--color-diff-del-bg` per the "Diff rendering rules" requirement (no conflict — the two requirements address different surfaces)

#### Scenario: Status page chrome uses documented tokens

- **WHEN** the status page renders staged, unstaged, and untracked sections
- **THEN** the section borders, untracked-row backgrounds, link hover states, and page padding all resolve to tokens from the documented vocabulary

#### Scenario: New git surface follows the rule

- **WHEN** a new git-reader page or component is added (e.g. a tag detail view, a stash list)
- **THEN** its CSS uses only tokens from the documented vocabulary for chrome
- **AND** introduces no `var(--newname, <fallback>)` references with ad-hoc names

### Requirement: Keyboard shortcuts on git pages

On `/git/commits`, `/git/commits/<sha>`, and `/git/status`, keyboard shortcuts SHALL behave as follows (preserving the existing "inert when typing in an input/textarea" rule):

- `/` SHALL be a no-op on git pages (the web-ui search field is not present).
- `Escape` SHALL navigate "up one level" within git navigation: on `/git/commits/<sha>` it navigates to `/git/commits` (preserving the current `?ref=` if any); on `/git/commits` and `/git/status` it navigates to the most recently visited folder route (or the root `/` if none).
- `Backspace` SHALL behave identically to `Escape` on `/git/commits/<sha>`. On the top-level git pages (`/git/commits`, `/git/status`) it SHALL be a no-op (the browser's default back-navigation SHALL be prevented to match the existing folder-page behaviour).

#### Scenario: Escape from commit detail

- **WHEN** the user is on `/git/commits/abc1234?ref=feature%2Fx` with no input focused
- **AND** presses `Escape`
- **THEN** the SPA navigates to `/git/commits?ref=feature%2Fx`

#### Scenario: Escape from commits list returns to folder

- **WHEN** the user navigated from `/view/docs/` to `/git/commits` and is on the commits list
- **AND** presses `Escape`
- **THEN** the SPA navigates back to `/view/docs/`

#### Scenario: Backspace on commits list inert

- **WHEN** the user is on `/git/commits` with no input focused
- **AND** presses `Backspace`
- **THEN** the SPA does not navigate
- **AND** the browser's default back-navigation does not occur

#### Scenario: Slash is no-op on git pages

- **WHEN** the user is on any `/git/*` route with no input focused
- **AND** presses `/`
- **THEN** focus does not move
- **AND** no `/` character is inserted anywhere

### Requirement: Path semantics declaration

The `path` parameter on `/api/git/*` endpoints SHALL be interpreted as a **repo-relative path into the git object tree**, NOT as a filesystem path. The path-resolver path-traversal resolver (`resolver.Resolve`) SHALL NOT be applied to `/api/git/*` requests. Escape (`..`, absolute paths) SHALL be prevented at the git lookup layer — go-git's pathspec rules reject such paths, returning a "file not found" outcome that the server SHALL map to the typed `not_found` error.

This is a deliberate departure from the path-resolver security pattern. It is correct because: (a) git paths address a *different* object space than the filesystem; (b) requiring a working-tree resolution would break legitimate queries for files deleted in HEAD or files in arbitrary historical commits; (c) the analogous chokepoint exists inside go-git.

#### Scenario: Filesystem path escape rejected at git layer

- **WHEN** a request arrives at `GET /api/git/patch?source=commit&sha=abc1234&path=../../etc/passwd`
- **THEN** go-git's pathspec lookup fails
- **AND** the response is a typed `not_found` error (HTTP 404)
- **AND** no filesystem access occurs outside `.git/`

#### Scenario: Absolute path rejected

- **WHEN** a request arrives at `GET /api/git/patch?source=staged&path=/etc/passwd`
- **THEN** the response is a typed `not_found` error
- **AND** no filesystem access outside the served root occurs

### Requirement: Non-goals declared

The git-reader capability SHALL NOT, in this version, implement the following — they are explicit non-goals:

- Any write operation (no `checkout`, `commit`, `stage`, `fetch`, `push`, `merge`, `rebase`, `cherry-pick`, etc.).
- Submodule traversal (submodules SHALL appear as plain directories from the web-ui side, with no nested git context).
- Stash listing or browsing.
- Blame.
- Log search (searching commit messages, content, or paths).
- Ref-to-ref compare (e.g. `main...feature`).
- Tags as a routed view (tags SHALL appear in the refs dropdown only).
- A "view file content at commit" endpoint. In particular, the existing `/raw/<path>` endpoint SHALL NOT be extended with a `?ref=` or `?sha=` query parameter — the http-api spec's existing requirement that `/raw/` "SHALL NOT inspect query parameters or headers to alter its behaviour" remains binding. If such a feature is added in the future, it SHALL be a new endpoint (e.g., `/api/git/blob`) rather than an extension of `/raw/`.
- Caching of any kind. Every request SHALL invoke go-git fresh.
- Live updates when the repository changes outside `explorer` (no SSE, no polling). A page reload picks up new state.

#### Scenario: `/raw/` query-param rule preserved

- **WHEN** a request arrives at `GET /raw/some/file.txt?ref=abc1234`
- **THEN** the `?ref=` query parameter is ignored
- **AND** the response is the current working-tree bytes (or an existing error if the path is invalid)
- **AND** behaviour matches the existing `/raw/` requirement exactly
