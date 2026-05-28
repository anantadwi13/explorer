## MODIFIED Requirements

### Requirement: Blame endpoint

The server SHALL expose `GET /api/git/blame` returning per-line blame attribution for a single file, grouped into chunks of consecutive lines that share the same source.

Query parameters: `path` (required — repo-relative path), `ref` (optional — defaults to HEAD; SHALL be a branch name, tag name, full SHA, an unambiguous SHA prefix, or a SHA / SHA-prefix followed by `^` for the first parent, matching the existing `ref` validation rules with the new `^` suffix added by this change).

The response SHALL be a JSON object with fields:
- `path` (string), `ref` (string), `sha` (full 40-character commit sha the blame was computed against).
- `total_lines` (integer).
- `dirty` (boolean — true iff the working-tree overlay was applied).
- `chunks` — array of chunk objects: each chunk is either a **committed chunk** with `{start_line, line_count, commit}` where `commit` is `{sha, short_sha, author_name, author_email, author_time, subject}`, or an **uncommitted chunk** with `{start_line, line_count, uncommitted: true}` and no `commit` field. `start_line` is 1-based and inclusive; line ranges across chunks SHALL be contiguous and cover exactly `[1, total_lines]`.

Two consecutive chunks attributed to the same commit SHALL be coalesced into one chunk. Two consecutive `uncommitted` chunks SHALL likewise be coalesced.

When `ref` is omitted (or equals HEAD) and the file appears in the working-tree status as `staged` or `unstaged`, the server SHALL compute the blame as a **working-tree overlay**:
1. Read HEAD's blob bytes for `path`.
2. Read the working-tree bytes for `path` via `resolver.Resolve`.
3. Compute the line-level diff between (1) and (2).
4. Run go-git blame against HEAD.
5. Walk the working-tree lines: lines unchanged from HEAD are attributed to their HEAD blame entry by HEAD-line index; lines inserted or modified in the working tree are emitted as `uncommitted: true`.
6. Coalesce consecutive same-commit and consecutive uncommitted runs into chunks.
7. Set `dirty: true` in the response.

When `ref` is an explicit historical ref (branch, tag, SHA, SHA prefix, or `<sha>^` suffix that does not resolve to the same commit as HEAD), the server SHALL NOT apply the working-tree overlay regardless of working-tree state — blame is computed directly against that ref's tree and `dirty` is `false`. The response SHALL NOT include any `uncommitted: true` chunks in this mode.

