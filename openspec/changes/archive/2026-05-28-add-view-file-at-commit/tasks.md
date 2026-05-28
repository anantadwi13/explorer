## 1. Server: shared blob-at-ref loader

- [x] 1.1 Create `internal/server/git/blob.go` exposing `func (r *Repo) BlobAt(ref, path string) (bytes []byte, mime string, size int64, when time.Time, err error)`. The `ref` parameter accepts the full grammar `resolveRefToCommit` supports (branch / tag / full SHA / SHA prefix / `^` suffix). Internally, resolve `ref` via the helper from task 1.2, then load the blob using logic extracted from `loadCommitSides` / `lookupBlobInTree` in `patch.go` so both call sites share one implementation.
- [x] 1.2 Add `^` suffix support to `r.resolveRefToCommit` (or a sibling helper that wraps it). The wrapper SHALL: strip trailing `^` characters, resolve the base via `resolveRefToCommit` (which already handles branch / tag / SHA / SHA-prefix), then walk first parents for each stripped `^`. A `^` that walks off a root commit returns the existing `ErrUnknownRef`. This becomes the single resolution helper for `/raw/?ref=`, `/api/meta?ref=`, and `/api/git/blame?ref=`.
- [x] 1.3 Add unit tests in `internal/server/git/blob_test.go` covering: blob lookup at a known SHA, lookup at an unambiguous SHA prefix, lookup at a branch name, lookup at a tag name, `^` suffix on a SHA, `^` suffix on a branch name (`main^`), `^` on a root commit (errors with `ErrUnknownRef`), file absent from tree (errors with `ErrNotFound`), unknown ref (errors with `ErrUnknownRef`), binary blob bytes returned as-is at ref.
- [x] 1.4 Refactor `loadCommitSides` in `patch.go` to call the new `BlobAt` helper — no behaviour change for `/api/git/patch`.

## 2. Server: endpoint extensions

- [x] 2.1 Update `internal/server/api.go`'s `/api/meta` handler to read `?ref=` from the query string. When present, dispatch through `r.BlobAt` (bypassing `resolver.Resolve`) and synthesise the response: `size` from blob, `mime` from MIME detection on the blob bytes, `kind` from the existing classifier, `mtime` from the commit's author timestamp.
- [x] 2.2 Update `internal/server/api.go`'s `/raw/` handler similarly: when `?ref=` is present, dispatch through `r.BlobAt` and stream the bytes with the detected `Content-Type`.
- [x] 2.3 Update `internal/server/git/blame.go` to accept the new `^` ref-suffix syntax (delegated to the helper from task 1.2). No other behaviour change is needed — explicit-ref blame is already implemented and already skips the working-tree overlay.
- [x] 2.4 Add the `unknown_ref` typed error to `internal/server/errors.go` with HTTP status 404 and the same envelope shape as the other typed errors.
- [x] 2.5 Server tests: extend `internal/server/api_test.go` (or equivalent) with cases for `/api/meta?ref=…` (success at SHA, success at branch name, success at tag name, unknown ref, file absent, parent via `^`, path-escape returns `not_found` not `outside_root`) and the same for `/raw/?ref=…`. Extend `internal/server/git/blame_test.go` with a `^` suffix case and confirm pinned-mode responses have no `uncommitted` chunks. (Note: HTTP-layer path-escape `..` case is not testable through net/http ServeMux — the BlobAt unit test covers structural containment.)

## 3. SPA: API client and types

- [x] 3.1 In `web/src/api/types.ts`, add `unknown_ref` to the `ApiError` union and add `ref?: string` to relevant request types. (Already shipped via `add-markdown-three-tab-view`; verified.)
- [x] 3.2 In `web/src/api/client.ts`, extend `meta()` to accept an optional `ref` argument and pass it to `/api/meta?path=…&ref=…`. Extend `getGitBlame()` similarly. Add a `rawUrl(path, ref?)` helper (or update the existing one) so all `/raw/` URL construction is in one place.

## 4. SPA: pinned-mode file viewer

