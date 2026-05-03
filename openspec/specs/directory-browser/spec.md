# Capability: Directory Browser

## Purpose

A local HTTP server and single-page application (SPA) that allows users to browse, navigate, and preview the contents of a directory tree on their filesystem. The server exposes a JSON API for tree listing and file content, a raw streaming endpoint, and serves the SPA shell for all view URLs. The SPA renders folder listings, file previews (markdown, text, images), and graceful fallbacks for non-previewable files, with deep-linkable URLs and responsive layout across mobile and desktop viewports.

## Requirements

### Requirement: CLI invocation and flags

The `explorer` binary SHALL accept a single positional argument naming the directory to serve (the "served root") and SHALL accept optional flags `--port` and `--host`. The default `--port` SHALL be `8080`. The default `--host` SHALL be `127.0.0.1`. Invocation without a directory argument or with a path that is not an existing readable directory SHALL fail with a non-zero exit code and a message on stderr.

#### Scenario: Invoke with directory only

- **WHEN** the user runs `explorer /some/dir` and `/some/dir` exists and is readable
- **THEN** the binary binds to `127.0.0.1:8080`
- **AND** prints a startup banner on stdout containing the served root path and `http://127.0.0.1:8080`
- **AND** does not print a non-loopback warning

#### Scenario: Override port

- **WHEN** the user runs `explorer /some/dir --port 9000`
- **THEN** the binary binds to `127.0.0.1:9000`
- **AND** the startup banner reflects port `9000`

#### Scenario: Override host to non-loopback

- **WHEN** the user runs `explorer /some/dir --host 0.0.0.0`
- **THEN** the binary binds to `0.0.0.0:8080`
- **AND** the startup banner prints the URL `http://0.0.0.0:8080`
- **AND** the startup banner prints a warning that the host is not loopback and the served files are readable on the network

#### Scenario: Missing directory argument

- **WHEN** the user runs `explorer` with no positional argument
- **THEN** the binary exits non-zero
- **AND** prints a usage message on stderr

#### Scenario: Path argument is not a directory

- **WHEN** the user runs `explorer /path/that/does/not/exist` or passes a regular file
- **THEN** the binary exits non-zero
- **AND** prints an error on stderr identifying that the path is missing or not a directory

### Requirement: Graceful shutdown on signals

The server SHALL terminate gracefully on SIGINT or SIGTERM by ceasing to accept new connections and draining in-flight HTTP requests within a bounded shutdown timeout, after which it SHALL exit with status 0.

#### Scenario: SIGINT during idle

- **WHEN** the server is running with no in-flight requests
- **AND** the process receives SIGINT
- **THEN** the server stops accepting new connections
- **AND** exits with status 0

#### Scenario: SIGTERM during in-flight request

- **WHEN** an HTTP request is being handled
- **AND** the process receives SIGTERM
- **THEN** new connections are rejected
- **AND** the in-flight request is allowed to complete (within the shutdown timeout)
- **AND** the process exits with status 0

### Requirement: Lazy folder listing API

The server SHALL expose `GET /api/tree?path=<relative-path>` returning a JSON object describing the immediate children of the requested folder under the served root, with each entry typed as either `dir` or `file`. The response SHALL include the entry name and, for files, the size in bytes, the modification time, and the detected MIME type. The response SHALL NOT include grandchildren — clients call `/api/tree` again for each folder they expand or navigate into.

#### Scenario: List the served root

- **WHEN** the SPA requests `GET /api/tree?path=` (or `path=/`) on a server whose served root contains files and folders
- **THEN** the response is HTTP 200 with a JSON body listing only the direct children of the served root
- **AND** each entry has a `type` of `dir` or `file`
- **AND** file entries include `size`, `mtime`, and `mime`
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

### Requirement: File content API for previewable files

The server SHALL expose `GET /api/file?path=<relative-path>` returning a JSON object containing the file's text content (UTF-8) for previewable text and markdown files, plus metadata (size, mtime, mime). For files exceeding the inline render size cap, for non-UTF-8 binary files, or for files whose mime falls outside the previewable categories (markdown, text-like, image), this endpoint SHALL return a typed error indicating the file is not previewable rather than the content.

