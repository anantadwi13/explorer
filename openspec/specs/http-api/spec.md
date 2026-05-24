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

The server SHALL expose `GET /raw/<path>` which streams the file's bytes with a `Content-Type` header set from MIME detection. The endpoint SHALL NOT set `Content-Disposition: attachment`. The endpoint SHALL NOT inspect query parameters or headers to alter its behaviour. The endpoint SHALL apply the same path-traversal and symlink-containment rules as `/api/*` and `/view/*`.

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

### Requirement: Error responses

API endpoints SHALL return typed errors for predictable failure modes so the SPA can render specific messages. Recognised error types: `not_found`, `permission_denied`, `outside_root`, `not_regular`, `too_large`, `not_utf8`. Unknown failures SHALL surface as a generic `internal_error`.

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
