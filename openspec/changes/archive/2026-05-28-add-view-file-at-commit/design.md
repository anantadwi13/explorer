## Context

The git-reader package can already load a blob from a commit's tree (`r.loadCommitSides` and `r.lookupBlobInTree` in `internal/server/git/patch.go`), but the only public surface that uses it is `/api/git/patch`, which returns *diff hunks*, not file contents. To open "a file as it existed at commit X" we need to expose blob bytes (plus its detected MIME and size) directly. The endpoints that currently serve a file's bytes / metadata / blame are `/raw/<path>`, `/api/meta?path=<p>`, and `/api/git/blame?path=<p>` — all of them work from the filesystem-resolved working tree via `resolver.Resolve`.

Two consumer surfaces need to use the new capability:

1. The file viewer itself, when its URL carries `?ref=<sha>`. The `add-markdown-three-tab-view` change reserved a forward-compatible commit-pin parameter under the name `at`; this change renames it to `ref` (see the URL-parameter decision below) and gives it functional semantics.
2. The diff cards in `CommitDetailPage` and `StatusPage`. Today the filename in `FileDiffCard.tsx` is a plain `<span>` — turning it into a deep link is what makes the feature discoverable.

This proposal is sequenced after `add-markdown-three-tab-view` so the URL grammar (always-explicit `view=`, kind-defaults) is already in the web-ui / git-reader specs and in `FileViewer.tsx` before this change touches them. The prior `at=` reservation is superseded by this change's MODIFIED "Code and Blame tabs in the file viewer" requirement.

## Goals / Non-Goals

**Goals:**