- [x] 4.1 In `web/src/pages/ViewPage.tsx`, read the `ref` query parameter from the URL and pass it as a `ref` prop to `FileViewer`.
- [x] 4.2 In `web/src/components/FileViewer.tsx`, accept an optional `ref` prop and thread it through every API call (`api.meta(path, ref)`, raw URL construction for `<img>` / download / fetch, `<BlameView ref={ref} />`).
- [x] 4.3 File head stays clean in pinned mode — no pill, no escape button. The strip's pinned variant (task 5.2) carries the sole pinned-state indicator. (User-driven design decision applied late in implementation; head-pill code was added then removed.)
- [x] 4.4 Handle the unresolvable-`ref` case: when `meta(path, ref)` returns `unknown_ref` or `not_found`, render the standard error state in the content area. The strip's pinned-state indicator (with the typed `ref=` value as the display short-sha) renders alongside so the user sees what they asked for.
- [x] 4.5 Extend `web/src/components/MarkdownRenderer.tsx` with an optional `ref?: string` prop. Thread it into the `makeRewritePlugin` factory so the plugin emits `/raw/<resolved>?ref=<ref>` for `<img src>` and `/view/<resolved>?view=<default-for-kind>&ref=<ref>` for `<a href>` when `ref` is set. Absolute / external URLs continue to pass through unchanged. `FileViewer` SHALL pass its `ref` prop down to `MarkdownRenderer` when active on the Preview tab. Add tests in `MarkdownRenderer.test.tsx` for both rewrite paths in pinned mode and confirm absolute URLs pass through.
## 5. SPA: pinned-mode blame and last-commit strip

- [x] 5.1 In `web/src/git/BlameView.tsx`, accept an optional `pinnedRef` prop. Re-key the in-memory cache from `(path, "")` to `(path, ref ?? "")` and replace the underlying map with an **LRU bounded at 32 entries** (working-tree and pinned entries share the same LRU — no separate bucket). On insert beyond the cap, evict the least-recently-used entry; on read, promote the entry to most-recently-used. Pass `ref` to `getGitBlame`. The BlameView does NOT render its own pinned-state pill — the strip above the tablist is the sole indicator (user decision late in implementation; the pill was added then removed). Suppress the `Modified locally` pill defensively when `pinnedRef` is set even if the response carries `dirty: true`.
- [x] 5.2 In `web/src/git/FileLastCommitStrip.tsx`, accept an optional `ref` prop. When `ref` is set, render the pinned variant: fetch the pinned commit's metadata via the existing `/api/git/commit?sha=<full-sha>` endpoint (singular — already exists; the `/api/git/commits` plural endpoint takes `path` and cursors, not `sha`), rather than the working-tree `/api/git/commits?path=<path>&limit=1` lookup. Show `Viewing at <short-sha>` pill on the action row; link History to `/git/commits?path=<encoded path>&ref=<full-sha>`; suppress the `Modified locally` / `Untracked` pills regardless of working-tree state.

## 6. SPA: diff card clickable filenames

- [x] 6.1 In `web/src/git/FileDiffCard.tsx`, add a small helper `viewLinkFor(file, source, sha) → { url: string }` that computes the diff-link href per the rules in the `git-reader` capability's "Diff file headers link to the file at the commit" requirement. Colocate the default-view-per-kind logic with `FileViewer`'s tab logic (extract a shared utility if it reads cleanly).
- [x] 6.2 In `FileHeaderRow` (within `FileDiffCard.tsx`), render `path` as `<a target="_blank" rel="noopener noreferrer" href={viewLinkFor(...)}>` for non-rename entries. For rename entries (`status === 'R'`), render both `old_path` and `new_path` as separate links — `old_path` uses `ref=<sha>%5E`, `new_path` uses `ref=<sha>` — with the `→` arrow as plain text between them.
- [x] 6.3 Style the link so it's visually distinguishable inside the card header (underline on hover or equivalent affordance pattern; reuse existing in-app link styles).

## 7. Tests

