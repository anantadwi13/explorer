# Capability: HTTP API

## Purpose

The JSON and raw HTTP endpoints the `explorer` binary exposes for the SPA (and any direct API caller). Defines `/api/tree` (lazy folder listing), `/api/meta` (single-file metadata), `/raw/<path>` (byte streaming), the extension-first server-side MIME classification, and the typed `{error, message}` error envelope. Every path-accepting endpoint resolves the request path through the `path-resolver` capability before opening any file.
## Requirements
### Requirement: Lazy folder listing API

The server SHALL expose `GET /api/tree?path=<relative-path>` returning a JSON object describing the immediate children of the requested folder under the served root, with each entry typed as either `dir` or `file`. The response SHALL include the entry name and, for files, the size in bytes, the modification time, the detected MIME type, and a previewability classification (`kind`) computed from the MIME using the same rule the file metadata API applies. The `kind` field SHALL be one of `markdown`, `text`, `image`, or omitted/empty for files whose MIME does not classify as previewable. The response SHALL NOT include grandchildren — clients call `/api/tree` again for each folder they expand or navigate into.

#### Scenario: List the served root

- **WHEN** the SPA requests `GET /api/tree?path=` (or `path=/`) on a server whose served root contains files and folders
- **THEN** the response is HTTP 200 with a JSON body listing only the direct children of the served root
- **AND** each entry has a `type` of `dir` or `file`
- **AND** file entries include `size`, `mtime`, and `mime`
- **AND** file entries whose MIME classifies as previewable include a `kind` of `markdown`, `text`, or `image`
- **AND** dir entries do NOT include children

#### Scenario: List a subfolder

- **WHEN** the SPA requests `GET /api/tree?path=docs`
- **AND** `docs` is a folder under the served root
- **THEN** the response lists only the direct children of `docs`

#### Scenario: Hidden files are shown

- **WHEN** the requested folder contains entries beginning with `.` (e.g. `.gitignore`, `.env`)
- **THEN** those entries appear in the listing alongside non-hidden entries

#### Scenario: Sort order

- **WHEN** the listing is returned
- **THEN** directory entries appear before file entries
- **AND** within each group entries are sorted case-insensitively by name

#### Scenario: Symlink resolving inside the root is included

- **WHEN** the folder contains a symlink whose target resolves to a path still under the served root
- **THEN** the entry appears in the listing with the type of its resolved target (`dir` or `file`)

#### Scenario: Symlink resolving outside the root is omitted

- **WHEN** the folder contains a symlink whose target resolves outside the served root
- **THEN** the entry is omitted from the listing

#### Scenario: Kind on a non-previewable file

- **WHEN** the folder contains a file whose MIME does not classify as `markdown`, `text`, or `image` (e.g. a `.zip` archive, a `.pdf`, an unknown binary)
- **THEN** the entry appears in the listing with no `kind` field, or with `kind` set to an empty string

### Requirement: File metadata API

The server SHALL expose `GET /api/meta?path=<relative-path>` returning a JSON object describing a single file's metadata: `size` (bytes), `mtime` (RFC 3339), `mime` (detected MIME type), and `kind` (previewability classification: `markdown`, `text`, `image`, or empty for non-previewable). The endpoint SHALL NOT return file content under any circumstance. Requests against a directory SHALL return a typed `not_regular` error. Requests against a path that escapes the served root SHALL return a typed `outside_root` error.

The endpoint SHALL accept an OPTIONAL `ref` query parameter. When `ref` is present and the served root is a git repository, the endpoint SHALL return metadata for the file as it existed at the named commit's tree rather than from the working tree. `ref` SHALL accept the same grammar as `/api/git/blame?ref=`: a branch name, a tag name, a full 40-character commit SHA, an unambiguous SHA prefix (≥4 chars), or any of the above followed by a `^` suffix for the first parent. All three endpoints share one resolution helper. When `ref` is present, the `mtime` field SHALL be the commit's author timestamp (since git blobs have no native mtime). When the file did not exist at the named commit, the endpoint SHALL return a typed `not_found` error. When `ref` does not resolve to a commit (unknown name, ambiguous prefix, `^` walking off a root commit, malformed value), the endpoint SHALL return a typed `unknown_ref` error. When `ref` is present but the served root is not a git repository, the endpoint SHALL return a typed `unknown_ref` error.

