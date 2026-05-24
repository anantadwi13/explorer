# git-reader Specification

## Purpose

The git-reader capability extends `explorer` with read-only git history and working-tree browsing when the served root is itself a git repository. It exposes `/api/git/*` HTTP endpoints (repo gate, refs, commit history, commit detail, working-tree status, lazy hunks) and SPA views (`/git/commits`, `/git/commits/<sha>`, `/git/status`) with branch-picker and changes-badge affordances. The capability is gated on the presence of `.git` at the served root, never performs any write operation, and pages large responses (commits, files, hunks) so the UI stays responsive on large repositories.

## Requirements

### Requirement: Repository gate at the served root

The git-reader capability SHALL be available only when the served root contains an entry named `.git` at its top level — either a directory, or a regular file resolvable as a git directory pointer (per `git worktree` semantics, parseable via `go-git`'s `PlainOpen`). The capability SHALL NOT walk ancestor directories looking for a `.git`.

When the gate is satisfied, the server SHALL expose the `/api/git/*` endpoints described in subsequent requirements. When the gate is not satisfied, every `/api/git/*` endpoint SHALL respond with a typed `not_a_repo` error (HTTP 404), and the SPA SHALL hide every git affordance.

The gate SHALL be re-evaluated on every request (no startup caching), so adding or removing `.git` while the server runs takes effect on the next request.

#### Scenario: Served root has a `.git` directory

- **WHEN** the served root contains a directory named `.git` at its top level
- **AND** a request arrives at `GET /api/git/info`
- **THEN** the response is HTTP 200 with `is_repo: true`
- **AND** subsequent `/api/git/*` requests are served according to their respective requirements

#### Scenario: Served root has a `.git` worktree pointer file

- **WHEN** the served root contains a regular file named `.git` whose contents begin with `gitdir: ` and reference a valid git directory (per `git worktree` semantics)
- **AND** a request arrives at `GET /api/git/info`
- **THEN** the response is HTTP 200 with `is_repo: true`
- **AND** the capability behaves identically to the directory `.git` case

#### Scenario: Served root has no `.git`

- **WHEN** the served root has no `.git` entry at its top level
- **AND** a request arrives at any `/api/git/*` endpoint
- **THEN** the response is a typed `not_a_repo` error (HTTP 404)
- **AND** `GET /api/git/info` specifically returns HTTP 200 with `is_repo: false` (rather than `not_a_repo`), so the SPA can distinguish "no repo" from a server error

#### Scenario: `.git` exists only in an ancestor of the served root

- **WHEN** the served root is `/repo/cmd/explorer` and `.git` exists at `/repo/` but not at `/repo/cmd/explorer/`
- **AND** a request arrives at any `/api/git/*` endpoint
- **THEN** the response is a typed `not_a_repo` error (HTTP 404)
- **AND** `GET /api/git/info` returns `is_repo: false`

### Requirement: Repository info endpoint

The server SHALL expose `GET /api/git/info` returning the current high-level repository state, used by the SPA on first paint to decide whether to render git affordances.

The response SHALL be a JSON object with fields `is_repo` (boolean), `head_ref` (string or null — the symbolic ref name like `refs/heads/main`, with the `refs/heads/` prefix preserved), `head_sha` (string or null — the full 40-character sha HEAD points at), and `detached` (boolean — true when HEAD points directly at a commit rather than a symbolic ref).

#### Scenario: Normal repository on a branch

- **WHEN** the repository's HEAD points at `refs/heads/main` and `main` resolves to commit `abc1234...`
- **AND** a request arrives at `GET /api/git/info`
- **THEN** the response is HTTP 200 with `is_repo: true`, `head_ref: "refs/heads/main"`, `head_sha: "abc1234..."`, `detached: false`

#### Scenario: Detached HEAD

- **WHEN** the repository's HEAD is detached and points directly at commit `def5678...`
- **AND** a request arrives at `GET /api/git/info`
- **THEN** the response is HTTP 200 with `is_repo: true`, `head_ref: null`, `head_sha: "def5678..."`, `detached: true`

#### Scenario: Empty repository

- **WHEN** the repository has been initialised with `git init` and no commits exist
- **AND** a request arrives at `GET /api/git/info`
- **THEN** the response is HTTP 200 with `is_repo: true`, `head_ref: null`, `head_sha: null`, `detached: false`

#### Scenario: No repository

- **WHEN** the served root has no `.git`
- **AND** a request arrives at `GET /api/git/info`
- **THEN** the response is HTTP 200 with body `{"is_repo": false}` exactly
- **AND** the fields `head_ref`, `head_sha`, and `detached` are omitted from the response body (not present as `null`), so the SPA can model `GitInfo` as a discriminated union on `is_repo`

### Requirement: Refs listing endpoint

The server SHALL expose `GET /api/git/refs` returning all local branches and tags in the repository.

The response SHALL be a JSON object with fields `branches` (array of `{name, sha}` where `name` is the bare branch name without the `refs/heads/` prefix) and `tags` (array of `{name, sha}` where `name` is the bare tag name without the `refs/tags/` prefix). The arrays SHALL be sorted case-insensitively by name. Remote-tracking branches (`refs/remotes/*`) SHALL be excluded.

For annotated tags, `sha` SHALL be the sha of the commit the tag ultimately resolves to (peeled), not the sha of the tag object itself.

#### Scenario: Listing branches and tags

- **WHEN** the repository has branches `main`, `feature/x`, `release/v1.0` and tags `v1.0.0`, `v0.9.0`
- **AND** a request arrives at `GET /api/git/refs`
- **THEN** the response is HTTP 200 with `branches` containing 3 entries (sorted case-insensitively) and `tags` containing 2 entries (sorted case-insensitively)
- **AND** each entry has a `name` (bare, no `refs/` prefix) and a `sha` (full 40-character hex)

#### Scenario: Empty repository has no refs

- **WHEN** the repository has been initialised but has no commits and no refs
- **AND** a request arrives at `GET /api/git/refs`
- **THEN** the response is HTTP 200 with `branches: []` and `tags: []`

#### Scenario: Annotated tag is peeled to commit sha

- **WHEN** the repository contains an annotated tag `v1.0.0` whose tag object resolves to commit `abc1234...`
- **AND** a request arrives at `GET /api/git/refs`
- **THEN** the tag entry's `sha` is `abc1234...` (the commit sha), not the sha of the annotated-tag object itself

#### Scenario: Remote-tracking branches excluded

- **WHEN** the repository contains `refs/remotes/origin/main` in addition to local `refs/heads/main`
- **AND** a request arrives at `GET /api/git/refs`
- **THEN** only `main` appears in `branches` (no `origin/main`)

### Requirement: Commit history endpoint (cursor-based)

The server SHALL expose `GET /api/git/commits` returning commits reachable from a ref, paginated cursor-based.

Query parameters: `ref` (optional — defaults to HEAD; SHALL be a branch name, tag name, or full sha; SHALL match git's ref-name rules), `cursor` (optional — a full or short sha; if present, the returned page starts from the commit *strictly older* than the cursor commit), `limit` (optional — default 30, maximum 100; values above 100 SHALL be clamped to 100).

The response SHALL be a JSON object with fields `commits` (array of commit summaries, each `{sha, short_sha, author_name, author_email, author_time, subject, body}` where `sha` is the full 40-character hex, `short_sha` is the 7-character prefix, `author_time` is RFC 3339, `subject` is the first line of the commit message and `body` is the remainder after a blank line — empty string if no body) and `next_cursor` (sha to pass as `cursor` to retrieve the next page, or null if the last commit has been returned).

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

### Requirement: Commit detail endpoint (file pagination)

The server SHALL expose `GET /api/git/commit` returning a single commit's metadata and the list of files it changed, with file-list pagination.

Query parameters: `sha` (required — full or short sha matching `[0-9a-f]{4,64}`), `file_offset` (optional — default 0), `file_limit` (optional — default 50, maximum 200).

The response SHALL be a JSON object with these top-level fields:
- `sha`, `short_sha`, `author_name`, `author_email`, `author_time`, `committer_name`, `committer_email`, `committer_time`, `subject`, `body`, `parents` (array of full parent shas).
- `total_files` (integer) — the total number of files in the commit (across all pages).
- `total_additions`, `total_deletions` (integers) — summed across all files in the commit.
- `files` (array of file entries for the requested page) — each entry is `{status, old_path, new_path, additions, deletions, is_binary, old_size, new_size}` where `status` is one of `A` (added), `M` (modified), `D` (deleted), `R` (renamed); `old_path` is null for additions; `new_path` is null for deletions; `old_size` and `new_size` are present only when `is_binary` is true.
- `next_file_offset` (integer or null) — the offset to pass to retrieve the next page, or null if the page returned is the last.

Merge commits SHALL be diffed against their **first parent** only. The spec deliberately does NOT diff against all parents.

#### Scenario: Commit on the default branch

- **WHEN** a request arrives at `GET /api/git/commit?sha=abc1234`
- **THEN** the response is HTTP 200 with all metadata fields populated
- **AND** `parents` is an array containing the one or more parent shas
- **AND** `files` contains up to 50 file entries
- **AND** `total_files` reflects the full commit size regardless of pagination

#### Scenario: File-list pagination

- **WHEN** a commit touches 234 files and a request arrives with `file_offset=0&file_limit=50`
- **THEN** the response contains the first 50 file entries
- **AND** `next_file_offset` is 50
- **AND** a follow-up request with `file_offset=200&file_limit=50` returns the last 34 entries with `next_file_offset: null`

#### Scenario: File addition

- **WHEN** a commit adds a new file `newfile.txt`
- **THEN** that file's entry has `status: "A"`, `old_path: null`, `new_path: "newfile.txt"`

#### Scenario: File deletion

- **WHEN** a commit deletes file `oldfile.txt`
- **THEN** that file's entry has `status: "D"`, `old_path: "oldfile.txt"`, `new_path: null`

#### Scenario: File rename

- **WHEN** a commit renames `a/old.txt` to `b/new.txt`
- **THEN** that file's entry has `status: "R"`, `old_path: "a/old.txt"`, `new_path: "b/new.txt"`

#### Scenario: Binary file

- **WHEN** a commit modifies a binary file `logo.png` (old size 4096, new size 6144)
- **THEN** that file's entry has `is_binary: true`, `additions: 0`, `deletions: 0`, `old_size: 4096`, `new_size: 6144`

#### Scenario: Merge commit

- **WHEN** a request arrives for a merge commit with two parents
- **THEN** the file list is computed by diffing the commit against its **first** parent
- **AND** `parents` lists both parent shas in the order git records them

#### Scenario: Empty commit

- **WHEN** a request arrives for a commit created with `--allow-empty` (no file changes)
- **THEN** the response is HTTP 200 with `files: []`, `total_files: 0`, `total_additions: 0`, `total_deletions: 0`

#### Scenario: Unknown sha

- **WHEN** a request arrives at `GET /api/git/commit?sha=deadbeef` and no such commit exists
- **THEN** the response is a typed `unknown_ref` error (HTTP 404)

#### Scenario: Invalid sha format

- **WHEN** a request arrives at `GET /api/git/commit?sha=notahex`
- **THEN** the response is HTTP 404 with a typed `unknown_ref` error
- **AND** no go-git object lookup is performed (the input is rejected by the `[0-9a-f]{4,64}` validator first)

### Requirement: Working-tree status endpoint

The server SHALL expose `GET /api/git/status` returning the current working-tree state grouped by index.

The response SHALL be a JSON object with fields `staged`, `unstaged`, `untracked`, where:
- `staged` is an array of file headers (same shape as `commit.files` entries) representing changes between HEAD and the index.
- `unstaged` is an array of file headers representing changes between the index and the working tree.
- `untracked` is an array of `{path}` objects naming files in the working tree that are not tracked by git.

The endpoint SHALL NOT paginate (working-tree changes are normally small).

The endpoint SHALL NOT crash when the repository is in a conflicted or merging state. Conflicted entries MAY be omitted from the response or surfaced under an additional `conflicted` array; either is acceptable for v1. The endpoint SHALL respond with HTTP 200 even when conflicts are present.

#### Scenario: Normal working tree with mixed changes

- **WHEN** the repository has 2 staged modifications, 1 unstaged modification, and 1 untracked file
- **AND** a request arrives at `GET /api/git/status`
- **THEN** the response is HTTP 200 with `staged` containing 2 entries, `unstaged` containing 1 entry, `untracked` containing 1 entry

#### Scenario: Clean working tree

- **WHEN** the working tree has no changes
- **AND** a request arrives at `GET /api/git/status`
- **THEN** the response is HTTP 200 with `staged: []`, `unstaged: []`, `untracked: []`

#### Scenario: Staged new file

- **WHEN** a brand-new file `new.txt` has been `git add`-ed but never committed
- **AND** a request arrives at `GET /api/git/status`
- **THEN** the file appears in `staged` with `status: "A"`, `old_path: null`, `new_path: "new.txt"`

#### Scenario: Repository in conflicted state

- **WHEN** the repository is in the middle of a merge with conflicted files
- **AND** a request arrives at `GET /api/git/status`
- **THEN** the response is HTTP 200 (no crash)
- **AND** conflicted entries are either omitted from the listings or surfaced under a `conflicted` array

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

### Requirement: Input validation for ref and sha parameters

The server SHALL validate string inputs before passing them to go-git:
- `sha` parameters SHALL match `[0-9a-f]{4,64}` (case-insensitive). Inputs that fail this check SHALL respond with a typed `unknown_ref` error at HTTP 404.
- `ref` parameters SHALL conform to git's ref-name rules (no leading `-`, no `..`, no ASCII control characters, no `~^:?*[\`, no leading or trailing `/`, etc.). Inputs that fail validation SHALL respond with a typed `unknown_ref` error at HTTP 404.
- Validation SHALL occur before any go-git lookup so that malformed input never reaches the object database.

Malformed inputs and well-formed-but-nonexistent inputs both collapse to `unknown_ref` HTTP 404. The choice is deliberate: the user-visible distinction between "you typed garbage" and "no such commit" is meaningless, and collapsing both keeps the typed-error union small (no separate `invalid_argument` kind). The validator still runs first so go-git never sees malformed strings.

#### Scenario: Malformed sha

- **WHEN** a request arrives at `GET /api/git/commit?sha=hello`
- **THEN** the response is HTTP 404 with a typed `unknown_ref` error
- **AND** no go-git object lookup is performed

#### Scenario: Malformed ref

- **WHEN** a request arrives at `GET /api/git/commits?ref=..%2Fevil`
- **THEN** the response is a typed `unknown_ref` error

### Requirement: SPA renders git affordances only when repo is present

On first paint, the SPA SHALL request `GET /api/git/info`. When `is_repo` is true, the SPA SHALL render the git affordances described in subsequent requirements (toolbar pills on desktop, drawer entries on mobile, accessible routes). When `is_repo` is false, the SPA SHALL render no git affordances anywhere in the chrome, and manually-navigated `/git/*` routes SHALL render a "not a git repository" placeholder with a link back to the root folder view.

The `/info` response SHALL be requested once per SPA load and cached in memory for the session. A page refresh re-fetches.

#### Scenario: SPA loads in a repo

- **WHEN** the SPA loads against a server whose served root is a git repository
- **THEN** the toolbar (desktop) shows a branch pill and (when status is non-empty) a changes badge
- **AND** the drawer header (mobile) shows the same affordances
- **AND** the routes `/git/commits`, `/git/commits/<sha>`, `/git/status` render their respective views

#### Scenario: SPA loads in a non-repo directory

- **WHEN** the SPA loads against a server whose served root has no `.git`
- **THEN** no git affordance appears in the toolbar or drawer
- **AND** navigating to `/git/commits` renders a "not a git repository" placeholder with a link to `/`

### Requirement: Branch picker affordance

The SPA SHALL provide a branch-picker affordance — a button labelled with the current ref name (or `Detached at <short_sha>` when HEAD is detached, or `(no commits)` when the repo is empty) — that opens a dropdown listing all branches and tags from `/api/git/refs`. Selecting a ref SHALL navigate to `/git/commits?ref=<encoded ref>`. The dropdown SHALL also expose a "Local changes" link to `/git/status` and a "View commits" link to `/git/commits` for the currently selected ref.

The branch-picker SHALL appear in the desktop toolbar (≥800px) between the breadcrumbs and the search input, and inside the sidebar drawer header (mobile, <800px) — never in the mobile top bar.

The branch-picker SHALL distinguish branches from tags visually in the dropdown (e.g., separate sections or distinct icons).

#### Scenario: Branch picker on desktop

- **WHEN** the SPA renders at viewport width ≥800px in a repo on `main`
- **THEN** a button reading `branch: main ▾` appears in the toolbar
- **AND** clicking it opens a dropdown listing all branches and tags

#### Scenario: Branch picker on mobile is in the drawer

- **WHEN** the SPA renders at viewport width <800px in a repo on `main`
- **THEN** the main top bar does NOT show a branch pill
- **AND** opening the sidebar drawer shows the branch pill in the drawer header above the tree

#### Scenario: Detached HEAD label

- **WHEN** the repository's HEAD is detached at `abc1234...`
- **THEN** the branch-picker button reads `Detached at abc1234` (using `short_sha`)

#### Scenario: Empty repo label

- **WHEN** the repository has no commits
- **THEN** the branch-picker button reads `(no commits)` and the dropdown is empty

#### Scenario: Selecting a branch navigates

- **WHEN** the user opens the picker and selects `feature/x`
- **THEN** the SPA navigates to `/git/commits?ref=feature%2Fx`

### Requirement: Changes badge affordance

When the working tree has at least one staged, unstaged, or untracked entry, the SPA SHALL render a "changes badge" affordance — a small button labelled `● N changes` where `N` is the total count across all three groups. Activating the badge SHALL navigate to `/git/status`. When the working tree is clean, the badge SHALL NOT render.

The badge SHALL appear in the desktop toolbar (adjacent to the branch pill) and inside the sidebar drawer header (mobile) — never in the mobile top bar.

#### Scenario: Badge shows count

- **WHEN** the working tree has 2 staged, 1 unstaged, 0 untracked
- **THEN** the badge reads `● 3 changes`
- **AND** clicking it navigates to `/git/status`

#### Scenario: Badge hidden on clean tree

- **WHEN** the working tree is clean
- **THEN** no changes badge appears

### Requirement: Commits list view

The SPA SHALL serve a commits list view at `/git/commits` (optionally `?ref=<ref>`). The view SHALL render the commit list returned by `/api/git/commits`, with each commit shown as a card containing: subject (first line of message), author name and short_sha and relative time, and full body collapsed by default.

A "Load older commits" pager SHALL appear at the bottom of the list when `next_cursor` is non-null; activating it SHALL fetch the next page using that cursor and append the results.

The view SHALL respect the `ref` query parameter — when present, the branch picker SHALL highlight that ref as the active selection.

#### Scenario: Load default commits list

- **WHEN** the SPA navigates to `/git/commits`
- **THEN** the view renders up to 30 commits, newest first
- **AND** each card shows subject, author, short_sha, and relative time

#### Scenario: Load older commits

- **WHEN** the initial response included `next_cursor: "abc1234..."`
- **AND** the user activates the "Load older commits" pager
- **THEN** the SPA fetches `/api/git/commits?cursor=abc1234...&ref=<current ref>` and appends to the list
- **AND** the cursor commit is NOT duplicated in the list

#### Scenario: Commit list on a non-default branch

- **WHEN** the SPA navigates to `/git/commits?ref=feature/x`
- **THEN** commits from `feature/x` are listed
- **AND** the branch picker shows `feature/x` as the active selection

#### Scenario: Empty commits list

- **WHEN** the repository has no commits on the requested ref
- **THEN** the view renders an empty state with a hint message

### Requirement: Commit detail view with lazy hunks

The SPA SHALL serve a commit detail view at `/git/commits/<sha>` (where `<sha>` is a short or full sha). The view SHALL render:

- A header containing: subject, body (rendered with linebreaks preserved, no markdown processing), author and committer with timestamps, the commit's short_sha, the parents' short_shas (linked to their respective commit detail views), and summary counts (`N files changed, +X −Y`).
- A list of file entries (paginated 50-at-a-time). Each entry is a collapsible card showing: status badge (A/M/D/R or ●binary), the file's path (showing `old → new` for renames), and per-file `+X −Y` counts. Activating a card expands it.
- On expansion, the SPA SHALL fetch the first batch of hunks via `/api/git/patch?source=commit&sha=<sha>&path=<path>&hunk_offset=0&hunk_limit=3` and render the hunks inline below the card header. A "Load N more changes (M remaining)" pager appears beneath the rendered hunks when `more_available: true`.
- On first paint, the first 3 file cards SHALL be auto-expanded with their first batch of hunks pre-loaded. Subsequent files start collapsed.
- A "Load next 50 files" pager appears at the bottom of the list when `next_file_offset` is non-null.
- Binary files SHALL render as a single non-expandable row showing the status badge, path, and `Binary file changed: <old_size> → <new_size>`.

#### Scenario: First paint with small commit

- **WHEN** the SPA navigates to `/git/commits/abc1234` for a commit touching 5 files
- **THEN** the header renders with metadata and summary counts
- **AND** the first 3 file cards are expanded with their first 3 hunks visible
- **AND** the remaining 2 file cards are collapsed but visible

#### Scenario: Expanding a collapsed file

- **WHEN** the user clicks a collapsed file row
- **THEN** the SPA fetches `/api/git/patch?source=commit&sha=<sha>&path=<path>&hunk_offset=0&hunk_limit=3` and renders the response
- **AND** if `more_available: true`, a "Load more changes" pager appears

#### Scenario: Loading more hunks

- **WHEN** the user activates the "Load 3 more changes (4 remaining)" pager
- **THEN** the SPA fetches the next page (`hunk_offset=3`) and appends hunks to the file card
- **AND** the pager updates with the new remaining count

#### Scenario: Binary file rendering

- **WHEN** a commit modifies `logo.png` (binary, 4096 → 6144 bytes)
- **THEN** the file row shows the ●binary badge, the path, and `Binary file changed: 4 KB → 6 KB`
- **AND** the row is not expandable

#### Scenario: Empty commit

- **WHEN** a commit has no file changes (`--allow-empty`)
- **THEN** the header renders normally with `0 files changed, +0 −0`
- **AND** an empty state replaces the file list

#### Scenario: File pagination

- **WHEN** a commit touches 234 files
- **THEN** the first 50 are rendered followed by a "Load next 50 files" pager
- **AND** activating the pager fetches `/api/git/commit?sha=<sha>&file_offset=50&file_limit=50` and appends to the list

#### Scenario: Rename rendering

- **WHEN** a file row represents a rename from `a/old.txt` to `b/new.txt`
- **THEN** the row's path display shows `a/old.txt → b/new.txt`
- **AND** the status badge shows `R`

#### Scenario: Commit by short sha

- **WHEN** the SPA navigates to `/git/commits/abc1234` (7-character sha)
- **AND** that sha uniquely identifies a commit
- **THEN** the view renders normally

#### Scenario: Unknown commit

- **WHEN** the SPA navigates to `/git/commits/deadbeef` and no such commit exists
- **THEN** the view renders a not-found placeholder with a link back to `/git/commits`

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
