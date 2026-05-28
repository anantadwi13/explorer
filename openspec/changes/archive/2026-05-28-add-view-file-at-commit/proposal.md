## Why

Today the file viewer always serves working-tree bytes. When users browse a commit's diff in `CommitDetailPage` or a tracked-changes diff in `StatusPage`, the filenames are plain `<span>` elements — there is no way to open a file as it existed at that commit without leaving the SPA. This makes the diff useful for reading hunks but a dead-end for asking the natural follow-up question, "what did this file look like at that commit?".

The git-reader package already loads commit-pinned blobs internally (`r.loadCommitSides` / `r.lookupBlobInTree` in `internal/server/git/patch.go`); it is not exposed to the SPA. This change wires that capability through the existing endpoints and turns the diff card's filenames into deep links that open the file pinned to a commit in a new tab, with the same `[Preview | Code | Blame]` model the `add-markdown-three-tab-view` change establishes.

> **Dependency**: this change is a follow-up to `add-markdown-three-tab-view`. That change reserved a forward-compatible commit-pin query parameter (named `at` at the time, with no functional behaviour — ignored on parse, preserved on emit). This change **renames the reservation to `ref=`** and gives it functional semantics. The rename is justified in design.md ("URL parameter is `?ref=<sha>` on both the SPA URL and the HTTP API") and is realised via the MODIFIED "Code and Blame tabs in the file viewer" requirement in the `git-reader` spec delta, which replaces the prior reservation text wholesale. Because no SPA code reads `at=` today, there is no URL-compatibility shim — this is a clean rename.

## What Changes