When `ref` is absent the endpoint behaves exactly as before (working-tree source, filesystem path containment via the path-resolver capability).

#### Scenario: Markdown file metadata

- **WHEN** the SPA requests `GET /api/meta?path=README.md`
- **THEN** the response is HTTP 200 with a JSON body containing `size`, `mtime`, `mime`, and `kind: "markdown"`
- **AND** the response body does NOT contain a content field

#### Scenario: Text or code file metadata

- **WHEN** the SPA requests `GET /api/meta?path=src/main.go`
- **THEN** the response is HTTP 200 with `kind: "text"` and `mime` set to a `text/*` value
- **AND** the response body does NOT contain a content field

#### Scenario: Image file metadata

- **WHEN** the SPA requests `GET /api/meta?path=images/logo.png`
- **THEN** the response is HTTP 200 with `kind: "image"` and `mime` set to the detected image MIME
- **AND** the response body does NOT contain a content field

#### Scenario: Non-previewable file metadata

- **WHEN** the SPA requests `GET /api/meta?path=archive.zip`
- **THEN** the response is HTTP 200 with `size`, `mtime`, `mime` set to the detected MIME
- **AND** the `kind` field is empty or omitted

#### Scenario: Path is a directory

- **WHEN** the SPA requests `GET /api/meta?path=docs`
- **AND** `docs` is a directory under the served root
- **THEN** the response is a typed `not_regular` error (HTTP 400)

#### Scenario: Path does not exist

- **WHEN** the SPA requests `GET /api/meta?path=missing.md` and the file does not exist
- **THEN** the response is a typed `not_found` error (HTTP 404)

#### Scenario: Metadata at a commit SHA

- **WHEN** the SPA requests `GET /api/meta?path=README.md&ref=abc1234567890abcdef1234567890abcdef12345`
- **AND** the file existed at that commit
- **THEN** the response is HTTP 200 with `size`, `mime`, and `kind` reflecting the blob in that commit's tree
- **AND** the `mtime` field is the commit's author timestamp (not the working-tree file's mtime)

#### Scenario: Metadata at a commit SHA prefix

- **WHEN** the SPA requests `GET /api/meta?path=README.md&ref=abc1234`
- **AND** the prefix resolves unambiguously to a single commit
- **THEN** the response is identical to the full-SHA case

#### Scenario: Metadata at a branch name

- **WHEN** the SPA requests `GET /api/meta?path=README.md&ref=main`
- **AND** the branch resolves to a commit whose tree contains `README.md`
- **THEN** the response is HTTP 200 with metadata reflecting the blob at the branch tip
- **AND** the `mtime` field is that commit's author timestamp

#### Scenario: Metadata at a tag name

- **WHEN** the SPA requests `GET /api/meta?path=README.md&ref=v1.0.0`
- **AND** the tag resolves to a commit whose tree contains `README.md`
- **THEN** the response is HTTP 200 with metadata reflecting the blob at the tagged commit

#### Scenario: Metadata at a parent commit via `^` suffix

- **WHEN** the SPA requests `GET /api/meta?path=old/name.md&ref=abc1234%5E`
- **AND** the commit `abc1234` has a parent that contains `old/name.md`
- **THEN** the response is HTTP 200 reflecting the blob in the parent's tree

#### Scenario: File absent at the named commit

- **WHEN** the SPA requests `GET /api/meta?path=README.md&ref=<sha>`
- **AND** the file did not exist in that commit's tree
- **THEN** the response is a typed `not_found` error (HTTP 404)
- **AND** the response is NOT `unknown_ref`

#### Scenario: `ref` does not resolve to a commit

- **WHEN** the SPA requests `GET /api/meta?path=README.md&ref=deadbeef00000000000000000000000000000000`
- **AND** no commit with that SHA exists in the repository
- **THEN** the response is a typed `unknown_ref` error (HTTP 404)

#### Scenario: `ref` on a non-repo root