- A single shared way for the server to read a file's blob bytes at a commit, exposed as `r.BlobAt(sha, path)` on the git `Repo` type and reused by `/raw/?ref=`, `/api/meta?ref=`, and (indirectly) `/api/git/blame?ref=`.
- The three endpoints behave identically to their working-tree forms when `ref` is absent (no observable change for callers that don't opt in).
- The file viewer in pinned mode shows the same `[Preview | Code | Blame]` UX, with the bytes coming from the commit's tree and blame answering "blame from `<sha>` backward".
- Diff card filenames are clickable links that open in new tabs, including renamed files with both old and new paths.
- The security model is uniform: working-tree requests go through `resolver.Resolve`; ref-scoped requests bypass it and use git-tree containment, with the spec explaining the distinction.

**Non-Goals:**

- Folder listings at a commit (`/api/tree?path=…&ref=…`). The spec for `/api/tree` is unchanged in this proposal.
- A pinned-mode equivalent for the working-tree-only UI elements that have no commit analogue (e.g. "untracked file" empty state, "modified locally" pill).
- Caching strategy beyond what already exists. The SPA's blame cache is re-keyed on `(path, ref)`; the server relies on go-git's object cache.

## Decisions

### Endpoint shape: extend, don't fork

`/raw/<path>?ref=<sha>`, `/api/meta?path=<p>&ref=<sha>`, and `/api/git/blame?path=<p>&ref=<sha>` each gain an optional `ref` parameter rather than getting a sibling endpoint (`/api/git/raw`, `/api/git/meta`, …). The shape that the consumer sends is "give me file X, here's an optional commit pin", and that maps cleanly onto a single endpoint with one extra knob.

**Alternatives considered:**

- Parallel git-scoped endpoints (`/api/git/raw`, `/api/git/meta`). Rejected because callers would have to choose at request time which endpoint to hit based on whether `ref` is set, and most of the response logic (MIME detection, error envelope, cap enforcement) is identical. Forking the endpoints duplicates that logic.
- A single unified `/api/git/blob` endpoint with `ref` optional. Rejected because it forces a churn through every SPA call site for working-tree reads with no benefit; the existing endpoints already do the right thing in the working-tree case.

### `ref=` grammar is unified across all three endpoints

`ref=` SHALL accept the same set of values on `/api/meta`, `/raw/`, and `/api/git/blame`: a branch name, a tag name, a full 40-character SHA, an unambiguous SHA prefix (≥4 chars), or any of the above followed by a `^` suffix for the first parent. This matches the grammar `/api/git/blame?ref=` already exposes today.

The implementation shares one helper — `r.resolveRefToCommit` (already used by `commits.go` and `blame.go`) extended with `^`-suffix support. `BlobAt` calls it instead of `resolveSHAPrefix` directly, so all three endpoints route through one resolution path.

Naming-wise: the parameter is called `ref` (not `sha`) precisely because it accepts more than a SHA. The endpoint contract on the new endpoints is "show me this file at the state named X", which is naturally polymorphic over branch / tag / commit. Compare to `/api/git/commit?sha=`, where the contract is "give me this exact commit object" — that one stays SHA-only because branch/tag would imply "whatever commit the tip currently points to", which is the wrong mental model for fetching commit metadata. Different word, different contract.

**Alternatives considered:**

- SHA-only on `/raw/` and `/api/meta` (matching `/api/git/commit?sha=`). Rejected — `/api/git/blame?ref=` already accepts branch/tag, and three endpoints sharing one parameter name should share one grammar. A user typing `/raw/foo.md?ref=main` should not get `unknown_ref` while `/api/git/blame?path=foo.md&ref=main` works.
- SPA writes full SHAs in all generated links regardless. Kept — this is still the design (see "`ref=<sha>` is always the full 40-char SHA when written by the SPA"). Branch/tag support is for hand-typed URLs and ad-hoc tools; SPA-generated links stay stable across branch movement.

### Security boundary: two-mode containment

`/raw/<path>` today guarantees containment by:

1. Cleaning the path, rejecting `..` / absolute paths.
2. Joining to the served root.
3. `filepath.EvalSymlinks`-ing the result.
4. Checking prefix-containment under the root.

When `ref` is set, none of those steps apply. The path is looked up in the git tree object via `r.lookupBlobInTree`. A tree path is just a series of `name` strings indexed into nested tree objects — `..` is not a tree component (git rejects it at commit-time), there are no symlinks at this layer (a symlink in a git tree is just a blob whose mode is `120000`, which `lookupBlobInTree` returns as a blob to render, not to follow), and the lookup is implicitly bounded to the tree of the commit.

This is a **second containment model**, not a workaround. The `path-resolver` capability spec is amended to spell this out:

- Working-tree requests (`ref` absent) → containment via `resolver.Resolve` (filesystem, symlink-aware).
- Ref-scoped requests (`ref` present) → containment via `lookupBlobInTree` (git-tree, structural).
- A request MUST go through exactly one of the two paths. Routing happens in the handler before any filesystem call.

**Alternatives considered:**

- Run ref-scoped requests through `resolver.Resolve` as well (resolve filesystem, then look up the same path in the git tree). Rejected because (a) the filesystem path may not exist (file deleted since the commit) and the request must still succeed, and (b) it adds a redundant security step on a path already structurally bounded.

### `r.BlobAt(sha, path)` — public shared loader

A new file `internal/server/git/blob.go` introduces:

```go
// BlobAt returns the blob bytes, the detected MIME, its size, and the
// commit's author timestamp. The bytes are returned as-is regardless of
// whether the blob is text or binary — consumers (notably /raw/?ref=) are
// responsible for any kind-based handling. It returns ErrUnknownRef if sha
// cannot be resolved, and ErrNotFound if the file is absent from the
// commit's tree.
func (r *Repo) BlobAt(sha, path string) (bytes []byte, mime string, size int64, when time.Time, err error)
```

The implementation is a thin refactor of the existing `loadCommitSides` + `lookupBlobInTree` pair from `patch.go`, hoisted into the new file so both `patch.go` and the new `/raw/` / `/api/meta` handlers share one path. `patch.go` is updated to call the shared helper to avoid drift.

**Alternatives considered:**

- Leave `lookupBlobInTree` private and have handlers reach into the git package via a wider API. Rejected — wider APIs without consolidation invite parallel code paths for the same logic. One public entry point now is cheaper than retrofitting one later.

### Blame at a ref: from-sha-backward

`/api/git/blame?path=<p>&ref=<sha>` passes `<sha>` as the starting commit to go-git's blame implementation. Each returned chunk attributes lines to the most recent commit ≤ `<sha>` that introduced them.

When `ref` is set:

- The response's `uncommitted` chunk variant does NOT appear (no working-tree concept).
- The `dirty` response field is `false`.
- The cache key on the SPA side becomes `(path, ref)` rather than `(path, "")`.

### URL parameter is `?ref=<sha>` on both the SPA URL and the HTTP API

The pinned-commit query parameter SHALL be named `ref` on both surfaces: the SPA viewer URL (`/view/<path>?view=…&ref=<sha>`) and the HTTP endpoints (`/api/meta?ref=`, `/raw/?ref=`, `/api/git/blame?ref=`). One name everywhere — no SPA↔HTTP translation step, no two-name confusion.

This **supersedes** the `at` parameter reservation that `add-markdown-three-tab-view` placed in the live `git-reader` URL grammar spec. The prior change wrote `at=` purely as a reserved-for-future-use parameter (ignored on parse, preserved on emit) and no SPA code reads it yet. This change renames the reservation to `ref=` and gives it functional semantics in the same delta — the MODIFIED "Code and Blame tabs in the file viewer" requirement replaces the prior text wholesale, so there's no stranded `at=` reservation in the live spec after this change archives.

**Alternatives considered:**

- Keep the original SPA-side `at=` ↔ HTTP-side `ref=` split. Rejected — `at=` is friendlier in URLs, but the translation step (`FileViewer.tsx` reads `at=`, calls `api.meta(path, ref)` which writes `ref=`) is one more thing to keep correct in tests, code review, and future endpoints. The win was small; the unified name removes the seam.
- Use `at=` for both. Rejected — `?at=` reads ambiguously in an HTTP context ("at what? a time? a path?") and doesn't match git's vocabulary or the existing `/api/git/commit?sha=` style. `ref=` is the term git itself uses.

### `ref=<sha>` is always the full 40-char SHA when written by the SPA

`FileDiffCard` already has the full SHA in its props (passed from `CommitDetailPage`); using it directly in the link removes prefix-resolution ambiguity for future link-sharers. The SPA still accepts prefix matches and branch/tag names on inbound URLs (`/api/meta?ref=abc1234` and `/api/meta?ref=main` both resolve via the shared `r.resolveRefToCommit` helper).

**Alternatives considered:**

- Short SHAs in links for prettier URLs. Rejected — short SHAs collide as repos grow; "stable link" is more valuable than "pretty link" for a feature that is mostly opened in new tabs to compare against the working tree.

### Renamed files: both paths clickable, parent-ref via `^`

For a renamed file in a commit's diff (`status === 'R'`, both `old_path` and `new_path` set):

- `new_path` → `/view/<new_path>?view=<default>&ref=<full-sha>` (file in the commit's tree).
- `old_path` → `/view/<old_path>?view=<default>&ref=<full-sha>%5E` (file in the parent commit's tree).

The caret (`^`) is URL-encoded as `%5E` for unambiguous round-tripping (RFC 3986 sub-delims allow `^` unencoded in query strings on most browsers, but encoded form is what `URLSearchParams.toString()` produces). The server resolves `abc1234^` (and `main^`, etc.) via the shared `r.resolveRefToCommit` helper extended with `^`-suffix support — see the locked-in decision below.

For root commits (no parent), `ref=<sha>^` resolves to "empty tree" → the API returns `not_found` for any path, and the file viewer renders the standard `not_found` error state.

**Alternatives considered:**

- Link only `new_path`. Rejected — the user explicitly asked for both clickable. The rename's old-side is meaningfully different from the new-side, and seeing it in isolation is exactly when a user wants to open it.
- Use the parent SHA literally (`r.parent(sha)`) instead of `<sha>^`. Equivalent semantics; `<sha>^` lets the SPA build the URL without needing the parent SHA in props.

### Relative links inside pinned markdown propagate `ref`

When `FileViewer` is in pinned mode and the active tab is Preview, the rendered markdown contains relative `<img src>` and `<a href>` references that today are rewritten to `/raw/<sibling>` and `/view/<sibling>` by `MarkdownRenderer`'s rehype plugin. In pinned mode, those rewritten URLs SHALL carry `ref`/`ref=` so the browsing experience stays pinned:

- `<img src="./diagram.png">` → `/raw/path/to/diagram.png?ref=<full-sha>`.
- `<a href="./api.md">` → `/view/path/to/api.md?view=preview&ref=<full-sha>`.

This requires extending `MarkdownRenderer`'s `Props` interface with an optional `ref?: string` and threading it through the rewrite plugin. `FileViewer` passes the prop down when its own `ref` prop is set.

**Alternatives considered:**

- Drop pinning on `<a href>` clicks (relative `<img>` would still need `ref` to render correctly). Rejected — inconsistent behaviour between two kinds of relative references is harder to explain in the spec than "all relative refs stay pinned". URL editing (or the absence of `ref=` on a link the user types or follows externally) is the documented escape from pinned mode.
- Leave `<a href>` clicks unpinned and `<img src>` pinned (image is required for the page to render correctly; nav is optional). Rejected for the same reason — asymmetric rules invite surprise.

### Image / non-previewable links omit `view=`

Per the URL grammar established in `add-markdown-three-tab-view`, the SPA always emits an explicit `view=` for files that *have* a tablist. Image and non-previewable files have no tablist; emitting `view=image` or `view=binary` would invent a value the URL grammar doesn't define. The diff link for those kinds is `/view/<path>?ref=<sha>` — `view=` absent. The viewer's tolerant-parse rule already handles this: absent `view=` falls back to the kind's natural default.

This is the one place where "always explicit `view=`" is intentionally violated, because there is no view to be explicit about. The web-ui spec note about always-explicit emission is amended to clarify "for kinds with a tablist".

**Alternative considered:** introduce `view=image` and `view=binary` as inert values. Rejected — adds vocabulary the rest of the spec doesn't need; the tolerant-parse rule already gives the right behaviour.

### Pinned-mode UI: strip is the sole indicator

When `FileViewer` has a `pinnedRef` prop set, the pinned-state visual surface is intentionally minimal:

- **File head**: stays clean. No `Viewing at <sha>` pill, no escape button. The head continues to show only the filename, meta line, and viewer-level actions (back / wrap / copy / download). Download's `href` includes `ref=` so saved bytes match the pinned commit.
- **Per-file last-commit strip**: renders the pinned variant. The summary row shows the pinned commit's metadata (resolved via `/api/git/commit?sha=<full-sha>`). The action row carries a `Viewing at <short-sha>` pill on its leading edge and the History affordance on the trailing edge. `Modified locally` and `Untracked` pills are suppressed.
- **Blame view**: does NOT render its own pinned pill. The strip above the tablist is the single, consistent place the indicator lives — duplicating it inside Blame would be redundant. `Modified locally` cannot appear in pinned mode (server returns `dirty: false`; the SPA also guards defensively). `Computing blame…` and `Refetching blame…` continue to work in both modes.
- **No "Back to working tree" UI affordance anywhere.** Users escape pinned mode by editing the URL (address bar, browser back, or by following a link that doesn't carry `ref=`). The pinned pill is purely informational. This is a deliberate UX choice in favour of a clean surface — added at user direction during implementation.

**Alternative considered:** carry the pill in two or three places (head + strip + Blame) so the indicator is impossible to miss. Rejected — the surface multiplied without adding information, and the head pill in particular cluttered the filename row at narrow viewports.

## Risks / Trade-offs

- **Risk**: Extending `/raw/` to two modes makes the threat model harder to reason about at a glance. → **Mitigation**: explicit spec text in `path-resolver` describing the two paths, with a one-line comment in the handler. Code-reviewers reading either side should hit the docs immediately.
- **Risk**: Diff cards that auto-expand multiple files (the first 3 in commit-detail) now render anchor tags whose `href` attribute is computed on every render — minor cost for very wide diffs. → **Mitigation**: `href` is a pure derivation from `file` + `sha`; cheap. If profiling later shows a hot path, memoize.
- **Risk**: A user opens a deep link with `?ref=<short-sha>` that becomes ambiguous as the repo grows. → **Mitigation**: SPA writes full 40-char SHAs in all generated links; only manually typed URLs would carry short SHAs or branch/tag names. The shared `r.resolveRefToCommit` helper today collapses ambiguous SHA prefixes (">1 matches") and unknown refs ("0 matches") into the same `ErrUnknownRef` (see `internal/server/git/commits.go`'s `resolveSHAPrefix` path), and this proposal does not introduce a separate `ambiguous_ref` kind. The SPA's typed-error state for `unknown_ref` therefore covers both cases without additional UI work.
- **Risk**: `<sha>^` resolution requires either a server-side extension to `r.resolveSHAPrefix` or a client-side detour through `/api/git/commit` to fetch the parent SHA. → **Mitigation**: pick a path during implementation refresh. Both are small; server-side is closer to the existing API surface. Server-side is recommended in the design but not locked in.
- **Trade-off**: The blame response shape gains a "mode" (working-tree vs ref) that consumers (SPA, future API clients) must handle. → **Mitigation**: the shape stays the same; only the `uncommitted` chunk variant and `dirty: true` go absent. Existing SPA code already handles the case where neither appears (clean working tree).
- **Trade-off**: Opening files in new tabs ignores the user's pinned-vs-working-tree preference on subsequent navigations from the diff card — every link is a fresh tab. Reasonable behaviour for "open this file at this commit", less so for "I want all diff-card clicks to behave a certain way". → **Mitigation**: not a real risk; matches every diff viewer's default behaviour and the user explicitly asked for new-tab.
- **Risk**: A merge commit's `<sha>^` chooses the first parent only — second-parent paths are unreachable from a renamed-old-path link in a merge diff. → **Mitigation**: matches how `/api/git/commit` already diffs merge commits (first parent only). Document the limitation; no change to behaviour for the common (non-merge) case.

## Migration Plan

Single-shot deployment after `add-markdown-three-tab-view` has landed. The change is committed as one PR including:

1. Go source for new endpoint branches and `BlobAt`.
2. Go tests for the new endpoint behaviours.
3. SPA source for diff-card links, viewer pinned mode, and updated API client.
4. SPA tests for the new behaviours.
5. Regenerated `internal/server/ui/dist/`.
6. Spec deltas across `http-api`, `git-reader`, `path-resolver`, `web-ui`.
7. Optional GIF regen depending on whether the diff card UI is visible in the demos.

Rollback: `git revert`. No data, no migrations, no external-side-effects to undo.

## Decisions Locked In Post-Review

> This proposal is drafted before the implementation of `add-markdown-three-tab-view`. After review, the following decisions were locked in to keep the spec and tasks coherent.

- **`<sha>^` resolution**: **Server-side.** The `r.resolveSHAPrefix` helper (or a sibling) is extended to accept a trailing `^` and return the first parent commit. On a root commit, returns `ErrUnknownRef`. This keeps a single resolution path for all callers and avoids an extra SPA round-trip to `/api/git/commit` per rename old-path link. Fallback to SPA-side resolution is possible if blockers appear but is not the planned path.
- **Pinned-mode last-commit strip**: **Pinned variant.** The strip continues to render in pinned mode and shows the pinned commit's metadata (resolved via `/api/git/commit?sha=<full-sha>`) with a `Viewing at <short-sha>` pill on the action row and a History affordance routed with `&ref=<full-sha>`. The `Modified locally` and `Untracked` pills are suppressed. This preserves the "every file kind shows the strip" invariant established by the existing requirement and gives the user a single, consistent place to see commit context.
- **Relative links inside pinned markdown carry `ref=`**: When `MarkdownRenderer` is invoked with a `pinnedRef` prop, its rewrite plugin propagates `ref` into both kinds of relative links — `<img src>` becomes `/raw/<sibling>?ref=<full-sha>`; `<a href>` becomes `/view/<sibling>?view=<default-for-kind>&ref=<full-sha>`. This matches the "browsing the repo at a point in time" mental model. URL editing is the documented escape from pinned mode (no UI affordance is rendered — see "Pinned-mode UI: strip is the sole indicator").
- **`view=` for image / non-previewable in pinned links**: Omit. Image and non-previewable kinds have no tablist; emitting `view=image` or `view=binary` would invent a value the URL grammar doesn't define. The viewer's tolerant-parse rule handles absent `view=` correctly. If ViewPage ever needs an explicit value to mount the right renderer, a future change can introduce one.
- **Blame cache eviction in pinned mode**: **LRU with a cap of 32 entries.** The SPA's in-memory blame cache is re-keyed from `path` to `(path, ref ?? "")`. Pinned-mode browsing (e.g. clicking through a commit's renamed files) can otherwise accumulate one entry per visited `(path, ref)` pair for the tab's lifetime. The cache replaces its current map with a small LRU keyed on the composite tuple; on insert beyond the cap, the least-recently-used entry is evicted. 32 is large enough to cover the working set of a typical browsing session (a dozen files across two or three commits) without growing unbounded. Working-tree entries (`ref === ""`) participate in the same LRU — there is no separate bucket.

## Open Questions

The following items remain open and should be picked during implementation:

- **API client typing for the `ref` argument**: optional positional vs options-object. Pick during implementation; aim for consistency with the existing `api.getGitPatch({source, sha, ...})` style.
- **Inbound short-SHA URLs**: When a user opens `/view/foo.go?view=code&ref=abc1234` (prefix), should the SPA rewrite the URL to the full SHA after the server resolves the prefix, or leave the user's typed value as-is? The current spec leaves it as-is (matches the tolerant-parse posture for `view=`); confirm during implementation that this matches user expectations.
