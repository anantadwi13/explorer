## 1. Server: `/api/meta` endpoint

- [x] 1.1 In `internal/server/api.go`, rename the `fileResponse` struct to `metaResponse` and remove the `Content *string` field. Resulting fields: `Size int64`, `Mtime time.Time`, `Mime string`, `Kind string` (omitted when empty via `omitempty` on the JSON tag). _(Note: implemented as add-alongside rather than rename — `metaResponse` added next to `fileResponse`; `fileResponse` removed in cleanup task 7.2.)_
- [x] 1.2 Add a new `handleMeta(w, r)` method on `*Server` that resolves the path via `s.resolver.Resolve`, returns `not_regular` for directories, computes `mime.Detect` and `fileKind`, and JSON-encodes a `metaResponse`. Never read file content. No `inlineSizeCap` check (no content to cap server-side).
- [x] 1.3 Wire `/api/meta` into the route registration (look in `internal/server/server.go` for where `/api/tree` and `/api/file` are registered; add `/api/meta` alongside, leave `/api/file` for now to keep the diff bisectable until the SPA stops calling it).

## 2. Server: tree-listing `kind` field

- [x] 2.1 In `internal/server/api.go`, extend the `treeEntry` struct with a `Kind *string \`json:"kind,omitempty"\`` field for files (omitted for directories).
- [x] 2.2 In `handleTree`, compute `fileKind(mimeType)` for each file entry and set `Kind` to that value when non-empty (leave nil when `fileKind` returns ""). Same classifier as `handleMeta` — extract `fileKind` to a shared helper if it isn't already accessible from both call sites.

## 3. Server: tests

- [x] 3.1 Rewrite the file-content test cases in `internal/server/api_test.go` as `/api/meta` tests. Cover: markdown happy path (asserts `kind: "markdown"`, no content field), text happy path (asserts `kind: "text"`), image happy path (asserts `kind: "image"`, no content field), non-previewable happy path (asserts empty/omitted `kind`), directory (`not_regular`), missing file (`not_found`), permission denied (`permission_denied`).
- [x] 3.2 Delete the old test cases that asserted server-side `too_large` and `not_utf8` errors from `/api/file` — those concerns no longer live server-side. The error vocabulary stays defined; only the file-content endpoint stops emitting them.
- [x] 3.3 Add `TestTreeReturnsKind`: list a folder containing a `.md`, a `.txt`, a `.png`, and a `.zip`; assert the tree response contains `kind: "markdown"`, `kind: "text"`, `kind: "image"`, and the `.zip` entry has no `kind` field (or empty).
- [x] 3.4 Add `TestMetaPathTraversal`: assert `/api/meta?path=../../../etc/passwd` returns typed `outside_root` and reads no file. Same coverage existed for `/api/file`; just port to the new endpoint.
- [x] 3.5 Confirm the existing `/raw/<path>` tests still pass unchanged (the endpoint is not modified by this change).
- [x] 3.6 Run `make test` and confirm all server tests pass.

## 4. SPA: types and client

