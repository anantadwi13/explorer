> ⚠ **Stub proposal — do not start implementation yet.** This change is **blocked by** `refresh-spa-design`. Defer drafting `design.md`, `specs/`, and `tasks.md` until `refresh-spa-design` is committed and the SPA refactor has settled into the codebase. Drafting the design and tasks now would risk premature decisions about a post-state we have not yet built.

## Why

The current `/api/file?path=…` endpoint conflates three jobs into one response shape: classify the file (`kind`), enforce the inline-preview cap and UTF-8 validity, and — for `markdown` / `text` only — inline the file contents as a JSON-string field. The `image` branch returns metadata-only; everything else 400s. This kind-keyed branching works, but it leaves a few rough edges:

- Orthogonality is poor — the same endpoint sometimes ships bytes and sometimes doesn't, and the SPA has to know the rule.
- Inlining text as a JSON string is wasteful (escape overhead, no streaming, no HTTP-level caching of the bytes themselves) when a sibling endpoint (`/raw/`) already streams those exact bytes correctly.
- It does not generalise cleanly to the deferred new-viewers change (PDF, audio, video, binary card). Those naturally want "metadata only, then bytes via `/raw/`" — exactly the shape `/api/file` only half-supports today.

The cleanup is small in surface area and removes a redundancy that will otherwise harden into the API contract once the new viewers ship.

## What Changes

- **`/api/file?path=…` is replaced by `/api/meta?path=…`.** `/api/meta` always returns `{size, mtime, mime, kind}` and never returns content bytes. Same path-resolver, same typed-error vocabulary, same `kind` classification logic.
- **`/raw/<path>?text=1` is added.** When the query param is present, the server validates UTF-8 and applies the existing `inlineSizeCap` (5 MiB) before streaming the bytes. On failure the response is `status code + Content-Type: application/json + {error, message}` — same envelope the rest of the API speaks. On success the bytes stream as `text/plain; charset=utf-8` (or the detected MIME with `; charset=utf-8`).
- **`/api/tree` entries gain a `kind` field.** Same `fileKind(mime)` mapping the server already does in `internal/server/api.go`; just exposed in the listing response. This recovers the 1-round-trip common case: SPA navigating from a folder listing already has `kind` and can go straight to `/raw/?text=1`, skipping `/api/meta`. Deep-link paste is the only 2-RT path.
- **SPA call sites swap.** `api.file(path)` → `api.meta(path)` for the metadata fetch + a `fetch('/raw/' + path + '?text=1')` for the content. The existing typed-error handling (`too_large`, `not_utf8`, etc.) carries over unchanged because the error envelope is identical.
- **`/raw/<path>` (no query) behaviour is preserved verbatim.** Bytes streamed with detected `Content-Type`, no `Content-Disposition`. Existing `<img src="/raw/…">` and `<a download href="/raw/…">` SPA usages keep working.

Out of scope for this change (deferred or rejected):

- Other `/raw/?…` transforms (`?thumb=…`, `?head=N`, `?json=pretty`). Only `?text=1` ships in this change. Adding more transforms is a separate decision for a separate change.
- Removing server-side UTF-8 validation in favour of client-side `TextDecoder('utf-8', {fatal:true})`. Server stays the single source of truth for "is this previewable text?" and the size cap.
- Backwards-compatibility shims (no `/api/file` redirect, no parallel-shipping both endpoints). Single-binary local tool with no external API consumers — flip atomically.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `directory-browser`: requirement-level changes to the file API. Existing requirements affected:
  - **File content API for previewable files** — replaced/renamed: the metadata + content-inlining responsibilities split into a metadata-only `GET /api/meta` and a content-fetching `GET /raw/<path>?text=1`. The `kind`, `inlineSizeCap`, and UTF-8 validation rules carry over unchanged in their new home.
  - **Raw file streaming endpoint** — extended with the `?text=1` query-param contract (UTF-8 + size-cap validation, JSON-error envelope on failure, `text/plain; charset=utf-8` on success). The unparameterised `/raw/<path>` behaviour is unchanged.
  - **Lazy folder listing API** — `treeEntry` for files extended with a `kind` field carrying the same classification used elsewhere.
  - **Inline render size cap falls through to non-previewable** — restated in the new endpoint shape (the cap now lives on `/raw/?text=1`).
  - **Error responses** — no shape change; the `{error, message}` envelope already used by `/api/file` is reused on `/raw/?text=1` failures.

No requirement removals beyond the API endpoint rename. No changes to the path-traversal contract, the `inlineSizeCap` value (5 MiB), the SPA URL convention, MIME detection rules, or CLI invocation.

## Impact

- **Affected Go code**: `internal/server/api.go` (split `handleFile` into `handleMeta` + extend `handleRaw` with the `?text=1` branch), `internal/server/server.go` (or wherever routes are registered — drop `/api/file`, add `/api/meta`), `internal/server/api_test.go` (rewrite tests against the new endpoints), tree-handler test updates for the new `kind` field.
- **Affected SPA code**: `web/src/api/client.ts` and `web/src/api/types.ts` (rename `file` → `meta`, add `kind` to `TreeEntry`, add a `rawText(path)` helper or inline-fetch in `FileViewer`), `web/src/components/FileViewer.tsx` (two-step fetch instead of one), and any folder-listing code that wants to read `entry.kind` directly instead of re-mapping mime.
- **Spec**: delta against `openspec/specs/directory-browser/spec.md`. No new capability files.
- **Build / dependencies**: none — stdlib only on the Go side; no SPA package additions.
- **Behavioural for end users**: invisible. All file viewer URLs, folder URLs, image rendering, and download buttons keep working bit-identically. The change is API-shape hygiene, not a UX change.
- **Ordering**: **must land after `refresh-spa-design`**. Combining the two would mix a visual refresh with an API restructure and bloat the review surface; doing this first would force `refresh-spa-design` to either rebase against a moving API or implement against a known-stale API. Land them in series.
- **No interaction** with `add-playground-warning` — those touch disjoint files (`cmd/explorer/main.go` + `README.md` only). Either order is fine for those two.
