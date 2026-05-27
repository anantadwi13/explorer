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
- The change-type marker column (`.diff-line-marker`) SHALL have a `1px solid var(--line)` right border separating it from the code text cell. The code text cell (`.diff-line-text`) SHALL have `0.5ch` of left padding so that code text does not abut the border. The marker column SHALL be `1.75ch` wide (the third track in `.diff-hunk-lines` `grid-template-columns`) and SHALL carry `padding-right: 0.25ch` so the `+`/`−` glyph has breathing room before the border. The marker column and both gutter columns SHALL use `var(--line-soft)` as their opaque base background so the gutter lane is visually distinct from the code content.
- In wrap-off mode, the sticky `left` offset for `.diff-gutter-new` SHALL be `calc(var(--gutter-old-w, 3ch) - 1px)` and for `.diff-line-marker` SHALL be `calc(var(--gutter-old-w, 3ch) + var(--gutter-new-w, 3ch) - 1px)`. The 1 px negative overlap prevents a subpixel transparent gap between adjacent sticky columns at certain device pixel ratios.
- Long lines wrap inside the hunk block by default (no horizontal scroll on the page).
- The commit detail and status views SHALL expose a wrap/no-wrap toggle button in their page header (same `WrapIcon` button used by the web-ui file viewer). The current wrap state SHALL be read from and written to the existing `localStorage["explorer.wrap"]` key via the existing `useWrap` hook — so toggling wrap inside the file viewer and inside the diff views shares one global preference (single key, no surprise). When wrap is OFF, hunk bodies SHALL allow horizontal scroll instead of wrapping (`white-space: pre` + `overflow-x: auto`). When wrap is ON (the default), behaviour matches the previous bullet (no horizontal scroll on the page).
- **Mobile font-size**: at viewport widths ≤767px the entire `.diff-hunk-body` element (not its individual gutter children) SHALL carry `font-size: 0.75rem`. This ensures that the `ch` unit resolves from a single font-size context for both `grid-template-columns` on `.diff-hunk-lines` and `position: sticky; left:` on the gutter cells, preventing sticky mis-alignment on mobile.

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

#### Scenario: Marker divider is visible between line numbers and code

- **WHEN** a diff hunk is rendered
- **THEN** a visible vertical line (`1px solid var(--line)`) is present on the right edge of the change-type marker column
- **AND** the gutter and marker columns have a `var(--line-soft)` background visually distinct from the code content
- **AND** the code text has `0.5ch` left padding so it does not abut the divider line
- **AND** no transparent gap appears between the old-line-number, new-line-number, and marker columns when the diff scrolls horizontally in wrap-off mode

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

#### Scenario: Mobile horizontal scroll shows no gap between gutter and marker

- **WHEN** the SPA is rendered at a viewport width ≤767px
- **AND** wrap is OFF
- **AND** the user scrolls a diff hunk horizontally to the right
- **THEN** the old-line-number gutter, new-line-number gutter, and +/− marker remain flush with no transparent gap between them
- **AND** the right border of the marker column remains visible and aligned with the sticky gutters

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

### Requirement: Diff hunk line numbers

In commit detail and status views, every rendered diff line SHALL be preceded by an always-on two-column line-number gutter. The first column SHALL display the line's number in the **old** file ("old number"); the second column SHALL display the line's number in the **new** file ("new number"). For each diff line, gutter cell occupancy SHALL depend on line type:

- **Context lines**: both old and new numbers are shown.
- **Added lines (`+`)**: only the new number is shown; the old column is rendered blank.
- **Deleted lines (`−`)**: only the old number is shown; the new column is rendered blank.

Line numbers SHALL be derived purely client-side from each hunk's `old_start` and `new_start` fields by walking the hunk's lines in order. The `GitHunk` JSON schema SHALL NOT change for this feature: no per-line numbers are added to the wire format.

The two-column gutter SHALL be visible at every supported viewport width, including phone-class widths. On viewports below `768px` the gutter MAY render with reduced font size and padding to keep both columns within a typical 360px viewport without crowding the diff text below ~30 character columns; the gutter SHALL NOT be hidden. There SHALL NOT be a user-facing toggle, settings-menu entry, or `localStorage` key controlling diff line-number visibility.