The `^` suffix SHALL resolve to the first parent commit (matching git's standard syntax). For a root commit (no parents), `<sha>^` SHALL return a typed `unknown_ref` error.

The endpoint SHALL enforce the same 5 MiB inline-preview cap on the resolved file size. Files exceeding the cap SHALL respond with the existing `too_large` typed error.

The endpoint SHALL enforce a server-side context deadline (target ~10 seconds) around the blame computation. On `context.DeadlineExceeded`, the response SHALL be the typed `blame_timeout` error.

Untracked files SHALL respond with the existing `not_found` typed error (HTTP 404). Files not present at the requested ref SHALL likewise respond with `not_found`. Refs that do not resolve to a commit SHALL respond with the typed `unknown_ref` error (HTTP 404).

The endpoint SHALL stop at the first rename boundary — earlier history of the file under a different path SHALL NOT be included.

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
- **AND** `total_lines` equals the working-tree file's line count
- **AND** the 4 inserted lines appear as a single `uncommitted: true` chunk
- **AND** lines before and after the insertion are attributed to their HEAD blame commits

#### Scenario: Explicit historical ref skips the overlay

- **WHEN** the working tree is dirty for `path=foo.go`
- **AND** a request arrives at `GET /api/git/blame?path=foo.go&ref=v1.0.0`
- **THEN** the response has `dirty: false`
- **AND** every chunk is a committed chunk
- **AND** the `sha` field is the tag's peeled commit sha, not HEAD's

#### Scenario: Blame at a commit SHA returns no uncommitted chunks

- **WHEN** a request arrives at `GET /api/git/blame?path=README.md&ref=<full-sha>`
- **THEN** the response is HTTP 200 with `dirty: false`
- **AND** no chunk in the response has `uncommitted: true`
- **AND** the `sha` field equals the resolved commit SHA

#### Scenario: Blame at a parent commit via `^` suffix

- **WHEN** a request arrives at `GET /api/git/blame?path=old/name.md&ref=<sha>%5E`
- **AND** the commit `<sha>` has a parent that contains `old/name.md`
- **THEN** the response is HTTP 200 against the parent commit
- **AND** `dirty: false`

#### Scenario: `^` on a root commit

- **WHEN** a request arrives at `GET /api/git/blame?path=foo&ref=<root-sha>%5E`
- **AND** `<root-sha>` is a commit with no parents
- **THEN** the response is a typed `unknown_ref` error (HTTP 404)

#### Scenario: File over the 5 MiB cap

- **WHEN** a request arrives for a path whose resolved file size exceeds the 5 MiB inline cap
- **THEN** the response is the typed `too_large` error
- **AND** no blame computation is attempted

#### Scenario: Blame deadline exceeded

- **WHEN** a request arrives for a large file whose blame walk exceeds the server-side deadline
- **THEN** the response is the typed `blame_timeout` error (HTTP 503)

#### Scenario: Path-escape attempt is rejected

- **WHEN** a request arrives at `GET /api/git/blame?path=../../etc/passwd`
- **THEN** the response is the typed `not_found` error (HTTP 404)
- **AND** no filesystem access occurs outside the served root

#### Scenario: Blame endpoint working-tree overlay uses path-resolver

- **WHEN** the dirty branch of blame reads working-tree bytes for `path`
- **THEN** the read SHALL go through `resolver.Resolve`
- **AND** an out-of-root symlink at `path` SHALL produce the typed `outside_root` error rather than leaking the linked content
- **AND** this is the documented exception to the "Path semantics declaration" requirement

### Requirement: Code and Blame tabs in the file viewer

For files whose preview kind is `text` (i.e. `kind === 'text'` in the `meta` response), the file viewer SHALL render a tablist above the content area with two tabs: "Code" and "Blame". For files whose preview kind is `markdown` (i.e. `kind === 'markdown'`), the file viewer SHALL render a tablist with three tabs: "Preview", "Code", and "Blame". For image and non-previewable files, the tablist SHALL NOT render.

The active tab SHALL be reflected in the URL via a `view` query parameter whose value SHALL be one of `preview`, `code`, or `blame`. For kinds that render a tablist, the SPA SHALL always emit an explicit `view=` parameter whenever it writes the URL after a tab interaction. For kinds with no tablist (image, non-previewable), the SPA SHALL emit no `view=` parameter. On read, the SPA SHALL tolerate an absent or unrecognised `view=` value and fall back to the kind's natural default.

The URL SHALL also accept an OPTIONAL `ref` query parameter that pins the file viewer to a specific commit. When `ref` is present and resolves to a commit, the file viewer SHALL render bytes and blame from the commit's tree rather than from the working tree:

- `ref=<sha>` (full 40-character SHA) — file viewer fetches `/api/meta?path=<p>&ref=<sha>`, `/raw/<p>?ref=<sha>`, and `/api/git/blame?path=<p>&ref=<sha>` instead of their working-tree forms.
- `ref=<sha-prefix>` (unambiguous prefix) — same behaviour; the server resolves the prefix.
- `ref=<sha>^` (parent commit via the `^` suffix, URL-encoded as `%5E`) — points to the first parent commit.
- The SPA SHALL always emit a full 40-character SHA when generating links it controls (e.g. from the diff card). Short prefixes are accepted on inbound URLs for back-compat with hand-edited links.

When `ref` is present, the pinned state SHALL apply uniformly across all available tabs for the file kind: Preview, Code, and Blame all show pinned bytes; the per-file last-commit strip (see "Per-file last-commit strip in the file viewer") reflects the pinned commit's metadata and renders the sole `Viewing at <short-sha>` pinned-state indicator; the Blame view's "Modified locally" pill SHALL NOT appear in pinned mode (the working-tree concept is absent). The file viewer's header SHALL NOT render any pinned-state indicator (see the `web-ui` capability's "SPA file URL renders file viewer" requirement).