- [x] 4.1 In `web/src/api/types.ts`: add `kind?: 'markdown' | 'text' | 'image' | ''` to `TreeEntry` (file entries only — keep optional). Rename `FileResponse` → `MetaResponse` and remove the `content?: string` field.
- [x] 4.2 In `web/src/api/client.ts`: rename the `file(path)` function to `meta(path)`, change its return type to `Promise<ApiResult<MetaResponse>>`, change the URL to `/api/meta?path=…`. No new helper function — `FileViewer` will call `fetch('/raw/' + encodeURI(path))` directly for content.
- [x] 4.3 Add a module-level constant `INLINE_CAP = 5 * 1024 * 1024` in either `web/src/api/client.ts` or alongside `FileViewer.tsx` (whichever feels more natural — they're the only consumers). Add a comment noting the value mirrors `internal/server/api.go`'s `inlineSizeCap` and the spec.

## 5. SPA: FileViewer call sites

- [x] 5.1 In `web/src/components/FileViewer.tsx`: replace the existing `api.file(path).then(...)` (around line 27) with a two-step flow:
  1. Call `api.meta(path)`.
  2. If `meta` errors, show the existing error state.
  3. If `meta.kind === 'image'`, render the existing `<img src={'/raw/' + path}>` element directly — no content fetch needed.
  4. If `meta.kind === 'markdown'` or `meta.kind === 'text'`:
     - If `meta.size > INLINE_CAP`, show the existing "too large" placeholder + Download button (no `/raw/` fetch).
     - Else `fetch('/raw/' + encodeURI(path))`, read `arrayBuffer()`, decode via `new TextDecoder('utf-8', {fatal: true})`. On decoder throw, show the existing "not previewable / binary" placeholder. On success, render the markdown or text body as before.
  5. If `meta.kind` is empty/absent, render the existing "not previewable" placeholder + Download button.
- [x] 5.2 The download button (`href={'/raw/' + path}`) keeps using `/raw/` directly — unchanged.
- [x] 5.3 Update the loading state to span both the meta call and the content fetch (single spinner is fine).
- [x] 5.4 Audit any code that previously read `MetaResponse.content` (post-rename) and replace those reads with the locally-decoded text.

## 6. SPA: optionally use server-supplied `kind` for early routing

- [x] 6.1 If a folder listing has already been fetched and the user clicks into a file entry, the SPA can in principle skip the `/api/meta` round-trip and use the listing entry's `kind` + `size` directly. This recovers the 1-RT folder→file navigation case described in design D4. Implementing this requires plumbing the listing entry through to `FileViewer` (e.g. via location state or a small in-memory cache). _(Deferred per 6.2.)_
- [x] 6.2 If 6.1 feels like premature optimisation for the size of this change, defer it — always-call-meta-first is correct and simple; the deep-link path is unaffected. _(Deferred — chose simplicity for v1.)_

## 7. Cleanup

- [x] 7.1 Remove `handleFile` from `internal/server/api.go` and the `/api/file` route registration from `internal/server/server.go`. Confirm no other references via `grep -rn "/api/file\|handleFile" internal/ web/`.
- [x] 7.2 Remove the now-unused `fileResponse` struct (replaced by `metaResponse`).
- [x] 7.3 In `web/src/components/iconForFile.tsx`, leave `entryKind()` and `iconForFile()` alone — they serve UI icon-picking, not previewability classification (see design D4). Add a one-line comment if it isn't already obvious that `entry.kind` (server) and `entryKind(entry)` (client UI helper) are intentionally distinct.
- [x] 7.4 `web/src/pages/ViewPage.tsx` is intentionally untouched — the existing `/api/tree` probe stays. Verify it still works after the rest of this change lands.

## 8. Verification

- [x] 8.1 Run `make build` and verify the binary still builds and embeds the SPA without errors.
- [x] 8.2 Run `make test` and confirm all Go tests pass.
- [x] 8.3 Run `cd web && npm run lint` and confirm no new lint findings. _(Lint reports one error — pre-existing in `ViewPage.tsx` line 26, present before this change. Not introduced by this work; ViewPage is intentionally untouched per task 7.4.)_
- [x] 8.4 Manual UI verification with `make dev-server` + `make dev-web`:
  - Verified server-side via curl + Node TextDecoder (no headless browser available in apply environment):
    - `/api/meta?path=README.md` → `{"size":609, "mime":"text/markdown; charset=utf-8", "kind":"markdown"}` ✓
    - `/api/meta?path=archive.zip` → omits `kind` (non-previewable) ✓
    - `/api/meta?path=images/...` → `kind:"image"` ✓
    - `/api/meta?path=../../../etc/passwd` → 400 outside_root ✓
    - `/api/tree?path=` → entries include `kind:"text"` for `.txt`/`.go`, `kind:"markdown"` for `.md`, omitted for `.zip` ✓
    - `/raw/README.md` → 200 + `text/markdown; charset=utf-8` (unchanged from pre-change) ✓
    - Cap path: `/api/meta` on a 5,242,986-byte `big.md` returns `size:5242986`; `5242986 > INLINE_CAP (5242880)` evaluates `true` → SPA renders too-large placeholder; SPA never fetches `/raw/big.md` (verified by code inspection of `FileViewer.tsx`) ✓
    - Binary-as-text: `/raw/binary_as_text.txt` returns bytes `0xFF 0xFE 0xC0 0xC1 0xF5 0xF6 0xF7`; running `new TextDecoder('utf-8',{fatal:true}).decode(bytes)` in Node throws "The encoded data was not valid for encoding utf-8" → SPA catches and renders not_utf8 placeholder ✓
  - Pixel-level rendering verification (markdown layout, toast, breadcrumbs, etc.) is unchanged from `refresh-spa-design`'s SPA shell — this change only swapped the data-fetch path inside FileViewer; the surrounding chrome is untouched.
- [x] 8.5 Manual security-boundary verification: in the browser address bar, attempt `/api/meta?path=../../../etc/passwd` and confirm a JSON `outside_root` error response with HTTP 400; confirm no file leak. _(Verified via `curl -i http://127.0.0.1:18080/api/meta?path=../../../etc/passwd` — got `HTTP/1.1 400 Bad Request` + `{"error":"outside_root","message":"path escapes served root"}`. No file leaked.)_
- [x] 8.6 Run `openspec verify --change restructure-file-api` (or the equivalent `opsx:verify`) before archiving. _(Used `openspec validate restructure-file-api` → "Change 'restructure-file-api' is valid".)_
