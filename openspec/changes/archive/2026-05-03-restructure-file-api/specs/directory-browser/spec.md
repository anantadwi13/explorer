## MODIFIED Requirements

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

### Requirement: Inline render size cap falls through to non-previewable

When a markdown or text-like file exceeds the inline render size cap (5 MiB), the SPA SHALL render the same "Not previewable" placeholder + Download button as for non-previewable files, with a message indicating the file is too large to preview inline. The cap is enforced client-side: the SPA reads `meta.size` from the `/api/meta` response (or `entry.size` from `/api/tree` when navigating from a listing) and SHALL skip the `/raw/<path>` content fetch when the size exceeds 5 MiB.

When the SPA fetches `/raw/<path>` for a markdown or text-like file and the bytes are not valid UTF-8, the SPA SHALL render the same "Not previewable" placeholder with a message indicating the file is binary or not valid text. UTF-8 validation is performed client-side using `TextDecoder('utf-8', {fatal: true})`.

#### Scenario: Oversized markdown

- **WHEN** the SPA navigates to `/view/huge-notes.md`
- **AND** the file size (per `/api/meta` or `/api/tree`) is greater than 5 MiB
- **THEN** the SPA does NOT issue a `/raw/huge-notes.md` request
- **AND** the viewer shows the "Not previewable" placeholder
- **AND** the message indicates the cause is the file size cap
- **AND** the Download button links to `/raw/huge-notes.md`

#### Scenario: Non-UTF-8 file with text-like MIME

- **WHEN** the SPA navigates to `/view/corrupt.txt`
- **AND** the file's MIME classifies as `text` but the bytes are not valid UTF-8
- **THEN** the SPA fetches `/raw/corrupt.txt` and attempts UTF-8 decoding
- **AND** the decoder throws (fatal mode)
- **AND** the viewer shows the "Not previewable" placeholder
- **AND** the message indicates the file is binary or not valid text
- **AND** the Download button links to `/raw/corrupt.txt`

### Requirement: Path-traversal containment

Every endpoint that accepts a path (`/view`, `/raw`, `/api/tree`, `/api/meta`) SHALL reject any request whose resolved absolute path is not contained within the served root's absolute path. Symlinks SHALL be followed only as long as the resolved target remains within the served root.

#### Scenario: Dot-dot escape attempt

- **WHEN** a request arrives at `/api/meta?path=../../../etc/passwd` or `/raw/../../../etc/passwd`
- **THEN** the response is a typed `outside_root` error (HTTP 400)
- **AND** no file outside the served root is opened or read

#### Scenario: Symlink to outside root

- **WHEN** a file `link.txt` under the served root is a symlink whose target resolves outside the root
- **AND** a request arrives for `/api/meta?path=link.txt` or `/raw/link.txt`
- **THEN** the response is a typed `outside_root` error
- **AND** the file is not read

#### Scenario: Symlink within root

- **WHEN** a file `shortcut.md` under the served root is a symlink to another file also under the served root
- **AND** a request arrives for `/api/meta?path=shortcut.md`
- **THEN** the response is metadata for the target file (size, mtime, mime, kind)