The SPA SHALL NOT render an explicit "Back to working tree" UI affordance anywhere in the file viewer. Users escape pinned mode by removing `?ref=` from the URL (address-bar edit, browser back, or by following a link that does not carry `ref=`).

When the Preview tab is active on a pinned markdown file, relative `<img>` and `<a>` references inside the rendered markdown SHALL be rewritten to carry the same `ref` / `ref=`:
- `<img src="./diagram.png">` SHALL resolve to `/raw/<sibling-path>?ref=<full-sha>`.
- `<a href="./api.md">` SHALL resolve to `/view/<sibling-path>?view=<default-for-kind>&ref=<full-sha>`.
This keeps internal navigation pinned to the same commit. Absolute URLs and external `https://` links SHALL pass through unchanged. When `ref` is absent, the existing working-tree rewrite rules apply unchanged.

When `ref` resolves to an `unknown_ref` error or the file does not exist at the named commit, the file viewer SHALL render the standard `unknown_ref` / `not_found` error state in the content area. The strip's pinned-state indicator (with the user's typed `ref=` value as the displayed short-sha) SHALL still render so the user can see what they asked for.

When `ref` carries a SHA prefix (not a full 40-character SHA), the SPA SHALL NOT rewrite the URL to the resolved full SHA on read — the URL is left as the user typed it (matching the tolerant-parse posture used for `view=`). The strip's pinned-state indicator displays the 7-character short form of the resolved SHA returned by the server.

Activating a tab while `ref` is set SHALL preserve `ref` in the URL (it appears in both inbound and outbound URLs together with `view`).

The tablist SHALL follow standard ARIA tab-pattern semantics. Keyboard navigation SHALL work uniformly across the two-tab and three-tab variants and SHALL be unaffected by `ref`.

#### Scenario: Tabs render for text files

- **WHEN** the file viewer renders `/view/internal/server/api.go` (`kind === 'text'`)
- **THEN** a tablist with Code and Blame tabs appears above the content area
- **AND** the Code tab is the default active tab

#### Scenario: Tabs render for markdown files

- **WHEN** the file viewer renders `/view/README.md` (`kind === 'markdown'`)
- **THEN** a tablist with Preview, Code, and Blame tabs appears above the content area
- **AND** the Preview tab is the default active tab

#### Scenario: Deep link to a pinned text file

- **WHEN** the SPA loads `/view/internal/server/api.go?view=code&ref=abc1234567890abcdef1234567890abcdef12345`
- **THEN** the Code tab is active on first paint
- **AND** the file viewer fetches `/api/meta?path=internal/server/api.go&ref=abc1234567890abcdef1234567890abcdef12345`
- **AND** the rendered code reflects the bytes at that commit (not the working tree)
- **AND** the file head does NOT show any "Viewing at <sha>" pill (head stays clean)
- **AND** the per-file last-commit strip below the head shows "Viewing at abc1234" on its action row

#### Scenario: Deep link to a pinned markdown Preview

- **WHEN** the SPA loads `/view/README.md?view=preview&ref=<full-sha>`
- **THEN** the Preview tab renders `MarkdownRenderer` against the pinned bytes
- **AND** relative image references in the markdown resolve to `/raw/<sibling>?ref=<full-sha>`
- **AND** relative `<a href>` references in the markdown resolve to `/view/<sibling>?view=<default-for-kind>&ref=<full-sha>`
- **AND** absolute and external links (`https://…`) pass through unchanged

#### Scenario: Inbound SHA prefix is not rewritten to full SHA