#### Scenario: Markdown file

- **WHEN** the SPA requests `GET /api/file?path=README.md`
- **THEN** the response is HTTP 200 with a JSON body containing the file's UTF-8 text content
- **AND** the body includes `mime` set to a markdown mime type
- **AND** the body includes `size` and `mtime`

#### Scenario: Text or code file

- **WHEN** the SPA requests `GET /api/file?path=src/main.go`
- **THEN** the response is HTTP 200 with the UTF-8 text content
- **AND** the `mime` field is a `text/*` value

#### Scenario: Image file

- **WHEN** the SPA requests `GET /api/file?path=images/logo.png`
- **THEN** the response is HTTP 200 with metadata only (size, mtime, mime)
- **AND** the body does NOT include the image bytes (the SPA loads them via `/raw/`)

#### Scenario: File over the inline render cap

- **WHEN** the SPA requests `GET /api/file?path=huge-notes.md`
- **AND** the file size exceeds the inline render cap (5 MiB)
- **THEN** the response is a typed error indicating the file is not previewable due to size
- **AND** the SPA can still load the bytes via `/raw/`

#### Scenario: Non-UTF-8 binary file in a text-like extension

- **WHEN** the SPA requests `GET /api/file?path=corrupt.txt`
- **AND** the file content is not valid UTF-8
- **THEN** the response is a typed error indicating the file is not previewable

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

### Requirement: SPA folder URL renders folder listing

A request to `GET /` or `GET /view/<path>/` (folder URL) SHALL serve the SPA shell. The SPA SHALL fetch `/api/tree?path=<path>` for that folder and render a folder listing view. The view SHALL show breadcrumbs whose segments link to ancestor folder URLs, the directory's direct children sorted folders-first then case-insensitive alphabetical, and an indication of empty folders.

#### Scenario: Open root folder URL

- **WHEN** the browser navigates to `/`
- **THEN** the SPA renders a folder listing view of the served root
- **AND** breadcrumbs show the served-root identifier as the only segment

#### Scenario: Open nested folder URL

- **WHEN** the browser navigates to `/view/docs/architecture/`
- **AND** that folder exists under the served root
- **THEN** the SPA renders the listing of `docs/architecture/`
- **AND** breadcrumbs are clickable: `<root>` / `docs` / `architecture`

#### Scenario: Empty folder

- **WHEN** the SPA navigates to a folder URL whose folder has no children
- **THEN** the listing view shows an "empty folder" indicator instead of an entry list

### Requirement: SPA file URL renders file viewer

A request to `GET /view/<path>` (file URL, no trailing slash) SHALL serve the SPA shell. The SPA SHALL determine via the API whether the path is a file and, if so, render the file viewer for the appropriate renderer. The viewer SHALL show breadcrumbs ending at the file's name and a header containing the file size and modification time.

#### Scenario: Open a file URL

- **WHEN** the browser navigates to `/view/docs/api.md`
- **AND** the file exists under the served root
- **THEN** the SPA renders the file viewer
- **AND** the viewer header shows the file's size and mtime
- **AND** breadcrumbs are clickable through ancestor folders

#### Scenario: File URL points to a folder

- **WHEN** the browser navigates to `/view/docs` (no trailing slash) but `docs` is a folder
- **THEN** the SPA renders the folder listing view (equivalent to navigating to `/view/docs/`)

### Requirement: Markdown rendering

When the file viewer's content is a markdown file (`.md` or `.markdown`), the SPA SHALL render it as GitHub-Flavoured Markdown with HTML output sanitized to remove scripts and unsafe handlers. Relative image references and relative link references SHALL resolve to other files in the served root.

#### Scenario: GFM features render

- **WHEN** the markdown contains GFM tables, task lists, fenced code blocks, or autolinks
- **THEN** they render correctly in the viewer

#### Scenario: Embedded script is sanitized

- **WHEN** the markdown source contains a `<script>` tag
- **THEN** the rendered output does not execute or include the script

#### Scenario: Relative image reference