- **WHEN** the SPA requests `GET /api/meta?path=README.md&ref=<sha>` and the served root has no `.git`
- **THEN** the response is a typed `unknown_ref` error (HTTP 404)

#### Scenario: Path-escape attempt with `ref` set

- **WHEN** the SPA requests `GET /api/meta?path=../../etc/passwd&ref=<sha>`
- **THEN** the response is a typed `not_found` error (the git tree has no such entry)
- **AND** no filesystem access is attempted

### Requirement: Server-side MIME classification covers popular language extensions

The server's MIME detection SHALL classify the following file extensions as text-previewable, returning a `text/...` media type in `/api/meta` and `/api/tree` responses and a `kind` of `text` (or `markdown` for `.md`/`.markdown`) in the previewability classifier:

- Programming: `.cs`, `.kt`, `.kts`, `.swift`, `.scala`, `.sc`, `.groovy`, `.gradle`, `.m`, `.mm`, `.fs`, `.fsi`, `.fsx`, `.php`, `.phtml`, `.dart`, `.lua`, `.pl`, `.pm`, `.ps1`, `.psm1`, `.r`, `.R`, `.hs`, `.lhs`, `.ex`, `.exs`, `.erl`, `.hrl`, `.clj`, `.cljs`, `.cljc`, `.edn`, `.jl`, `.zig`.
- Data / config / query: `.json`, `.graphql`, `.gql`, `.proto`.

The existing previously-registered text extensions (`.go`, `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.rb`, `.rs`, `.sh`, `.html`, `.htm`, `.css`, `.scss`, `.sql`, `.c`, `.cpp`, `.h`, `.java`, `.xml`, `.csv`, `.yaml`, `.yml`, `.toml`, `.md`, `.markdown`, `.txt`) SHALL retain their current classification.

Detection SHALL remain extension-first: if a file's extension matches the registry, the registry's media type wins. Filename-based detection (e.g. for `Dockerfile`, `Makefile`) is NOT in scope of this requirement.

#### Scenario: Kotlin file is text-previewable

- **WHEN** a request arrives at `GET /api/meta?path=app/MainActivity.kt`
- **AND** the file exists under the served root
- **THEN** the response is HTTP 200 with `mime` matching `text/x-kotlin*` (or another `text/...` value)
- **AND** `kind` is `"text"`

#### Scenario: JSON file is text-previewable

- **WHEN** a request arrives at `GET /api/meta?path=package.json`
- **THEN** the response has `kind: "text"` and a `mime` value with a `text/` prefix
- **AND** the file viewer can render it inline (subject to the existing 5 MiB cap)

#### Scenario: Listing exposes kind for new languages

- **WHEN** a request arrives at `GET /api/tree?path=src` and the folder contains a `.kt`, `.swift`, `.json`, and `.proto` file
- **THEN** each file entry in the response has `kind: "text"`

#### Scenario: New extensions classified extension-first

- **WHEN** a file `weird.kt` contains content that `http.DetectContentType` would classify as `application/octet-stream`
- **THEN** the server's MIME detection still returns `text/x-kotlin` (or equivalent `text/...`) because the extension match wins
- **AND** `kind` is `"text"`

### Requirement: Raw file streaming endpoint

The server SHALL expose `GET /raw/<path>` which streams the file's bytes with a `Content-Type` header set from MIME detection. The endpoint SHALL NOT set `Content-Disposition: attachment`. The endpoint SHALL NOT inspect query parameters other than the optional `ref` parameter described below.

When `ref` is absent, the endpoint serves the working-tree file and SHALL apply the path-traversal and symlink-containment rules from the `path-resolver` capability.

The endpoint SHALL accept an OPTIONAL `ref` query parameter following the same syntax and resolution rules as `/api/meta?ref=` (branch name, tag name, full SHA, unambiguous SHA prefix, or any of the above with a `^` suffix for the first parent). When `ref` is present, the endpoint SHALL stream the bytes of the blob at `<path>` in the named commit's tree with `Content-Type` set from MIME detection. The endpoint SHALL bypass the filesystem path-resolver in this mode; containment is guaranteed structurally by git-tree lookup (see the `path-resolver` capability's two-mode containment requirement). The same `not_found` / `unknown_ref` error envelope as `/api/meta` applies.