- **WHEN** the SPA loads `/view/foo.go?view=code&ref=abc1234` (7-character prefix)
- **AND** the server resolves the prefix unambiguously to a full SHA
- **THEN** the file viewer renders the pinned file successfully
- **AND** the URL is NOT rewritten to the full SHA (the address bar still reads `ref=abc1234`)
- **AND** the pinned-state indicator displays `Viewing at abc1234` (the 7-character short SHA derived from the server-resolved full SHA, which happens to match the prefix in this case)

#### Scenario: Switching tabs preserves `ref`

- **WHEN** the user is on `/view/README.md?view=preview&ref=<sha>` and activates the Code tab
- **THEN** the URL becomes `/view/README.md?view=code&ref=<sha>`
- **AND** the `ref` parameter is retained verbatim

#### Scenario: No "Back to working tree" UI affordance

- **WHEN** the file viewer is rendered for any URL with `?ref=<sha>` set
- **THEN** no "Back to working tree" button, link, or other UI affordance is rendered in the file head, the strip's action row, or the content area
- **AND** the only way to escape pinned mode is to remove `?ref=` from the URL (address bar, browser back, or follow a link without `ref=`)

#### Scenario: Blame in pinned mode has no Modified-locally pill

- **WHEN** the user views `/view/foo.go?view=blame&ref=<sha>` on a file whose working tree is modified
- **THEN** the Blame view renders against the pinned commit
- **AND** the response's `dirty` field is `false`
- **AND** no "Modified locally" pill is rendered

#### Scenario: Unknown ref in `ref`

- **WHEN** the SPA loads `/view/foo.go?view=code&ref=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`
- **AND** that SHA does not exist in the repository
- **THEN** the file viewer renders the typed `unknown_ref` error state
- **AND** the strip's pinned-state indicator still renders with the typed `ref=` value as the displayed short-sha

#### Scenario: File absent at the pinned commit

- **WHEN** the SPA loads `/view/feature.md?view=preview&ref=<sha>`
- **AND** the file did not exist at that commit
- **THEN** the file viewer renders the typed `not_found` error state
- **AND** the strip still shows "Viewing at <short-sha>" on its action row (the file head stays clean)

#### Scenario: Pinned-mode link from the diff card opens in a new tab

- **WHEN** the user activates a filename link in a `FileDiffCard` for a commit-detail view
- **THEN** the browser opens the resulting URL in a new tab (the link has `target="_blank"`)
- **AND** the new tab loads the pinned-mode file viewer

### Requirement: Blame view rendering

The Blame view rendered by the file viewer's Blame tab SHALL show every line of the file (working-tree or pinned-commit lines, depending on whether `ref` is set) paired with its blame attribution from `/api/git/blame`.

The view SHALL render the file content from `/raw/<path>` (or `/raw/<path>?ref=<sha>` when pinned), paired by line number with the chunks from the blame response.

Each blame chunk SHALL render as a visually distinct section:
- **Committed chunks** SHALL display metadata `<short_sha> · <subject> · <author_name> · <relative-time>`. The short_sha and subject SHALL be linked to `/git/commits/<sha>`.
- **Uncommitted chunks** (`uncommitted: true` in the response) SHALL display the label `Working tree · uncommitted` in place of commit metadata, with no author, no timestamp, and no link. The chunk body SHALL render with a distinct background using a themed CSS custom property. Uncommitted chunks SHALL NOT appear when the view is pinned (`ref` is set) — the working-tree concept is absent in pinned mode and the blame response never returns `uncommitted` chunks.

Within each chunk, lines SHALL render in order with a single-column line-number gutter. The gutter SHALL be 1-based and continuous across chunks. Per-line syntax highlighting SHALL use the shared `lowlight` instance with the language derived from the file path via `extToLanguage`.

The Blame view SHALL respect the `localStorage["explorer.wrap"]` preference via the existing `useWrap` hook.

When the blame response has `dirty: true`, the Blame view SHALL render a `Modified locally` status pill above the chunk list. The `dirty: true` state can only occur in working-tree mode (no `ref`); pinned mode SHALL NOT render this pill.