- **WHEN** the markdown at `/view/docs/architecture.md` contains `![](./diagram.png)`
- **THEN** the rendered HTML contains `<img src="/raw/docs/diagram.png">` (or equivalent root-relative URL)

#### Scenario: Relative markdown link

- **WHEN** the markdown at `/view/docs/index.md` contains `[next](./api.md)`
- **THEN** the rendered HTML contains `<a href="/view/docs/api.md">next</a>`

#### Scenario: Absolute URL passes through

- **WHEN** the markdown contains `[ext](https://example.com)`
- **THEN** the rendered HTML keeps the absolute URL unchanged

### Requirement: Text-like file rendering

When the file viewer's content is a text-like file (mime starts with `text/`, or a known code/data extension), the SPA SHALL render it inside a monospace, pre-formatted block. Long lines SHALL wrap so a phone does not need horizontal scroll. The SPA SHALL NOT apply syntax highlighting in v1.

#### Scenario: Plain text file

- **WHEN** the SPA renders `notes.txt`
- **THEN** the content is shown in a monospace block
- **AND** whitespace is preserved
- **AND** no syntax colours are applied

#### Scenario: Code file

- **WHEN** the SPA renders `src/main.go`
- **THEN** the content is shown in the same plain monospace block
- **AND** no syntax colours are applied

#### Scenario: Long lines on narrow viewport

- **WHEN** the file contains lines wider than the viewport
- **THEN** lines wrap inside the block rather than producing a horizontal scrollbar

### Requirement: Image rendering

When the file viewer's content is an image (`image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml`), the SPA SHALL render an inline `<img>` whose source is `/raw/<path>` for that file.

#### Scenario: Open a PNG file

- **WHEN** the SPA renders `images/logo.png`
- **THEN** the viewer contains `<img src="/raw/images/logo.png">`
- **AND** the image loads from the `/raw/` endpoint

#### Scenario: SVG image

- **WHEN** the SPA renders an `.svg` file
- **THEN** the viewer renders it via an `<img>` element pointing at `/raw/<path>` (not by inlining the SVG markup)

### Requirement: Non-previewable file fallback

When the file viewer's file is not in a previewable category (e.g. archives, executables, video, audio, PDFs, Office documents, or any binary mime), the SPA SHALL render a "Not previewable" placeholder containing the filename, size, and a Download button. The Download button SHALL be `<a href="/raw/<path>" download="<filename>">` so the browser saves the bytes from `/raw/`.

#### Scenario: ZIP archive

- **WHEN** the SPA navigates to `/view/release.zip`
- **THEN** the viewer shows a "Not previewable" placeholder with the file name and size
- **AND** the placeholder includes a Download button linking to `/raw/release.zip` with a `download="release.zip"` attribute

#### Scenario: PDF

- **WHEN** the SPA navigates to `/view/spec.pdf`
- **THEN** the viewer shows the same "Not previewable" placeholder + Download button
- **AND** does NOT attempt to render the PDF inline

### Requirement: Inline render size cap falls through to non-previewable

When a markdown or text-like file exceeds the inline render size cap (5 MiB), the SPA SHALL render the same "Not previewable" placeholder + Download button as for non-previewable files, with a message indicating the file is too large to preview inline.

#### Scenario: Oversized markdown

- **WHEN** the SPA navigates to `/view/huge-notes.md`
- **AND** the file size is greater than 5 MiB
- **THEN** the viewer shows the "Not previewable" placeholder
- **AND** the message indicates the cause is the file size cap
- **AND** the Download button links to `/raw/huge-notes.md`

### Requirement: Path-traversal containment

Every endpoint that accepts a path (`/view`, `/raw`, `/api/tree`, `/api/file`) SHALL reject any request whose resolved absolute path is not contained within the served root's absolute path. Symlinks SHALL be followed only as long as the resolved target remains within the served root.

#### Scenario: Dot-dot escape attempt

- **WHEN** a request arrives at `/api/file?path=../../../etc/passwd` or `/raw/../../../etc/passwd`
- **THEN** the response is a typed `outside_root` error (HTTP 400)
- **AND** no file outside the served root is opened or read