When the active wrap preference is `off` (read from `localStorage["explorer.wrap"]` via the existing `useWrap` hook), the diff hunk body SHALL scroll horizontally, and BOTH gutter columns AND the single-character marker column (`+`, `−`, space) SHALL remain pinned to the left edge of the visible viewport (sticky-left) while the diff text scrolls beneath them. The marker is included in the pinned block so that a horizontally scrolled long line still shows the reader which type of line they are reading.

For tinted rows (`add` and `del`), the gutter cells of that row SHALL carry the same row tint as the diff text — the `add` row gutter cells SHALL use `var(--color-diff-add-bg)` and the `del` row gutter cells SHALL use `var(--color-diff-del-bg)` — so the row tint extends continuously across both gutter columns and the diff text. Context-row gutter cells SHALL use a background that matches the hunk body so they remain opaque while sticky-left in wrap-off mode.

The gutter SHALL be excluded from clipboard copies — a user selecting diff text SHALL receive the marker (`+`, `−`, space) and the source content, with no line numbers, when they copy and paste. The gutter SHALL also be marked `aria-hidden="true"`.

The existing single-character marker (`+`, `−`, space) SHALL remain outside the gutter and outside the highlighted span, retaining its existing palette and position.

#### Scenario: Context line shows both numbers

- **WHEN** a hunk with header `@@ -42,3 +58,3 @@` is rendered
- **AND** the first line is a context line
- **THEN** the gutter shows `42` in the old column and `58` in the new column
- **AND** the marker is a space and the diff text follows

#### Scenario: Added line shows only the new number

- **WHEN** a hunk contains an `add` line at new position `59`
- **THEN** the gutter renders the old column blank and shows `59` in the new column
- **AND** the row is tinted with the additions background

#### Scenario: Deleted line shows only the old number

- **WHEN** a hunk contains a `del` line at old position `43`
- **THEN** the gutter shows `43` in the old column and renders the new column blank
- **AND** the row is tinted with the deletions background

#### Scenario: Numbers walk forward correctly through a mixed hunk

- **WHEN** a hunk with `old_start: 42, new_start: 58` contains the line sequence `context, del, del, add, context`
- **THEN** the gutter columns over those rows are `(42, 58)`, `(43, blank)`, `(44, blank)`, `(blank, 59)`, `(45, 60)`
- **AND** the next hunk's numbering starts from its own `old_start` / `new_start`, independent of any prior hunk

#### Scenario: Wrap-off pins both gutter columns AND the marker to the left

- **WHEN** the wrap preference is `off`
- **AND** the user scrolls a diff hunk body horizontally to the right
- **THEN** the old gutter column, the new gutter column, AND the `+` / `−` / space marker column all remain pinned to the left edge of the visible viewport
- **AND** the gutter and marker cells' backgrounds remain opaque (matching their row tint or the hunk body background) so scrolled diff text is not visible through them
- **AND** only the diff text continues to scroll horizontally underneath the pinned block

#### Scenario: Gutter inherits the row tint on add and del rows

- **WHEN** a tinted `add` row is rendered
- **THEN** the new column gutter cell, the blank old column gutter cell, the marker cell, and the diff text cell all show the same `var(--color-diff-add-bg)` tint
- **AND** the same rule applies symmetrically for `del` rows with `var(--color-diff-del-bg)`

#### Scenario: Gutter is excluded from clipboard copies

- **WHEN** the user selects a region of diff text (across multiple lines, possibly including the marker) and copies it
- **THEN** the clipboard receives only the marker characters and the source content
- **AND** no line numbers appear in the pasted output

#### Scenario: Gutter remains visible on mobile

- **WHEN** the SPA renders a diff hunk at a viewport width below `768px`
- **THEN** both gutter columns are present and the numbers are readable
- **AND** the diff text remains legible alongside the gutter (gutter typography MAY be tightened to keep both visible)

#### Scenario: Wire format is unchanged

- **WHEN** the SPA fetches a hunk from `/api/git/...` lazy hunk endpoints
- **THEN** the JSON response matches the existing `GitHunk` schema with no per-line number fields added
- **AND** the SPA derives the displayed numbers from `old_start`, `new_start`, and the line-type sequence

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

The strip SHALL render as two rows: an upper **summary row** carrying the commit metadata (or an "Untracked / No commits yet" placeholder), and a lower **action row** carrying an optional status pill on its leading edge and the "History" affordance on its trailing edge. The two-row layout is identical on desktop (≥768px) and mobile (<768px) so the History affordance's position is predictable across viewports.