The Blame view SHALL NOT render its own pinned-state pill. The per-file last-commit strip above the tablist is the sole pinned-state indicator (see "Per-file last-commit strip in the file viewer" pinned variant) and is visible on every tab including Blame — duplicating it inside the Blame view would be redundant. The `Refetching blame…` pill from the stale-while-revalidate cache is unaffected and renders in both modes.

The Blame view SHALL be responsive at the existing `768px` SPA layout breakpoint.

#### Scenario: Committed chunks render the commit metadata

- **WHEN** the Blame view renders a committed chunk attributed to commit `abc1234`
- **THEN** the chunk's metadata cell shows `abc1234 · <subject> · <author_name> · <relative-time>`
- **AND** the short_sha is linked to `/git/commits/abc1234`

#### Scenario: Uncommitted chunks render the Working tree label

- **WHEN** the Blame view renders an uncommitted chunk (`uncommitted: true`)
- **THEN** the metadata cell reads `Working tree · uncommitted`
- **AND** no author, timestamp, or link is shown

#### Scenario: Line numbers are continuous across chunks

- **WHEN** the Blame view renders chunks with start_line/line_count of (1,5), (6,3), (9,2)
- **THEN** the line-number gutter reads 1..10 across the three chunks with no gap or repetition

#### Scenario: Modified-locally banner (working-tree mode only)

- **WHEN** the Blame view renders a response with `dirty: true` and no `ref` is set
- **THEN** a `Modified locally` status pill appears above the chunk list

#### Scenario: Blame view renders no pinned-state pill of its own

- **WHEN** the user views `/view/foo.go?view=blame&ref=<full-sha>`
- **THEN** the Blame view's status-bar area does NOT render a `Viewing at <short-sha>` pill
- **AND** the per-file last-commit strip above the tablist already carries the `Viewing at <short-sha>` pinned-state indicator
- **AND** no `Modified locally` pill is shown regardless of working-tree state

#### Scenario: Wrap toggle is shared with the file viewer

- **WHEN** the user toggles wrap off in the file viewer's Code tab
- **AND** then switches to the Blame tab
- **THEN** the Blame tab also renders in wrap-off mode

#### Scenario: Sticky-left on desktop pins both metadata and gutter

- **WHEN** the user views the Blame tab at viewport width ≥768px with wrap off
- **AND** scrolls a chunk's code cell horizontally
- **THEN** the chunk-metadata column AND the line-number gutter both remain pinned to the left edge

#### Scenario: Mobile layout stacks metadata above lines

- **WHEN** the user views the Blame tab at viewport width below 768px
- **THEN** each chunk renders its metadata as a header strip above its line range

#### Scenario: Untracked empty state

- **WHEN** the user activates the Blame tab on a file the blame endpoint reports as `not_found` because it is untracked
- **THEN** the view renders an empty state reading `This file is untracked. No blame available.`

#### Scenario: Timeout empty state

- **WHEN** the blame endpoint responds with `blame_timeout`
- **THEN** the Blame view renders an empty state distinct from the generic internal-error state

#### Scenario: Unknown language falls back to plain monospace

- **WHEN** the Blame view renders a file whose extension has no registered grammar
- **THEN** the code cell renders as plain monospace text with no `hljs-*` token spans

### Requirement: Blame view progressive loading and stale-while-revalidate

The Blame view's two data inputs — `/raw/<path>[?ref=<sha>]` (bytes; ~milliseconds) and `/api/git/blame[?ref=<sha>]` (commit-DAG walk; commonly seconds) — SHALL load independently. The view SHALL paint file content + line-number gutter as soon as the bytes resolve, even if blame is still in flight. While the blame response is pending, the view SHALL render a single placeholder chunk spanning the entire file whose metadata cell reads `Computing blame…`.

The SPA SHALL maintain an in-memory cache of blame responses keyed by `(path, ref)` for the lifetime of the SPA tab, where `ref` is the empty string for working-tree blame and the resolved SHA when the view is pinned via `ref`. On mount, the view SHALL read the cache synchronously: if an entry exists, the cached chunks SHALL render immediately. The view SHALL ALSO fire a background fetch on every mount — the cache is stale-while-revalidate.