#### Scenario: Symlink to outside root

- **WHEN** a file `link.txt` under the served root is a symlink whose target resolves outside the root
- **AND** a request arrives for `/api/file?path=link.txt` or `/raw/link.txt`
- **THEN** the response is a typed `outside_root` error
- **AND** the file is not read

#### Scenario: Symlink within root

- **WHEN** a file `shortcut.md` under the served root is a symlink to another file also under the served root
- **AND** a request arrives for `/api/file?path=shortcut.md`
- **THEN** the response is the target file's content

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

### Requirement: SPA layout adapts to viewport

The SPA SHALL render a single-view layout below the `md` breakpoint (mobile-first) and a split tree-and-viewer layout at and above the `md` breakpoint. Touch targets SHALL be at least 44×44 CSS pixels. The SPA SHALL NOT rely on hover-only affordances for any interaction reachable on mobile.

#### Scenario: Mobile listing view

- **WHEN** the viewport width is below the `md` breakpoint
- **AND** the SPA is at a folder URL
- **THEN** the SPA shows the folder listing as the primary view
- **AND** the tree sidebar is not displayed

#### Scenario: Mobile viewer view

- **WHEN** the viewport width is below the `md` breakpoint
- **AND** the SPA is at a file URL
- **THEN** the SPA shows the file viewer as the primary view

#### Scenario: Desktop split layout

- **WHEN** the viewport width is at or above the `md` breakpoint
- **THEN** the SPA shows the tree sidebar on the left and the listing or viewer on the right at the same time

### Requirement: Desktop tree behaves GitHub-style

In the desktop tree sidebar, each folder row SHALL expose two distinct affordances: a chevron icon that toggles the expand/collapse state of the folder inline without navigating, and a folder name that, when clicked, navigates to that folder's listing URL.

#### Scenario: Click chevron expands inline

- **WHEN** the user clicks the chevron next to a folder name in the tree
- **THEN** the folder's children expand inline below it
- **AND** the URL does not change

#### Scenario: Click name navigates

- **WHEN** the user clicks the folder name in the tree
- **THEN** the URL changes to that folder's listing URL
- **AND** the right-hand viewer renders the folder listing

### Requirement: Theme handling

The SPA SHALL default to the user's system colour scheme via `prefers-color-scheme`. The SPA SHALL provide a manual toggle (light / dark / system) that persists the user's choice in `localStorage`. On load, the SPA SHALL apply the persisted (or system-derived) theme before initial paint to avoid a flash of the wrong theme.

#### Scenario: First load with system dark

- **WHEN** the user opens the SPA for the first time
- **AND** the OS reports `prefers-color-scheme: dark`
- **THEN** the SPA renders in dark theme

#### Scenario: User toggles to light

- **WHEN** the user clicks the theme toggle and selects light
- **THEN** the SPA renders in light theme
- **AND** subsequent reloads continue to render in light theme until the user changes it

#### Scenario: User selects "system"

- **WHEN** the user selects the "system" option in the theme toggle
- **THEN** subsequent reloads follow `prefers-color-scheme` again
- **AND** changing the OS theme is reflected without manual reload (or on next reload, at minimum)

#### Scenario: No flash on load

- **WHEN** the SPA loads with a non-default persisted theme
- **THEN** the initial paint already uses the persisted theme (no visible flash from default to chosen)

### Requirement: Deep-linkable folder and file URLs

Every folder and every file under the served root SHALL be addressable by a stable URL of the form `/view/<path>/` (folder) or `/view/<path>` (file), and the SPA SHALL restore the corresponding view when such a URL is opened directly.

#### Scenario: Bookmark a file URL

- **WHEN** the user bookmarks `http://127.0.0.1:8080/view/docs/api.md`
- **AND** later opens the bookmark
- **THEN** the SPA renders the file viewer for `docs/api.md`

#### Scenario: Bookmark a folder URL

- **WHEN** the user bookmarks `http://127.0.0.1:8080/view/docs/`
- **AND** later opens the bookmark
- **THEN** the SPA renders the folder listing for `docs`