#### Scenario: Image bytes for inline display

- **WHEN** an `<img src="/raw/images/logo.png">` element is rendered by the SPA
- **AND** the file exists under the served root
- **THEN** the response is HTTP 200 with `Content-Type: image/png` (or the correct image mime)
- **AND** the body is the raw PNG bytes
- **AND** no `Content-Disposition` header is set

#### Scenario: Bytes for a download link

- **WHEN** the user clicks `<a href="/raw/archive.zip" download="archive.zip">Download</a>`
- **THEN** the same endpoint responds with HTTP 200 and the file bytes
- **AND** the response sets `Content-Type` for the file
- **AND** the browser saves the file to disk because of the `download` attribute on the link

#### Scenario: Direct address-bar access

- **WHEN** a user opens `/raw/<path>` directly in the browser address bar
- **THEN** the response is the bare bytes
- **AND** the browser handles them according to its own MIME defaults (display, save, etc.)

#### Scenario: Raw bytes at a commit

- **WHEN** the SPA requests `GET /raw/README.md?ref=<full-sha>`
- **AND** the file existed at that commit
- **THEN** the response is HTTP 200 streaming the blob bytes of `README.md` from that commit's tree
- **AND** `Content-Type` is set from MIME detection on those bytes

#### Scenario: Raw bytes at a parent commit (`^` suffix)

- **WHEN** the SPA requests `GET /raw/old/name.md?ref=<sha>%5E`
- **AND** the commit has a parent containing `old/name.md`
- **THEN** the response is HTTP 200 streaming the bytes from the parent's tree

#### Scenario: Raw bytes at a branch tip

- **WHEN** the SPA requests `GET /raw/README.md?ref=main`
- **AND** the branch tip's tree contains `README.md`
- **THEN** the response is HTTP 200 streaming the blob bytes at the branch tip
- **AND** `Content-Type` is set from MIME detection on those bytes

#### Scenario: Raw `ref` on a non-repo root

- **WHEN** the SPA requests `GET /raw/<path>?ref=<sha>` and the served root has no `.git`
- **THEN** the response is a typed `unknown_ref` error (HTTP 404)

#### Scenario: Raw `ref` path-escape is structurally bounded

- **WHEN** the SPA requests `GET /raw/../etc/passwd?ref=<sha>`
- **THEN** the response is a typed `not_found` error (no such path in the git tree)
- **AND** no filesystem access is attempted in the `ref`-scoped code path

### Requirement: Error responses

API endpoints SHALL return typed errors for predictable failure modes so the SPA can render specific messages. Recognised error types: `not_found`, `permission_denied`, `outside_root`, `not_regular`, `too_large`, `not_utf8`, `unknown_ref`. Unknown failures SHALL surface as a generic `internal_error`.

The `unknown_ref` type SHALL be returned when an endpoint that accepts a `ref` parameter receives a value that does not resolve to a commit (unknown SHA, ambiguous prefix, malformed value, or `ref` set on a served root with no git repository). HTTP status for `unknown_ref` is 404.

#### Scenario: Path does not exist

- **WHEN** a request arrives for a path that does not exist under the served root
- **THEN** the response is a typed `not_found` error (HTTP 404)

#### Scenario: Path exists but is not readable

- **WHEN** a request arrives for a path the server process lacks read permission for
- **THEN** the response is a typed `permission_denied` error (HTTP 403)

#### Scenario: Path resolves to neither file nor directory

- **WHEN** a request resolves to a special file (socket, device, fifo)
- **THEN** the response is a typed `not_regular` error (HTTP 400)

#### Scenario: SPA surfaces typed errors

- **WHEN** the SPA receives any of the typed errors above
- **THEN** the viewer renders a specific message corresponding to the error type
- **AND** does NOT show a generic placeholder

#### Scenario: Unknown ref

- **WHEN** an endpoint that accepts `ref` receives a value that does not resolve to a commit
- **THEN** the response is a typed `unknown_ref` error (HTTP 404)
- **AND** the `error` field of the response body is the string `unknown_ref`