While a background fetch is in flight and cached chunks are visible, the view SHALL render a `Refetching blame…` status pill above the chunk list. The pill SHALL be removed when the background fetch settles.

At most one HTTP request SHALL be in flight per `(path, ref)` key at any time. A remount that arrives while a request is still pending SHALL await the same Promise rather than triggering a duplicate. The cache write SHALL be triggered by request settlement, not by component mount, so a request started by an unmounted component still populates the cache on completion.

The cache is **client-side**; it does NOT relax the server-side "Caching of any kind" non-goal.

The cache SHALL NOT persist across page reloads.

#### Scenario: Cold mount renders content before blame resolves

- **WHEN** the user opens the Blame tab on a file with no cached blame entry
- **THEN** the file content + line-number gutter render as soon as `/raw/<path>` resolves
- **AND** a single placeholder chunk spanning the entire file shows `Computing blame…` in its metadata cell

#### Scenario: Warm mount renders cached chunks instantly

- **WHEN** the user opens the Blame tab on a file whose blame entry is in the cache
- **THEN** the cached chunks render synchronously on first paint
- **AND** a `Refetching blame…` status pill is rendered above the chunk list

#### Scenario: Cache distinguishes working-tree and pinned entries

- **WHEN** the user views `/view/foo.go?view=blame` (working tree), then opens `/view/foo.go?view=blame&ref=<sha>` (pinned) in a new tab within the same SPA process
- **THEN** the two views maintain independent cache entries keyed `(foo.go, "")` and `(foo.go, <sha>)`
- **AND** the warm-mount behaviour applies per-key

#### Scenario: Refetching pill disappears when background fetch settles

- **WHEN** the background blame fetch resolves successfully
- **THEN** the cached chunks are replaced with the fresh response (when different)
- **AND** the `Refetching blame…` pill is removed

### Requirement: Per-file last-commit strip in the file viewer

When the served root is a git repository (`is_repo: true`), the file viewer at `/view/<path>` SHALL render a "last commit" strip between the file header and the content area. The strip SHALL render for every file kind (text, markdown, image, non-previewable, error states).

The strip SHALL render as two rows: an upper **summary row** carrying the commit metadata (or an "Untracked / No commits yet" placeholder), and a lower **action row** carrying an optional status pill on its leading edge and the "History" affordance on its trailing edge.

The strip SHALL render in one of three states in working-tree mode (when the file viewer is not pinned via `?ref=`), determined by the file's working-tree status and by a `GET /api/git/commits?path=<path>&limit=1` lookup:

- **Clean tracked file**: the summary row displays `<short_sha> · <subject> · <author_name> · <relative-time>`; the action row carries only the "History" affordance.
- **Modified locally**: the summary row displays the same one-line commit summary as the clean state. The action row carries a `Modified locally` status pill on its leading edge and the History affordance on its trailing edge.
- **Untracked**: the summary row displays the message `No commits yet`. The action row carries an `Untracked` status pill on its leading edge and the History affordance on its trailing edge.

When the file viewer is pinned via `?ref=<sha>`, the strip SHALL render a **pinned variant**:
- The summary row SHALL display the pinned commit's metadata: `<short_sha> · <subject> · <author_name> · <relative-time>` resolved from the `ref` SHA (NOT from a `/api/git/commits?path=<path>&limit=1` lookup against the working tree).
- The short_sha and subject SHALL be linked to `/git/commits/<full-sha>` for the pinned commit.
- The action row SHALL carry a `Viewing at <short-sha>` status pill on its leading edge (same visual treatment as the `Modified locally` pill) and the History affordance on its trailing edge.
- The History affordance SHALL link to `/git/commits?path=<encoded path>&ref=<full-sha>` so the user can navigate the history starting from the pinned commit.
- The "Modified locally" and "Untracked" pills SHALL NOT appear in the pinned variant regardless of working-tree state.
- The strip SHALL NOT render an explicit "Back to working tree" button — the pinned pill is purely informational; escape is via URL editing or browser back.