The strip SHALL render in one of three states, determined by the file's working-tree status (read from the same `/api/git/status` response used by the changes badge — see the "SPA renders git affordances only when repo is present" requirement and the "Changes badge affordance" requirement) and by the result of a `GET /api/git/commits?path=<path>&limit=1` lookup:

- **Clean tracked file** (path absent from staged, unstaged, untracked; one or more commits exist): the summary row displays `<short_sha> · <subject> · <author_name> · <relative-time>`; the action row carries only the "History" affordance linking to `/git/commits?path=<encoded path>&ref=<active ref>`. The short_sha and subject SHALL be linked to `/git/commits/<sha>`. The subject SHALL truncate with `text-overflow: ellipsis` when the strip is narrower than the content; the rest of the metadata SHALL remain visible.
- **Modified locally** (path present in staged or unstaged): the summary row displays the same one-line commit summary as the clean state. The action row carries a `Modified locally` status pill on its leading edge and the History affordance on its trailing edge.
- **Untracked** (path present in untracked, or path is tracked but produced an empty commits response on the active ref): the summary row displays the message `No commits yet`. The action row carries an `Untracked` status pill on its leading edge and the History affordance on its trailing edge, with the History affordance linking to `/git/commits?path=<encoded path>` (the commits-list page will render its own untracked banner).

The strip SHALL NOT render when `is_repo` is false. When the strip is in a non-clean state (modified locally or untracked), the status pill SHALL use the same visual treatment as the changes-badge pill (chrome from the documented SPA design-token vocabulary — see the "Git surfaces use the documented SPA design tokens" requirement).

#### Scenario: Clean tracked file

- **WHEN** the file viewer renders `/view/internal/server/api.go` on a clean tracked file in a repo
- **THEN** the strip renders between the file head and the content area
- **AND** the summary row reads `<short_sha> · <subject> · <author_name> · <relative-time>`
- **AND** the action row contains only the History affordance, linking to `/git/commits?path=internal%2Fserver%2Fapi.go&ref=<active ref>`
- **AND** the short_sha is a link to `/git/commits/<sha>`

#### Scenario: Modified locally

- **WHEN** the file viewer renders `/view/internal/server/api.go` on a file present in the unstaged section of `/api/git/status`
- **THEN** the summary row matches the clean state
- **AND** the action row carries a `Modified locally` status pill on its leading edge and the History affordance on its trailing edge
- **AND** the two pills are on the same horizontal line

#### Scenario: Untracked file

- **WHEN** the file viewer renders `/view/notes.txt` on a file present in the untracked section of `/api/git/status`
- **THEN** the summary row reads `No commits yet`
- **AND** the action row carries an `Untracked` status pill on its leading edge and the History affordance on its trailing edge
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

For files whose preview kind is `text` (i.e. `kind === 'text'` in the `meta` response), the file viewer SHALL render a tablist above the content area with two tabs: "Code" and "Blame". For files whose preview kind is `markdown` (i.e. `kind === 'markdown'`), the file viewer SHALL render a tablist with three tabs: "Preview", "Code", and "Blame". For image and non-previewable files, the tablist SHALL NOT render.

