## Context

After `refresh-spa-design` (commit `9dc080e`, archived 2026-05-03), the SPA shell, palette, and folder/file interactions all changed — but the server API surface stayed identical. `internal/server/api.go` still exposes `handleTree` and `handleFile`; `FileViewer.tsx:27` still calls `api.file(path)` for both metadata and inline content; `/raw/<path>` still streams bytes. The motivation (stated in `proposal.md`): `/api/file` conflates classification, cap enforcement, UTF-8 validation, and content delivery into one kind-keyed branch; orthogonality is poor; inlining text as a JSON-string field is wasteful when `/raw/` already streams those bytes; and the shape does not generalise to the deferred new-viewers change.

This design ships the minimal split: **`/api/meta` for metadata, `/raw/` for bytes**. The cap and UTF-8 checks move to the SPA. `/raw/` stays parameter-free; the `?text=1` server-side validation gate that an earlier draft proposed has been dropped (see D3 below for the rationale).

## Goals / Non-Goals

**Goals:**

- Replace `/api/file` with `/api/meta` (metadata-only). End-user behaviour: identical.
- Add `kind` to `/api/tree` entries so navigating from a folder listing stays at 1 round-trip.
- Move size-cap enforcement and UTF-8 validation client-side (`meta.size` check + `TextDecoder('utf-8', {fatal:true})`).
- Preserve every security-relevant invariant: same `resolver.Resolve` on every path-accepting endpoint; `/raw/` still streams bytes with no `Content-Disposition`.

**Non-Goals:**

- Any `/raw/?…` query-param transforms (`?text=1`, `?thumb=…`, `?head=N`, `?json=pretty`). The endpoint stays parameter-free.
- Server-side syntax highlighting or content processing. Out of scope.
- Backwards-compatibility shim for `/api/file`. Single-binary local tool — flip atomically.
- Changing `inlineSizeCap` from 5 MiB.
- Touching the SPA palette, layout, components, or interactions added by `refresh-spa-design` — only the `api/client.ts`, `api/types.ts`, and `FileViewer.tsx` call sites change.

## Decisions

### D1. Endpoint name: `/api/meta` (not `/api/stat` or `/api/info`)

`stat` invokes `stat(2)` and feels like it should return inode-level data (uid, perms, etc.). `info` is too generic. `meta` reads as "metadata about the file" which matches what the response actually is. Two existing peers (`/api/tree`, `/api/file` today) use single-word route names — `/api/meta` fits the established style.

*Alternative considered:* keep `/api/file` and shrink it to metadata-only. Rejected — confusing rename-without-renaming; `/api/file` reads as "give me the file" which is the wrong mental model for metadata-only.

### D2. `/raw/` is parameter-free; SPA does cap and UTF-8 checks

A previous iteration of this design added a `?text=1` query parameter to `/raw/` that would server-side validate UTF-8, enforce the 5 MiB cap, and return a JSON error envelope on failure. Dropped because:

- It made `/raw/` sometimes return JSON (on the `?text=1` failure path) — content-negotiation ugliness on what should be a pure bytes endpoint.
- It only enforced the cap when the client cooperated (a buggy SPA could bypass via `/raw/` without the param) — so the "server as single source of truth" argument was weaker than it sounded.
- The deferred new-viewers change does not benefit from server-side validation any more than client-side does.
- The cost of doing it client-side is ~10 lines of SPA code (size check + `TextDecoder`).

The SPA owns "should I render this as text?" by:

```ts
if (meta.kind === 'markdown' || meta.kind === 'text') {
  if (meta.size > INLINE_CAP) → showTooLargePlaceholder()
  else {
    const buf = await fetch('/raw/' + path).then(r => r.arrayBuffer())
    try { renderText(new TextDecoder('utf-8', {fatal:true}).decode(buf)) }
    catch { showNotUtf8Placeholder() }
  }
}
```

End-user behaviour matches today's exactly: oversized markdown → "too large" placeholder; binary `.txt` → "not previewable" placeholder.

### D3. `INLINE_CAP` is hard-coded on both sides

The Go const `inlineSizeCap = 5 * 1024 * 1024` in `internal/server/api.go` is no longer load-bearing for content (no server-side gate). The SPA introduces a `INLINE_CAP = 5 * 1024 * 1024` constant in `web/src/api/client.ts` (or alongside `FileViewer.tsx`). Single-binary deploy means both files always ship together — there is no scenario where the constants drift undetectably in production.

The Go const stays as documentation / future-use (and because removing it is a separate cleanup). The spec is the source of truth for the value; both code constants reference the spec value of 5 MiB.

*Alternative considered:* return the cap from the server in `/api/meta` (`{size, mtime, mime, kind, maxInlineSize}`). Rejected — pollutes the metadata response with a constant that is the same for every request, and the SPA can hard-code the same value with the same operational risk.

### D4. Tree entries gain `kind`; SPA classifier (`entryKind` in `iconForFile.tsx`) stays

`treeEntry` (Go) and `TreeEntry` (TS) gain an optional `kind` field for files (omitted for dirs). Server-side this is the same `fileKind(mime)` mapping `handleFile` already uses — no new logic, just exposed in the listing. The tree-listing common case becomes:

```
folder click → /api/tree returns entries WITH kind → no /api/meta needed → fetch /raw/ (1 RT)
deep-link paste → /api/meta (1 RT) → fetch /raw/ (1 RT)  (2 RT total — the only multi-RT path)
```

The existing `entryKind()` helper in `web/src/components/iconForFile.tsx` returns a UI-shaped enum (`'folder' | 'image' | 'markdown' | 'text' | 'file'`) for icon selection, which is broader than the server's `kind` field (`'markdown' | 'text' | 'image' | ''`). They serve different purposes (icon-picking vs previewability classification). Keep the client helper.

*Alternative considered:* drop the client `entryKind` helper and infer everything from server `kind`. Rejected — server `kind` is empty for non-previewable files (binaries, archives), but icon-picking still needs to distinguish e.g. dirs from files. The two classifiers have different shapes for different jobs.

### D5. No backwards-compat shim for `/api/file`

The route is removed in the same commit that adds `/api/meta`. The SPA's `api.file()` function is renamed to `api.meta()` (with adjusted return type — no `content` field). No transition period, no deprecation header. Single-binary local tool — every consumer ships in lockstep with the binary.

### D6. Spec delta strategy: MODIFY four existing requirements; no new requirements

The four affected requirements:

1. **File content API for previewable files** — replaced by **File metadata API**. The endpoint URL, response shape, and scenarios all change. Whole requirement gets MODIFIED (full rewrite under `## MODIFIED Requirements`) and renamed.
2. **Lazy folder listing API** — extended. Adds `kind` to file entries.
3. **Inline render size cap falls through to non-previewable** — restated. The SPA behaviour is identical, but the cap now lives in the SPA's pre-fetch check rather than in a server-returned `too_large` error.
4. **Path-traversal containment** — endpoint enumeration updated. `/api/file` removed, `/api/meta` added.

The **Raw file streaming endpoint** requirement is unchanged in this delta (the endpoint stays parameter-free). The **Error responses** requirement is unchanged (no new error types — `too_large` and `not_utf8` simply stop being emitted by the server but stay in the vocabulary for any future consumer that wants them). The **SPA file URL renders file viewer** requirement is unchanged — the existing `/api/tree` probe in `ViewPage.tsx` stays as-is; its self-correcting behaviour for slash-mismatched URLs is worth the extra round-trip.

### D7. Implementation order: server first, SPA second, all in one commit

Single binary embeds the SPA. There is no scenario where the server and SPA are out of step in a deployed build. Land both halves in the same commit:

1. Add `handleMeta`, register `/api/meta` route.
2. Add `Kind` to `treeEntry` and populate in `handleTree`.
3. Update `api/types.ts` (rename `FileResponse` → `MetaResponse`, drop `content`, add `kind` to `TreeEntry`).
4. Rename `api.file()` → `api.meta()`.
5. Update `FileViewer.tsx`: meta call, size check, `fetch('/raw/…')`, `TextDecoder`.
6. Add `INLINE_CAP` constant in the SPA.
7. Remove `handleFile` and the `/api/file` route registration.
8. `make build && make test`.

Step 7 is intentionally last — keeping `handleFile` alive until the SPA stops calling it makes the diff bisectable if anything goes wrong mid-PR. `ViewPage.tsx` is untouched — the existing `/api/tree` probe stays.

## Risks / Trade-offs

- **`INLINE_CAP` constant duplicated across Go and TS** → could drift. Mitigated by single-binary deploy (both files always ship together) and by the spec being the source of truth for the value. A single PR changes both.
- **Server stops being authoritative on "is this previewable text?"** → a misbehaving SPA could try to render a 1 GB log file. Mitigated by the SPA always doing the size check before fetching, and `TextDecoder({fatal:true})` catching the binary case. End-user behaviour is identical.
- **Common case is now 2 RT for cold deep-link paste (was 1)** → mitigated by D4 (folder-click stays 1 RT). Deep-link paste is rare; the extra RT is to a small JSON metadata response, dwarfed by the time to first paint of the file content.
- **No future server-side processing extension hatch** → if syntax highlighting / thumbnails / pretty-printing are ever wanted, they earn their keep in a separate change. Adding `?syntax=…` later is not blocked by this change.
- **Two classifiers (server `kind`, client `entryKind`) with overlapping but non-identical outputs** → could drift. Mitigated by their having clearly different jobs: server `kind` is "previewable text?" (used for routing); client `entryKind` is "what icon to show?" (used for rendering). Document the distinction in `iconForFile.tsx`.
- **Test rewrite touches `internal/server/api_test.go` extensively** → unavoidable; the endpoint surface is changing. Mitigated by the test rewrite being mechanical: every `/api/file` content-related test deletes; metadata tests become `/api/meta` tests; tree tests gain a `kind` assertion.

## Migration Plan

No data migration. No deploy choreography. Single PR, single binary rebuild. The Docker image rebuild picks up the change automatically. No state on disk, no client-side caches that survive a refresh, no external API consumers that need a deprecation window.

Rollback: revert the PR. The SPA and the server flip together because they ship in the same binary.

## Open Questions

None. The remaining surface area is implementation detail covered by `tasks.md`.