The pinned-variant pill SHALL be the SPA's sole rendering of the pinned-state indicator on the file viewer — the file viewer's head SHALL NOT also display a `Viewing at <sha>` pill (see the `web-ui` capability's "SPA file URL renders file viewer" requirement).

The strip SHALL NOT render when `is_repo` is false.

#### Scenario: Clean tracked file (working tree)

- **WHEN** the file viewer renders `/view/internal/server/api.go` (working tree, no `ref`) on a clean tracked file
- **THEN** the strip's summary row reads `<short_sha> · <subject> · <author_name> · <relative-time>`
- **AND** the action row contains only the History affordance

#### Scenario: Modified locally (working tree)

- **WHEN** the file viewer renders `/view/foo.go` (no `ref`) on a file present in the unstaged section of `/api/git/status`
- **THEN** the action row carries a `Modified locally` pill on its leading edge

#### Scenario: Untracked file (working tree)

- **WHEN** the file viewer renders `/view/notes.txt` (no `ref`) on a file in the untracked section
- **THEN** the summary row reads `No commits yet`
- **AND** the action row carries an `Untracked` pill

#### Scenario: Pinned variant

- **WHEN** the file viewer renders `/view/foo.go?view=code&ref=abc1234567890abcdef1234567890abcdef12345`
- **THEN** the strip's summary row reads `abc1234 · <subject> · <author_name> · <relative-time>` for that commit
- **AND** the short_sha is a link to `/git/commits/abc1234567890abcdef1234567890abcdef12345`
- **AND** the action row carries a `Viewing at abc1234` pill on its leading edge
- **AND** the History affordance links to `/git/commits?path=foo.go&ref=abc1234567890abcdef1234567890abcdef12345`
- **AND** no `Modified locally` or `Untracked` pill is shown regardless of working-tree state
- **AND** no explicit "Back to working tree" button is rendered (escape is via URL editing)

#### Scenario: Not in a repo

- **WHEN** the served root has no `.git`
- **THEN** the file viewer renders no strip at all

#### Scenario: Strip renders for all file kinds

- **WHEN** the file viewer renders an image file or a non-previewable file in a repo
- **THEN** the strip still renders in its appropriate state (clean / modified / untracked / pinned)

## ADDED Requirements

### Requirement: Diff file headers link to the file at the commit

In the `FileDiffCard` component (used by the commit-detail view and the working-tree status view), the file path in the header row SHALL be rendered as a clickable hyperlink that opens the file viewer pinned to the relevant commit (or to the working tree, depending on diff source) in a new browser tab.

Link semantics by diff source:

- **Commit-detail diff** (`source === 'commit'`, with `sha` set to the diff's commit SHA):
  - For non-renamed entries (status A, M, D, or any other non-R), the displayed `path` (typically `new_path` or, for deletions, `old_path`) SHALL be a single link with `href = /view/<path>?view=<default-for-kind>&ref=<full-sha>` (or with `view=` omitted for image/non-previewable kinds — see below).
  - For renamed entries (`status === 'R'`, both `old_path` and `new_path` set), BOTH paths SHALL be rendered as links:
    - `new_path` link: `href = /view/<new_path>?view=<default-for-kind>&ref=<full-sha>`.
    - `old_path` link: `href = /view/<old_path>?view=<default-for-kind>&ref=<full-sha>%5E` (parent commit via `^`, URL-encoded).
  - The arrow separator (`→`) between `old_path` and `new_path` SHALL remain non-clickable text.

- **Staged / unstaged diff** (`source === 'staged'` or `source === 'unstaged'`, no `sha`):
  - The displayed `path` SHALL be a link with `href = /view/<path>?view=<default-for-kind>` (no `ref=` — working-tree mode).
  - Renamed entries SHALL render both paths as links in the same form (no `ref` for either side).

Default view per file kind (derived from `extToLanguage` / kind inference on the path's extension, or — if the kind is unknown until fetch — defaulted at link-emission time based on path-extension heuristics colocated with the file viewer's tab logic):
- `markdown` (`.md`, `.markdown`) → `view=preview`.
- `text` (any extension classified as text/code by the SPA) → `view=code`.
- `image` (any extension classified as image) → `view=` parameter OMITTED (no tablist for images).
- Non-previewable (no other classification) → `view=` parameter OMITTED.

All links SHALL have `target="_blank"` and `rel="noopener noreferrer"` so they open in a new tab without exposing the opener context.

The link SHALL be visually distinguishable from the surrounding header row (e.g. underline on hover, the same affordance pattern used by other in-app links). The link's text content SHALL be exactly the path string (`old_path`, `new_path`, or the single path), with no truncation that hides the filename.

For binary files (`file.is_binary === true`), the link SHALL still be present and SHALL still open the file viewer at the appropriate URL; the viewer renders its standard `not_utf8` / non-previewable fallback for binary content.

#### Scenario: Commit-detail non-rename link

- **WHEN** a `FileDiffCard` renders a non-rename entry for `path = web/src/App.tsx` in a commit-detail view with sha `abc1234567890abcdef1234567890abcdef12345`
- **THEN** the path is rendered as `<a href="/view/web/src/App.tsx?view=code&ref=abc1234567890abcdef1234567890abcdef12345" target="_blank" rel="noopener noreferrer">web/src/App.tsx</a>`

#### Scenario: Commit-detail rename links both paths

- **WHEN** a `FileDiffCard` renders a renamed entry with `old_path = web/src/Old.tsx`, `new_path = web/src/New.tsx`, sha `abc1234567890abcdef1234567890abcdef12345`
- **THEN** the header renders two links:
  - `<a href="/view/web/src/Old.tsx?view=code&ref=abc1234567890abcdef1234567890abcdef12345%5E" target="_blank" rel="noopener noreferrer">web/src/Old.tsx</a>`
  - `<a href="/view/web/src/New.tsx?view=code&ref=abc1234567890abcdef1234567890abcdef12345" target="_blank" rel="noopener noreferrer">web/src/New.tsx</a>`
- **AND** the `→` arrow between them is plain text, not a link

#### Scenario: Markdown file uses Preview default

- **WHEN** the entry's path ends in `.md` (or `.markdown`) in a commit-detail diff
- **THEN** the link's `view=` query parameter is `preview`

#### Scenario: Image / non-previewable files omit `view=`

- **WHEN** the entry's path is an image (`logo.png`) or a non-previewable binary (`archive.zip`)
- **THEN** the link's URL has no `view=` parameter (e.g. `/view/logo.png?ref=<sha>`)
- **AND** the URL still has `ref=<sha>` (or no `ref=` for staged/unstaged)

#### Scenario: Staged diff omits `ref=`

- **WHEN** a `FileDiffCard` renders a staged diff (`source === 'staged'`, no `sha`) for `path = foo.go`
- **THEN** the link is `<a href="/view/foo.go?view=code" target="_blank" rel="noopener noreferrer">foo.go</a>`

#### Scenario: Unstaged diff omits `ref=`

- **WHEN** a `FileDiffCard` renders an unstaged diff (`source === 'unstaged'`, no `sha`) for `path = foo.go`
- **THEN** the link is `<a href="/view/foo.go?view=code" target="_blank" rel="noopener noreferrer">foo.go</a>`

#### Scenario: Binary file still links

- **WHEN** a `FileDiffCard` renders a binary file entry (`is_binary === true`)
- **THEN** the path is still rendered as a link with the same rules as for text/markdown entries
- **AND** activating the link opens the file viewer which renders the non-previewable fallback

#### Scenario: Link opens in new tab

- **WHEN** the user activates a filename link in a `FileDiffCard`
- **THEN** the browser opens the URL in a new tab (the link has `target="_blank"`)
- **AND** the new tab's `window.opener` is `null` (`rel="noopener"` is present)