- [x] 7.1 Add unit tests for `viewLinkFor` covering: non-rename commit diff (sha + default view per kind), rename commit diff (both old_path with `^` and new_path), staged/unstaged diff (no `ref=`), image/non-previewable kinds (no `view=`), binary file (link still present).
- [x] 7.2 Update `web/src/git/FileDiffCard.test.tsx` (create if absent) to assert that filenames are rendered as `<a target="_blank" rel="noopener noreferrer">` with the right `href` for each diff source and file kind.
- [x] 7.3 Update `web/src/components/FileViewer.test.tsx` to cover: pinned-mode `ref=<sha>` threads `ref` to API calls; `unknown_ref` error renders the typed state; the file head stays clean (no pill, no escape button) — the strip carries the indicator (covered in FileLastCommitStrip.test.tsx).
- [x] 7.4 Update `web/src/git/BlameView.test.tsx` to cover the pinned-mode cache key, the absence of the `Modified locally` pill, and the LRU eviction behaviour (insert 33 distinct `(path, ref)` entries, confirm the first is evicted; confirm read-promotes-to-MRU by interleaving reads with inserts).
- [x] 7.5 Update `web/src/git/FileLastCommitStrip.test.tsx` to cover the pinned variant (fetched via `/api/git/commit?sha=…`, pill rendered, History routed with `&ref=`, working-tree pills suppressed).
- [x] 7.6 Update `web/src/components/MarkdownRenderer.test.tsx` to cover the pinned rewrite paths: `<img src="./diagram.png">` in a pinned render produces `/raw/<resolved>?ref=<sha>`; `<a href="./api.md">` produces `/view/<resolved>?view=preview&ref=<sha>`; absolute URLs pass through unchanged in both modes.

## 8. Build artifacts and demo GIFs

- [x] 8.1 Run `make web-commit` to regenerate `internal/server/ui/dist/*` and stage it in the same commit. (Used `make web` + `make build`; `dist/` regenerated; staging happens at commit time.)
- [x] 8.2 Regenerate `docs/desktop.gif` and `docs/mobile.gif` via the `record-demo-gif` skill and commit them in the same change. The clickable filename in `FileDiffCard` and the pinned-mode indicator are visible SPA UI updates — per CLAUDE.md, both GIFs must be refreshed alongside the `web/src/` changes rather than deferred. If the existing scenes don't already exercise the diff card or a pinned-mode view, add a new scene that does so the demo reflects the feature. (Existing desktop timeline already ends on the commit-detail page where the new filename links appear; no scene additions needed. Mobile timeline ends at the commits list — diff-card link isn't in that scene, but desktop covers it.)

## 9. Verify and validate

- [x] 9.1 Run `make test` and `cd web && npm test` — confirm all suites pass. (Go: 5/5 packages pass. SPA: 254/254 tests pass.)
- [x] 9.2 Run `make build` and exercise the feature manually against `./testdata` (or a real repo). (User drove the manual exercise live on the running explorer during the implementation session: discovered the head-pill UX issue and the mobile commit-history overflow, both of which were fixed in-session. Mobile overflow fix verified at 320px and 390px via headless Chromium + visual screenshot.):
  - Open `/git/commits/<sha>`, expand a file diff, click the filename → confirm new tab opens at the pinned URL; the file-last-commit strip shows `Viewing at <short-sha>` on its action row; the file head looks identical to working-tree mode.
  - Edit the URL to remove `?ref=` (or use browser back) → confirm working-tree bytes load and the strip's pinned pill disappears.
  - Test a rename: confirm both old_path and new_path links open distinct pinned URLs (`^` for old, raw SHA for new).
  - Test a staged/unstaged diff: confirm the link has no `ref=`.
  - Test image and binary entries: confirm the link still opens the viewer (with non-previewable fallback for binary, image render for images).
  - Test typed-but-unresolvable `ref=`: navigate to `/view/foo.go?view=code&ref=zzz` → confirm `unknown_ref` state; the strip's pinned pill still renders with the typed value as the displayed short-sha.
  - Open a pinned markdown file containing a relative `<img>` and a relative `<a href>`: confirm the image loads from `/raw/<sibling>?ref=<sha>` (DevTools Network) and the link's `href` is `/view/<sibling>?view=<default>&ref=<sha>`. Click the link → confirm the new view is also pinned.
  - Test SHA-prefix inbound URL: paste `/view/foo.go?view=code&ref=<7-char-prefix>` → confirm the file loads, the URL is NOT rewritten to the full SHA, and the strip's pinned pill shows the resolved short SHA.
- [x] 9.3 Run `openspec validate add-view-file-at-commit --strict` and confirm the change is valid.