The active tab SHALL be reflected in the URL via a `view` query parameter whose value SHALL be one of `preview`, `code`, or `blame`. The SPA SHALL **always emit an explicit `view=` parameter** whenever it writes the URL after a tab interaction (i.e. the SPA SHALL NOT delete the parameter when activating the kind's default tab). On read, the SPA SHALL **tolerate** an absent or unrecognised `view=` value and fall back to the kind's natural default:

- `markdown` → default tab is `preview`
- `text` → default tab is `code`
- `image` / non-previewable → no tablist; `view=` has no effect

When `view=` carries a value that is valid in the union but not available for the active file kind (e.g. `view=preview` on a `text` file, `view=code` on an `image` file, `view=blame` on an `image` file), the SPA SHALL fall back to the kind's natural default with no error. The URL parameter retains its written value; the SPA does not rewrite it.

Activating a tab SHALL update the URL via the SPA router (no page reload) using `replace: true` so tab toggles do not pile up browser history entries. Reloading the page with any valid `view=` value present SHALL restore the corresponding tab on first paint.

The tablist SHALL follow standard ARIA tab-pattern semantics: `role="tablist"` on the container, `role="tab"` on each button, `aria-selected` on the active tab, left/right arrow keys move the active tab, Home/End jump to first/last. Keyboard navigation SHALL work uniformly for both the two-tab and three-tab variants.

The content-area container's CSS class SHALL follow the **active renderer**, not the file kind, so the markdown Code and Blame tabs reuse the same panel chrome (background, border, rounded corners) the text Code and Blame tabs have always had. Specifically, when the active renderer is `<CodeBlock>` or `<BlameView>` (text Code/Blame OR markdown Code/Blame), the container SHALL carry the `vw-text` class. When the active renderer is `<MarkdownRenderer>` (markdown Preview), the container SHALL carry `vw-markdown` (markdown supplies its own `.md-body` chrome). When the renderer is the image preview, the container SHALL carry `vw-image`.

The `at` query parameter is RESERVED in this URL grammar for a future "view file at commit" capability and SHALL be ignored by the current implementation — the SPA SHALL NOT read it on parse and SHALL NOT emit it on tab activations. However, when an inbound URL already carries an `at=` value (e.g. a user typed it or pasted a forward-looking link), the SPA SHALL preserve the parameter unchanged on subsequent tab writes rather than stripping it. This matches the "tolerant parse, generation-explicit" posture used for `view=` itself, and means the URL stays forward-compatible with the future change without the SPA actively suppressing it.

#### Scenario: Tabs render for text files

- **WHEN** the file viewer renders `/view/internal/server/api.go` (`kind === 'text'`)
- **THEN** a tablist with Code and Blame tabs appears above the content area
- **AND** the Code tab is the default active tab

#### Scenario: Tabs render for markdown files

- **WHEN** the file viewer renders `/view/README.md` (`kind === 'markdown'`)
- **THEN** a tablist with Preview, Code, and Blame tabs appears above the content area
- **AND** the Preview tab is the default active tab
- **AND** the rendered markdown body appears inside the Preview tab

#### Scenario: Activating Blame on a text file writes an explicit URL

- **WHEN** the user activates the Blame tab on `/view/internal/server/api.go`
- **THEN** the URL becomes `/view/internal/server/api.go?view=blame`
- **AND** the Blame view renders in place of `<CodeBlock>`

#### Scenario: Activating Code on a markdown file writes an explicit URL

- **WHEN** the user activates the Code tab on `/view/README.md`
- **THEN** the URL becomes `/view/README.md?view=code`
- **AND** the file content renders inside `<CodeBlock>` with markdown syntax highlighting

#### Scenario: Activating Preview on a markdown file writes an explicit URL

- **WHEN** the user activates the Preview tab from another tab on `/view/README.md?view=blame`
- **THEN** the URL becomes `/view/README.md?view=preview` (the SPA does NOT delete the parameter)
- **AND** the rendered markdown renders via `MarkdownRenderer`

#### Scenario: Deep link restores Blame on a text file

- **WHEN** the SPA loads `/view/internal/server/api.go?view=blame`
- **THEN** the Blame tab is active on first paint
- **AND** the Blame view fetches its data

#### Scenario: Deep link restores Code on a markdown file

- **WHEN** the SPA loads `/view/README.md?view=code`
- **THEN** the Code tab is active on first paint
- **AND** the file renders inside `<CodeBlock>` with markdown syntax highlighting

#### Scenario: Legacy markdown URL without `view=` falls back to Preview

- **WHEN** the SPA loads `/view/README.md` with no `view=` query parameter
- **THEN** the Preview tab is active on first paint
- **AND** the rendered markdown renders via `MarkdownRenderer`

#### Scenario: Legacy text URL without `view=` falls back to Code

- **WHEN** the SPA loads `/view/internal/server/api.go` with no `view=` query parameter
- **THEN** the Code tab is active on first paint

#### Scenario: `view=preview` on a text file falls back to Code

- **WHEN** the SPA loads `/view/internal/server/api.go?view=preview`
- **THEN** the Code tab is active on first paint
- **AND** the URL parameter is left as `view=preview` (not rewritten by the SPA)
- **AND** no error is shown

#### Scenario: `view=blame` on a non-text, non-markdown file is inert

- **WHEN** the file viewer renders `/view/logo.png?view=blame`
- **THEN** no tablist is rendered
- **AND** the image preview renders as if the parameter were absent
- **AND** no error message appears

#### Scenario: `at=` parameter is ignored on parse, preserved on emit

- **WHEN** the SPA loads `/view/README.md?view=preview&at=abc1234`
- **THEN** the Preview tab is active on first paint
- **AND** the `at=` value is ignored by the current implementation
- **AND** the rendering uses working-tree bytes (not commit-pinned bytes)
- **AND** activating the Code tab writes `/view/README.md?view=code&at=abc1234` (the `at=` value is preserved, not stripped)

#### Scenario: Keyboard navigation across three markdown tabs

- **WHEN** the user focuses any tab in the markdown tablist
- **AND** presses Right arrow repeatedly
- **THEN** focus and activation cycle through Preview → Code → Blame → Preview
- **AND** the corresponding view is rendered for each step
- **AND** Home jumps to Preview and End jumps to Blame

#### Scenario: Code tab on markdown applies markdown grammar

- **WHEN** the Code tab is active on a `.md` file
- **THEN** the rendered code block contains `hljs-*` token spans driven by the markdown grammar registered in `web/src/components/syntax/grammars.ts`
- **AND** the markdown source's headings, fenced code fences, and emphasis markers render as visually distinct tokens

#### Scenario: Blame tab on markdown renders BlameView

- **WHEN** the SPA loads `/view/README.md?view=blame`
- **THEN** the Blame tab is active on first paint
- **AND** `BlameView` renders the markdown file's lines with the standard committed-chunk metadata (short_sha · subject · author · time) and per-line gutter
- **AND** the wrap toggle is visible in the file head (because the active tab is Blame)

#### Scenario: Markdown Code/Blame container reuses the text panel chrome

- **WHEN** the SPA renders the Code or Blame tab on a markdown file
- **THEN** the content-area container's class list includes `vw-text` (the same class text-file Code/Blame uses)
- **AND** the panel background, border, and rounded corners are visually identical to a text file's Code or Blame tab
- **AND** the markdown Preview tab's container does NOT carry `vw-text` (it carries `vw-markdown` and relies on `.md-body` for chrome)

### Requirement: Blame view rendering

The Blame view rendered by the file viewer's Blame tab SHALL show every working-tree line of the file paired with its blame attribution from `/api/git/blame`.

The view SHALL render the file content from `/raw/<path>` (the same source used by `<CodeBlock>`), paired by line number with the chunks from the blame response.

Each blame chunk SHALL render as a visually distinct section:
- **Committed chunks** SHALL display metadata `<short_sha> · <subject> · <author_name> · <relative-time>`. The short_sha and subject SHALL be linked to `/git/commits/<sha>`.
- **Uncommitted chunks** (`uncommitted: true` in the response) SHALL display the label `Working tree · uncommitted` in place of commit metadata, with no author, no timestamp, and no link. The chunk body SHALL render with a distinct background using a themed CSS custom property (e.g. `--blame-uncommitted-bg`) so the chunk reads as visually different from a committed chunk at a glance.

Within each chunk, lines SHALL render in order with a single-column line-number gutter. The gutter SHALL be 1-based and continuous across chunks (i.e. the first line of the second chunk is `chunk1.start_line + chunk1.line_count`). Per-line syntax highlighting SHALL use the shared `lowlight` instance from `web/src/components/syntax/grammars.ts` with the language derived from the file path via `extToLanguage` (the same per-line approximation already used by `DiffHunk`). When `extToLanguage` returns `null`, lines SHALL render as plain monospace text.

The line-number gutter cell (`.blame-gutter`) SHALL have a `1px solid var(--line)` right border separating it from the code content cell. The code content cell (`.blame-line-text`) SHALL have `0.75ch` of left padding so that code text does not abut the border. The gutter cell SHALL use `var(--line-soft)` as its background colour so the gutter lane is visually distinguishable from the code content area. The top/bottom breathing room within each chunk body SHALL be provided by padding on the first and last line cells (`.blame-line:first-child` / `.blame-line:last-child`) rather than on the chunk-body container, so the gutter background fills the full height of each chunk with no uncoloured band at the top or bottom.

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

#### Scenario: Gutter divider is visible between line numbers and code

- **WHEN** the Blame view renders any chunk
- **THEN** a visible vertical line (`1px solid var(--line)`) is present on the right edge of the line-number gutter
- **AND** the gutter lane has a `var(--line-soft)` background visually distinct from the code content area
- **AND** the code text has `0.75ch` left padding so it does not abut the divider line
- **AND** the gutter background fills the full height of each chunk body with no uncoloured band above the first line or below the last line of the chunk

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

### Requirement: Blame view progressive loading and stale-while-revalidate

The Blame view's two data inputs — `/raw/<path>` (working-tree bytes; ~milliseconds) and `/api/git/blame` (commit-DAG walk; commonly seconds) — SHALL load independently. The view SHALL paint file content + line-number gutter as soon as `/raw/<path>` resolves, even if `/api/git/blame` is still in flight. While the blame response is pending, the view SHALL render a single placeholder chunk spanning the entire file whose metadata cell reads `Computing blame…`. Once the blame response arrives, the placeholder SHALL be replaced by the real chunks in place — no full re-render or content flash.

The SPA SHALL maintain an in-memory cache of `/api/git/blame` responses keyed by `(path, ref)` for the lifetime of the SPA tab. On mount, the view SHALL read the cache synchronously: if an entry exists, the cached chunks SHALL render immediately (no `Computing blame…` placeholder). The view SHALL ALSO fire a background fetch on every mount — the cache is stale-while-revalidate, not write-once — so the user sees the freshest data if anything changed since the cached response (working tree modifications, new commits, ref switches).

While a background fetch is in flight and cached chunks are visible, the view SHALL render a `Refetching blame…` status pill above the chunk list (alongside the `Modified locally` pill if present). The pill SHALL be removed when the background fetch settles.

At most one `/api/git/blame` HTTP request SHALL be in flight per `(path, ref)` key at any time. A remount that arrives while a request is still pending SHALL await the same Promise rather than triggering a duplicate. The cache write SHALL be triggered by request settlement, not by component mount, so a request started by an unmounted component still populates the cache on completion.

The cache is **client-side**; it does NOT relax the server-side "Caching of any kind" non-goal in the "Non-goals declared" requirement. Every `/api/git/blame` HTTP request that does reach the server SHALL invoke go-git fresh.

The cache SHALL NOT persist across page reloads. A full browser refresh SHALL re-initialise the cache to empty, matching the existing "no live updates" non-goal — a reload is the user's signal that they want to see the latest state.

#### Scenario: Cold mount renders content before blame resolves

- **WHEN** the user opens the Blame tab on a file with no cached blame entry
- **THEN** the file content + line-number gutter render as soon as `/raw/<path>` resolves
- **AND** a single placeholder chunk spanning the entire file shows `Computing blame…` in its metadata cell
- **AND** no `Refetching blame…` status pill is shown (the placeholder already conveys progress)

#### Scenario: Warm mount renders cached chunks instantly

- **WHEN** the user opens the Blame tab on a file whose blame entry is in the cache
- **THEN** the cached chunks render synchronously on first paint
- **AND** no `Computing blame…` placeholder is shown
- **AND** a `Refetching blame…` status pill is rendered above the chunk list

#### Scenario: Refetching pill disappears when background fetch settles

- **WHEN** the background `/api/git/blame` fetch resolves successfully
- **THEN** the cached chunks are replaced with the fresh response (when different)
- **AND** the `Refetching blame…` status pill is removed
- **AND** the rest of the layout (chunk metadata, gutter, code cells) updates in place without unmount

#### Scenario: Concurrent mounts dedup the in-flight request

- **WHEN** the user opens the Blame tab, instantly switches to Code, and instantly switches back to Blame — all before the original `/api/git/blame` call resolves
- **THEN** the server SHALL receive exactly one `/api/git/blame` request for that `(path, ref)` key
- **AND** the second mount SHALL await the same in-flight Promise as the first
- **AND** when the Promise resolves, both the cache and the visible view update from that single response

#### Scenario: Cache survives an unmount

- **WHEN** the originating mount unmounts while its fetch is still pending
- **AND** the fetch later resolves successfully
- **THEN** the cache entry for that `(path, ref)` key SHALL be populated
- **AND** a subsequent mount SHALL hit the cache and render chunks instantly

#### Scenario: Background fetch error preserves cached data

- **WHEN** the background `/api/git/blame` fetch returns a transient error and the view has cached chunks displayed
- **THEN** the cached chunks SHALL remain visible (no error placeholder swap-in)
- **AND** the `Refetching blame…` status pill SHALL be removed
- **AND** the cache entry SHALL be left unchanged so the next mount still has data to show

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