- `/raw/<path>`, `/api/meta?path=<p>`, and `/api/git/blame?path=<p>` SHALL accept an optional `?ref=<value>` query parameter. `ref` accepts a branch name, tag name, full SHA, unambiguous SHA prefix, or any of these followed by a `^` suffix for the first parent — the same grammar `/api/git/blame?ref=` already uses today. When present, the endpoint serves the file as it existed at the named commit (or returns a typed error if the ref or path does not resolve).
- The `/api/git/blame?ref=<sha>` mode returns blame "from `<sha>` backward" — each line is attributed to the most recent commit ≤ `<sha>` that introduced it. Uncommitted chunks and the `dirty` flag are absent in this mode (no working-tree concept exists).
- The SPA file viewer (`FileViewer.tsx`) accepts an optional commit pin parsed from `?ref=<sha>` in the route. Pinned mode threads `ref` through all API calls and disables the working-tree-only affordances (the last-commit strip uses the pinned commit as its anchor, blame's "Modified locally" pill never appears). The strip renders a single `Viewing at <short-sha>` indicator on its action row — no pill in the file head, no pill inside the Blame view, no explicit "Back to working tree" UI affordance. Users escape pinned mode by editing the URL or following a link without `ref=`.
- `FileDiffCard` (used by `CommitDetailPage` and `StatusPage`) renders filenames as `<a>` links that open in a new tab (`target="_blank" rel="noopener noreferrer"`). The link's `?ref=` value reflects the diff's commit context:
  - Commit-detail diffs (with a sha) → `ref=<full-sha>`; renamed files link `new_path` with `ref=<sha>` AND `old_path` with `ref=<sha>^` (parent commit, URL-encoded `%5E`).
  - Staged / unstaged diffs (no sha) → no `ref=` parameter (working-tree).
  - The link's `view=` value is derived from the file kind (`markdown` → `preview`, `text` → `code`; `image` and non-previewable kinds omit `view=` per the URL grammar — there is no tab to be explicit about).
- Path-resolver guarantees: ref-scoped requests bypass the filesystem resolver and use git-tree containment (the path either exists in the tree object or it does not — there is no `..` traversal surface). The path-resolver capability is extended to document this two-mode behavior so future endpoints handle it correctly.
- File-at-commit blob lookup is exposed as a public method on the git `Repo` type so handlers (and future callers) share one implementation.

## Capabilities

### New Capabilities
<!-- None — this change extends four existing capabilities. -->

### Modified Capabilities
- `http-api`: `/raw/`, `/api/meta`, and `/api/git/blame` gain an optional `ref` query parameter with documented semantics, a new `unknown_ref` typed error (the existing `not_found` is reused for "file absent at the named commit"), and the rule that `ref` switches the response source from the working tree to the git tree at `<sha>`.
- `git-reader`:
  - "Code and Blame tabs in the file viewer" — `ref=<sha>` semantics are honoured (was reserved in `add-markdown-three-tab-view`); the file viewer threads `ref` to every data source.
  - "Blame view rendering" — `ref` mode: no `uncommitted` chunks, no `dirty` pill, no Blame-internal pinned pill (the strip above the tablist already shows it); the SPA cache key becomes `(path, ref)`.
  - New requirement "Diff file headers link to the file at the commit" — `FileDiffCard` filenames are `<a target="_blank">`, parent-ref via `^` for rename old_paths, default-view-per-kind, omit `view=` for non-tab kinds.
- `path-resolver`: clarifies the two-mode containment story — filesystem containment via `resolver.Resolve` for working-tree requests; git-tree containment via `lookupBlobInTree` (no `..` surface) for ref-scoped requests.
- `web-ui`: file viewer header stays clean in pinned mode — no `Viewing at <sha>` pill, no escape button. The strip's pinned variant on its action row is the sole indicator. Working-tree indicators (Modified locally, Untracked) are suppressed in pinned mode.

## Impact

- **Server (Go)**:
  - `internal/server/api.go` — `/raw/` and `/api/meta` handlers branch on `?ref=`.
  - `internal/server/git/blob.go` (new file) — `r.BlobAt(sha, path) → (bytes, mime, size, mtime, error)` extracted from existing private logic in `patch.go`.
  - `internal/server/git/blame.go` — accepts optional starting commit; threads to go-git's blame API.
  - `internal/server/routes.go` — no new routes; existing handlers gain branches.
  - No new third-party dependencies (go-git already in tree).
- **Server tests**:
  - `internal/server/git/blob_test.go` (new) — blob lookup by `(ref, path)`, error paths (`ErrUnknownRef`, `ErrNotFound`, binary classification at ref).
  - `internal/server/api_test.go`, `static_test.go` (or equivalents) — `?ref=` parameter on `/raw/`, `/api/meta`.
  - `internal/server/git/blame_test.go` — `?ref=` mode; no uncommitted chunks; cache keying.
- **SPA (TS)**:
  - `web/src/api/client.ts`, `web/src/api/types.ts` — optional `ref` arg on `meta()`, `rawUrl()`, `getGitBlame()`. Add `ref` to typed function signatures.
  - `web/src/pages/ViewPage.tsx` — read `?ref=<sha>` from query, pass `ref` prop down.
  - `web/src/components/FileViewer.tsx` — accept `pinnedRef` prop, thread to every API call and child component. Pass it through to `FileLastCommitStrip` (which renders the pinned indicator) and to `MarkdownRenderer`/`BlameView` (which fetch pinned bytes). No pinned UI is rendered in the head itself.
  - `web/src/components/MarkdownRenderer.tsx` — accept optional `ref` prop and thread it through the relative-link-rewrite plugin so relative `<img>` references become `/raw/<sibling>?ref=<sha>` and relative `<a href>` references become `/view/<sibling>?view=<default-for-kind>&ref=<sha>` in pinned mode.
  - `web/src/git/FileDiffCard.tsx` — render filenames as `<a target="_blank">` with link rules.
  - `web/src/git/BlameView.tsx` — accept `ref` prop; suppress uncommitted/dirty UI when set; re-key cache on `(path, ref)`.
  - `web/src/git/FileLastCommitStrip.tsx` — accept `pinnedRef` prop; in pinned mode, fetch the pinned commit's metadata via `/api/git/commit?sha=<full-sha>` and render the `Viewing at <short-sha>` pill on the action row. Working-tree pills (Modified locally, Untracked) suppressed.
  - Component tests for each of the above.
- **Specs**: deltas in `openspec/specs/http-api/spec.md`, `openspec/specs/git-reader/spec.md`, `openspec/specs/path-resolver/spec.md`, `openspec/specs/web-ui/spec.md`.
- **Embedded SPA bundle**: `internal/server/ui/dist/*` regenerated and committed.
- **Documentation**: `docs/desktop.gif` / `docs/mobile.gif` — regenerated in the same change. The clickable filename in the diff card and the pinned-mode indicator are visible SPA UI updates, so per CLAUDE.md both GIFs must be refreshed alongside the `web/src/` changes (add a scene exercising the diff card or pinned mode if the existing scenes don't already).
- **No new HTTP routes**; **no new dependencies**.
- **Out of scope**:
  - Folder listing at a commit (`/view/<path>/?ref=<sha>`) — future capability; this change covers file viewing only.
  - Beyond standard `not_found` / `unknown_ref` error envelopes, no special UX for "file did not exist at this commit".
  - SPA-level memoisation of blob-at-ref responses beyond re-keying the existing blame cache on `(path, ref)`. go-git's object cache is relied on at the server.
