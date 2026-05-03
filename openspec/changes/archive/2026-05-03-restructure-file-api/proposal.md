> ⚠ **Stub proposal — do not start implementation yet.** ~~Blocked by `refresh-spa-design`.~~ `refresh-spa-design` landed in commit `9dc080e` (archived 2026-05-03); this change is now unblocked. Proposal updated 2026-05-03 to drop the `?text=1` query-param branch — see the simpler shape below.

## Why

The current `/api/file?path=…` endpoint conflates three jobs into one response shape: classify the file (`kind`), enforce the inline-preview cap and UTF-8 validity, and — for `markdown` / `text` only — inline the file contents as a JSON-string field. The `image` branch returns metadata-only; everything else 400s. This kind-keyed branching works, but it leaves a few rough edges:

- Orthogonality is poor — the same endpoint sometimes ships bytes and sometimes doesn't, and the SPA has to know the rule.
- Inlining text as a JSON string is wasteful (escape overhead, no streaming, no HTTP-level caching of the bytes themselves) when a sibling endpoint (`/raw/`) already streams those exact bytes correctly.
- It does not generalise cleanly to the deferred new-viewers change (PDF, audio, video, binary card). Those naturally want "metadata only, then bytes via `/raw/`" — exactly the shape `/api/file` only half-supports today.

The cleanup is small in surface area and removes a redundancy that will otherwise harden into the API contract once the new viewers ship.

## What Changes

- **`/api/file?path=…` is replaced by `/api/meta?path=…`.** `/api/meta` always returns `{size, mtime, mime, kind}` and never returns content bytes. Same path-resolver, same typed-error vocabulary, same `kind` classification logic.
- **`/raw/<path>` is unchanged.** Streams bytes with the detected `Content-Type`; never sets `Content-Disposition`; no query parameters interpreted. The SPA fetches text content by GET-ing `/raw/<path>` and decoding the bytes client-side.
- **`/api/tree` entries gain a `kind` field.** Same `fileKind(mime)` mapping the server already does in `internal/server/api.go`; just exposed in the listing response. This recovers the 1-round-trip common case: SPA navigating from a folder listing already has `kind` and can go straight to `/raw/`, skipping `/api/meta`. Deep-link paste is the only 2-RT path.
- **Inline preview cap and UTF-8 validation move to the SPA.** The SPA reads `meta.size`, refuses to fetch when `> 5 MiB` (showing the existing "Not previewable — too large" placeholder + Download button), GETs `/raw/<path>`, and decodes via `new TextDecoder('utf-8', {fatal: true})`. A decode failure renders the existing "binary / not UTF-8" placeholder. The 5 MiB cap is hard-coded in both the Go and SPA constants; both ship in the same binary so they update together.
- **SPA call sites swap.** `api.file(path)` → `api.meta(path)` for the metadata fetch + a `fetch('/raw/' + path)` for the content (text kinds only). Existing typed-error handling (`too_large`, `not_utf8`) shifts from server-returned errors to client-derived placeholders driven by the size check and decoder result.
- **`<img src="/raw/…">` and `<a download href="/raw/…">` SPA usages keep working bit-identically.** They never needed validation; they keep using `/raw/` directly.

Out of scope for this change (deferred or rejected):

- Any `/raw/?…` query-param transforms (`?text=1`, `?thumb=…`, `?head=N`, `?json=pretty`). The endpoint stays parameter-free in this change. Adding a transform later is a separate decision for a separate change.
- Backwards-compatibility shims (no `/api/file` redirect, no parallel-shipping both endpoints). Single-binary local tool with no external API consumers — flip atomically.
- Removing the `/api/tree` probe in `ViewPage.tsx` that disambiguates file vs folder URLs. The probe round-trip is worth it: it preserves the self-correcting behaviour for slash-mismatched URLs (a slashless URL pointing at a folder still renders the folder listing). The probe pattern stays as-is.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `directory-browser`: requirement-level changes to the file API. Existing requirements affected:
  - **File content API for previewable files** — replaced by **File metadata API**: a metadata-only `GET /api/meta`. The content-inlining responsibility moves to the existing `/raw/<path>` endpoint (no change to that endpoint's contract) plus client-side decoding.
  - **Lazy folder listing API** — `treeEntry` for files extended with a `kind` field carrying the same classification used elsewhere.
  - **Inline render size cap falls through to non-previewable** — restated in the new shape: cap is enforced client-side based on `meta.size` rather than server-side on `/api/file`.
  - **Path-traversal containment** — endpoint enumeration updated: `/api/file` removed, `/api/meta` added. Same path-resolver guarantees apply.

No requirement removals beyond the API endpoint rename. No changes to the path-traversal contract, the `inlineSizeCap` value (5 MiB — now duplicated as a client-side constant), the SPA URL convention, MIME detection rules, or CLI invocation. The **Raw file streaming endpoint** requirement is unchanged. The **Error responses** requirement is unchanged (no new error types). The **SPA file URL renders file viewer** requirement is unchanged (the `/api/tree` probe stays).

## Impact

- **Affected Go code**: `internal/server/api.go` (split `handleFile` into `handleMeta` and a `treeEntry.Kind` field; remove the content-inlining branch entirely), `internal/server/server.go` (or wherever routes are registered — drop `/api/file`, add `/api/meta`), `internal/server/api_test.go` (rewrite `/api/file` tests as `/api/meta` tests; drop the inline-content / `too_large` / `not_utf8` test cases — those concerns no longer live server-side). `internal/server/raw.go` and `internal/server/resolver/` are untouched.
- **Affected SPA code**: `web/src/api/client.ts` and `web/src/api/types.ts` (rename `file` → `meta`, drop the `content` field from the response type, add `kind` to `TreeEntry`). `web/src/components/FileViewer.tsx` (replace the single `api.file()` call with `api.meta()` + size check + `fetch('/raw/…')` + `TextDecoder`; convert the existing typed-error placeholders to fire on the client-side checks instead). `web/src/pages/ViewPage.tsx` is unchanged — the existing `/api/tree` probe stays. A new `INLINE_CAP` constant (5 MiB) on the SPA side.
- **Spec**: delta against `openspec/specs/directory-browser/spec.md`. No new capability files.
- **Build / dependencies**: none — stdlib only on the Go side; no SPA package additions (`TextDecoder` is built into every modern browser).
- **Behavioural for end users**: invisible. All file viewer URLs, folder URLs, image rendering, and download buttons keep working bit-identically. The change is API-shape hygiene, not a UX change.
- **Ordering**: blocker (`refresh-spa-design`) has cleared. Can land any time. No interaction with `add-playground-warning` — those touch disjoint files.
