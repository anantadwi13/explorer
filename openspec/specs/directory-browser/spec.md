# Capability: Directory Browser

## Purpose

A local HTTP server and single-page application (SPA) that allows users to browse, navigate, and preview the contents of a directory tree on their filesystem. The server exposes a JSON API for tree listing and file content, a raw streaming endpoint, and serves the SPA shell for all view URLs. The SPA renders folder listings, file previews (markdown, text, images), and graceful fallbacks for non-previewable files, with deep-linkable URLs and responsive layout across mobile and desktop viewports.

## Requirements

### Requirement: CLI invocation and flags

The `explorer` binary SHALL accept a single positional argument naming the directory to serve (the "served root") and SHALL accept optional flags `--port`, `--host`, and `--version` (alias `-v`). The default `--port` SHALL be `8080`. The default `--host` SHALL be `127.0.0.1`. Invocation without a directory argument or with a path that is not an existing readable directory SHALL fail with a non-zero exit code and a message on stderr, **except** when `--version` (or `-v`) is supplied — in that case the binary SHALL print the version line and exit 0 before validating the directory argument.

The same invocation contract SHALL apply when the binary is executed via the Go toolchain using the module path `github.com/anantadwi13/explorer/cmd/explorer`, including `go run github.com/anantadwi13/explorer/cmd/explorer@latest <dir> [flags...]` and the binary produced by `go install github.com/anantadwi13/explorer/cmd/explorer@latest`.

The binary SHALL print, as the first line of stdout on every successful startup (regardless of `--host` value), the exact playground banner line:

```
explorer (playground build — no auth, no audit; do not expose publicly)
```

When the existing non-loopback warning is emitted (because `--host` is not `127.0.0.1`, `::1`, or `localhost`), the playground banner SHALL appear strictly before the non-loopback warning. The non-loopback warning text and position relative to the served-root and URL lines SHALL NOT change.

The `--help` (and any usage-error) output SHALL include, immediately after the `Usage:` line and before the flag defaults, the exact two-line footer (each line indented with two leading spaces):

```
  Playground tool — no auth, no security audit. Bind to loopback
  unless you trust your network.
```

The `--version` (and `-v`) flag SHALL print exactly one line to stdout in the form `<version> (commit <commit>, built <buildDate>)` and SHALL exit with status 0. The values of `<version>`, `<commit>`, and `<buildDate>` are injected at link time by the release pipeline (see the `release-distribution` capability); locally-built binaries print the literal default `dev (commit unknown, built unknown)`. The `--version` flag SHALL NOT print the playground banner, the non-loopback warning, or any other line. When `--version` is combined with any other flag or positional argument, those other inputs SHALL be ignored and the version line SHALL be printed regardless.

#### Scenario: Invoke with directory only

- **WHEN** the user runs `explorer /some/dir` and `/some/dir` exists and is readable
- **THEN** the binary binds to `127.0.0.1:8080`
- **AND** the first line of stdout is exactly `explorer (playground build — no auth, no audit; do not expose publicly)`
- **AND** subsequent stdout contains the served root path and `http://127.0.0.1:8080`
- **AND** does not print a non-loopback warning

#### Scenario: Override port

- **WHEN** the user runs `explorer /some/dir --port 9000`
- **THEN** the binary binds to `127.0.0.1:9000`
- **AND** the first line of stdout is the playground banner
- **AND** the startup banner reflects port `9000`

#### Scenario: Override host to non-loopback

- **WHEN** the user runs `explorer /some/dir --host 0.0.0.0`
- **THEN** the binary binds to `0.0.0.0:8080`
- **AND** the first line of stdout is the playground banner
- **AND** the startup banner prints the URL `http://0.0.0.0:8080`
- **AND** the startup banner prints a warning that the host is not loopback and the served files are readable on the network
- **AND** the playground banner appears strictly before the non-loopback warning

#### Scenario: Missing directory argument

- **WHEN** the user runs `explorer` with no positional argument and no `--version` flag
- **THEN** the binary exits non-zero
- **AND** prints a usage message on stderr
- **AND** the usage message contains the playground footer text `Playground tool — no auth, no security audit. Bind to loopback unless you trust your network.`

#### Scenario: Path argument is not a directory

- **WHEN** the user runs `explorer /path/that/does/not/exist` or passes a regular file
- **THEN** the binary exits non-zero
- **AND** prints an error on stderr identifying that the path is missing or not a directory

#### Scenario: Help flag prints playground footer

- **WHEN** the user runs `explorer --help`
- **THEN** the usage output contains the `Usage: explorer <dir> [--port PORT] [--host HOST]` line
- **AND** the line immediately after begins with `  Playground tool — no auth, no security audit.`
- **AND** the flag defaults are printed below the footer
- **AND** the listed flags include `--version` (alias `-v`)

#### Scenario: Version flag with no other arguments

- **WHEN** the user runs `explorer --version`
- **THEN** stdout contains exactly one line in the form `<version> (commit <commit>, built <buildDate>)`
- **AND** stdout does NOT contain the playground banner
- **AND** the process exits 0
- **AND** no HTTP server is started

#### Scenario: Version short flag alias

- **WHEN** the user runs `explorer -v`
- **THEN** the output is identical to `explorer --version`
- **AND** the process exits 0

#### Scenario: Version flag combined with directory and other flags

- **WHEN** the user runs `explorer /some/dir --port 9000 --version`
- **THEN** stdout contains exactly the version line
- **AND** the process exits 0
- **AND** no HTTP server is started on port 9000 or any other port

#### Scenario: Version flag on a locally-built binary

- **WHEN** a binary built via `make build` or `go install github.com/anantadwi13/explorer/cmd/explorer@latest` (without release-pipeline ldflags) is invoked with `--version`
- **THEN** stdout contains exactly one line: `dev (commit unknown, built unknown)`
- **AND** the process exits 0

#### Scenario: Invoke via `go run` from the module path

- **WHEN** the user has a Go 1.24+ toolchain and runs `go run github.com/anantadwi13/explorer/cmd/explorer@latest /some/dir`
- **THEN** the Go toolchain fetches the module, compiles the binary, and executes it with `/some/dir` as the served root
- **AND** the running server behaves identically to the `./explorer /some/dir` invocation, including binding defaults, the playground banner as the first line of stdout, the startup banner, and SPA assets served at `/`

#### Scenario: Install via `go install` from the module path

- **WHEN** the user has a Go 1.24+ toolchain and runs `go install github.com/anantadwi13/explorer/cmd/explorer@latest`
- **THEN** the Go toolchain produces an `explorer` binary in `$GOBIN` (or `$GOPATH/bin`)
- **AND** running that binary against any readable directory serves the SPA and JSON API exactly as the `make build` output would, and prints the playground banner as the first line of stdout

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

### Requirement: SPA folder URL renders folder listing

A request to `GET /` or `GET /view/<path>/` (folder URL) SHALL serve the SPA shell. The SPA SHALL fetch `/api/tree?path=<path>` for that folder and render a folder listing view. The view SHALL show breadcrumbs (within the main toolbar) whose segments link to ancestor folder URLs, the directory's direct children sorted folders-first then case-insensitive alphabetical by default, and an indication of empty folders.

The folder listing view SHALL provide:

- A **search input** in the main toolbar that filters the displayed entries by case-insensitive substring match on the entry name. Filtering SHALL be performed client-side over the entries returned by `/api/tree` for the current folder; it SHALL NOT trigger additional API calls and SHALL NOT recurse into subfolders.
- A **list / grid view toggle** in the main toolbar. List view SHALL render entries as rows with name, modified, and size columns. Grid view SHALL render entries as tiles; image entries SHALL display an inline thumbnail sourced from `/raw/<path>` and other entries SHALL display a kind-appropriate icon. The chosen view SHALL persist in `localStorage` under `explorer.view` and SHALL be restored on subsequent loads.
- **Sortable column headers** in list view for name, modified, and size. Activating a header SHALL sort entries by that column ascending; activating the already-active header SHALL toggle the direction. Folders SHALL remain grouped above files in every sort order. The sort selection SHALL be session-only and reset to name-ascending when the path changes.
- An **empty state** visible when the folder has no children, or when the search filter eliminates every entry. The empty state SHALL include a recognisable indicator, a title, and (when filtered) a hint referencing the active query.

#### Scenario: Open root folder URL

- **WHEN** the browser navigates to `/`
- **THEN** the SPA renders a folder listing view of the served root
- **AND** breadcrumbs in the toolbar show the served-root identifier as the only segment

#### Scenario: Open nested folder URL

- **WHEN** the browser navigates to `/view/docs/architecture/`
- **AND** that folder exists under the served root
- **THEN** the SPA renders the listing of `docs/architecture/`
- **AND** breadcrumbs are clickable: `<root>` / `docs` / `architecture`

#### Scenario: Empty folder

- **WHEN** the SPA navigates to a folder URL whose folder has no children
- **THEN** the listing view shows an empty-state indicator instead of an entry list

#### Scenario: Filter with search

- **WHEN** the user types `read` in the toolbar search input on a folder containing `README.md` and `index.html`
- **THEN** only `README.md` is shown
- **AND** no additional `/api/tree` request is issued

#### Scenario: Search with no matches

- **WHEN** the user types a query that matches no entry in the current folder
- **THEN** the empty state appears with a hint referencing the query

#### Scenario: Clear search

- **WHEN** the user clears the search input
- **THEN** the full folder listing is shown again

#### Scenario: Switch to grid view

- **WHEN** the user activates the grid option in the view toggle
- **THEN** the listing renders as tiles
- **AND** image entries display inline thumbnails sourced from `/raw/<path>`
- **AND** subsequent loads of the SPA continue in grid view until the user changes it

#### Scenario: Sort by size descending

- **WHEN** the user clicks the size column header twice
- **THEN** the rows are sorted by size descending
- **AND** folder entries remain above file entries

#### Scenario: Sort resets on navigation

- **WHEN** the user has sorted by size descending in folder A
- **AND** navigates into folder B
- **THEN** folder B renders with the default name-ascending sort

### Requirement: SPA file URL renders file viewer

A request to `GET /view/<path>` (file URL, no trailing slash) SHALL serve the SPA shell. The SPA SHALL determine via the API whether the path is a file and, if so, render the file viewer for the appropriate renderer.

The file viewer SHALL display a header containing:

- A back affordance that navigates to the file's parent folder.
- A kind-appropriate icon and the file name.
- A meta line showing the file's mime type, size, and modification time.
- A copy-link affordance that writes the current page URL to the clipboard and surfaces a transient confirmation toast.
- A download affordance that links to the file's `/raw/<path>` URL with a `download` attribute.

Breadcrumbs in the main toolbar SHALL show ancestor folders ending with a non-clickable segment for the file name.

#### Scenario: Open a file URL

- **WHEN** the browser navigates to `/view/docs/api.md`
- **AND** the file exists under the served root
- **THEN** the SPA renders the file viewer
- **AND** the viewer header shows the file's name with a kind icon, mime, size, and mtime
- **AND** the toolbar breadcrumbs are clickable through ancestor folders

#### Scenario: File URL points to a folder

- **WHEN** the browser navigates to `/view/docs` (no trailing slash) but `docs` is a folder
- **THEN** the SPA renders the folder listing view (equivalent to navigating to `/view/docs/`)

#### Scenario: Copy link

- **WHEN** the user activates the copy-link affordance in the file viewer header
- **THEN** the SPA writes the current page URL to the clipboard
- **AND** a transient toast confirming the copy appears and dismisses automatically

#### Scenario: Download

- **WHEN** the user activates the download affordance in the file viewer header
- **THEN** the browser saves the file via the `/raw/<path>` URL

#### Scenario: Back navigates to parent folder

- **WHEN** the user activates the back affordance in the file viewer header
- **THEN** the SPA navigates to the file's parent folder URL

### Requirement: Markdown rendering

When the file viewer's content is a markdown file (`.md` or `.markdown`), the SPA SHALL render it as GitHub-Flavoured Markdown with HTML output sanitized to remove scripts and unsafe handlers. Relative image references and relative link references SHALL resolve to other files in the served root. The rendered markdown body SHALL apply a constrained reading width and the design's type scale, blockquote, and code-block styling.

Fenced code blocks whose info-string names a registered language (the same set enumerated in the "Text-like file rendering" requirement, plus all standard highlight.js aliases such as `golang`/`go`, `js`/`javascript`, `ts`/`typescript`, `sh`/`bash`, `cs`/`csharp`) SHALL render with syntax-aware token colouring driven by the same theme-aware CSS custom properties. Fenced code blocks without an info-string, or whose info-string names an unregistered language, SHALL render as plain monospace without token colouring (no automatic content-based language detection). Inline `<code>` spans SHALL render as plain monospace.

Sanitisation SHALL allow CSS class names emitted by the highlighter (those matching `^hljs(-[a-z_]+)*$`) on `<code>` and `<span>` elements while continuing to strip arbitrary class names, scripts, and unsafe handlers.

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

#### Scenario: Constrained reading width

- **WHEN** the SPA renders a markdown file in a wide viewport
- **THEN** the body of the markdown is constrained to a comfortable reading width centred in the content region

#### Scenario: Fenced code block with registered language

- **WHEN** the markdown contains a fenced block written as ` ```go ` followed by Go source and ` ``` `
- **THEN** the rendered HTML contains a `<code>` whose children are tokenised spans with class names beginning with `hljs-` (e.g. `hljs-keyword`, `hljs-string`, `hljs-comment`)
- **AND** those spans render with the same theme-aware colours as a standalone Go file in the file viewer

#### Scenario: Fenced code block without info-string

- **WHEN** the markdown contains a fenced block opened with ` ``` ` (no language)
- **THEN** the rendered HTML contains a `<code>` element with the block's text as a plain text node
- **AND** no `hljs-` token spans are added (no auto-detected colouring)

#### Scenario: Fenced code block with unregistered language

- **WHEN** the markdown contains a fenced block opened with ` ```esoteric ` for a language the SPA does not register
- **THEN** the rendered HTML renders the block as plain monospace
- **AND** no `hljs-` token spans are added

#### Scenario: Inline code stays plain

- **WHEN** the markdown contains an inline `` `snippet` ``
- **THEN** the rendered HTML contains a `<code>` whose only child is the literal text
- **AND** no `hljs-` token spans are added

#### Scenario: Sanitisation preserves highlighter classes

- **WHEN** the markdown renderer processes a fenced code block with a registered language
- **THEN** the sanitiser preserves `class` attributes on `<code>` and `<span>` whose values match `^hljs(-[a-z_]+)*$`
- **AND** the sanitiser still strips arbitrary class names, inline event handlers, and `<script>` content from the same document

### Requirement: Text-like file rendering

When the file viewer's content is a text-like file (mime starts with `text/`, or a known code/data extension), the SPA SHALL render it inside a monospace, pre-formatted block. Long lines SHALL wrap so a phone does not need horizontal scroll.

When the file's extension maps to a registered programming-language grammar, the SPA SHALL render the content with syntax-aware token colouring, applying coloured spans to keywords, strings, comments, numbers, types/built-ins, and similar lexical categories. The registered set SHALL cover, at minimum, the following languages:

- **Programming**: Go (`.go`), TypeScript (`.ts`, `.tsx`), JavaScript (`.js`, `.jsx`), Python (`.py`), Ruby (`.rb`), Rust (`.rs`), Bash (`.sh`), C (`.c`, `.h`), C++ (`.cpp`), Java (`.java`), C# (`.cs`), Kotlin (`.kt`, `.kts`), Swift (`.swift`), Scala (`.scala`, `.sc`), Groovy (`.groovy`, `.gradle`), Objective-C (`.m`, `.mm`), F# (`.fs`, `.fsi`, `.fsx`), PHP (`.php`, `.phtml`), Dart (`.dart`), Lua (`.lua`), Perl (`.pl`, `.pm`), PowerShell (`.ps1`, `.psm1`), R (`.r`, `.R`), Haskell (`.hs`, `.lhs`), Elixir (`.ex`, `.exs`), Erlang (`.erl`, `.hrl`), Clojure (`.clj`, `.cljs`, `.cljc`, `.edn`), Julia (`.jl`), Zig (`.zig`).
- **Markup / styling**: HTML (`.html`, `.htm`), XML (`.xml`), CSS (`.css`), SCSS (`.scss`), Markdown (`.md`, `.markdown`).
- **Data / config / query**: YAML (`.yaml`, `.yml`), JSON (`.json`), TOML (`.toml`), SQL (`.sql`), GraphQL (`.graphql`, `.gql`), Protobuf (`.proto`).

The colour palette SHALL be supplied via CSS custom properties keyed on `[data-theme="..."]` so the highlighting follows the active light, dark, or system theme without a flash on load.

When the file's extension does not map to a registered grammar (e.g. `.txt`, `.csv`), the SPA SHALL render the content as plain monospace text without token colouring.

The rendered block SHALL preserve whitespace and SHALL wrap long lines without producing a horizontal scrollbar at any viewport width supported by the SPA.

#### Scenario: Plain text file

- **WHEN** the SPA renders `notes.txt`
- **THEN** the content is shown in a monospace block
- **AND** whitespace is preserved
- **AND** no syntax colours are applied

#### Scenario: Code file with registered grammar

- **WHEN** the SPA renders `src/main.go`
- **THEN** the content is shown in a monospace block
- **AND** Go keywords (e.g. `func`, `return`, `package`), string literals, and comments render with distinct token colours
- **AND** the colours come from theme-aware CSS custom properties (light theme on `[data-theme="light"]`, dark theme on `[data-theme="dark"]`)

#### Scenario: Code file in TypeScript

- **WHEN** the SPA renders `web/src/App.tsx`
- **THEN** the content is shown in a monospace block with TypeScript token colouring
- **AND** JSX tags, attributes, and embedded expressions are visually distinguishable from surrounding code

#### Scenario: Code file in a JVM language

- **WHEN** the SPA renders `MainActivity.kt` (or `App.scala`, `Service.java`, `build.gradle`)
- **THEN** the content is shown in a monospace block with the corresponding language's token colouring
- **AND** keywords, types, and string literals are visually distinguishable from comments

#### Scenario: Code file in a scripting language

- **WHEN** the SPA renders `script.lua` (or `app.rb`, `setup.pl`, `deploy.ps1`)
- **THEN** the content is shown in a monospace block with the corresponding language's token colouring

#### Scenario: JSON file

- **WHEN** the SPA renders `package.json`
- **THEN** the content is shown in a monospace block with JSON token colouring
- **AND** object keys, string literals, numbers, and booleans render as visually distinct tokens

#### Scenario: TOML file

- **WHEN** the SPA renders `Cargo.toml` (or `pyproject.toml`)
- **THEN** the content is shown in a monospace block with token colouring
- **AND** `[section]` headers, `key = value` pairs, string literals, and comments render as visually distinct tokens
- **AND** any TOML constructs not represented by the underlying grammar (e.g. inline tables) still render legibly, falling back to default text colour

#### Scenario: Text-like file with no registered grammar

- **WHEN** the SPA renders `data.csv` (or any `.txt` file)
- **THEN** the content is shown in a plain monospace block
- **AND** no token colours are applied
- **AND** the block wraps long lines exactly as a `.txt` file would

#### Scenario: Long lines on narrow viewport

- **WHEN** the file contains lines wider than the viewport
- **THEN** lines wrap inside the block rather than producing a horizontal scrollbar
- **AND** wrapping behaviour is identical regardless of whether the file is highlighted or rendered plain

#### Scenario: Theme switch updates token colours

- **WHEN** a code file is being viewed under `[data-theme="light"]`
- **AND** the user switches the theme to dark via the settings menu
- **THEN** the token colours update to the dark palette without re-fetching the file or re-mounting the viewer

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

The SPA SHALL render a single-view layout below 800 CSS pixels of viewport width and a split tree-and-viewer layout at and above 800 CSS pixels. The application root SHALL occupy the full viewport (`100vh`) and SHALL NOT page-scroll; scrolling SHALL occur inside the sidebar tree and the main content region independently. Touch targets SHALL be at least 44×44 CSS pixels. The SPA SHALL NOT rely on hover-only affordances for any interaction reachable on mobile.

At and above 800 px, the SPA SHALL render a two-column layout:

- A **sidebar** containing the brand identifier and the lazy folder tree.
- A **main pane** containing a single toolbar (breadcrumbs, search input, view toggle, settings menu) above the content region (folder listing or file viewer).

Below 800 px, the SPA SHALL render a single-column layout with a top bar containing the brand and a theme toggle. The sidebar SHALL be hidden by default and SHALL open as an overlay drawer with a scrim when the user activates the top-bar menu affordance; activating the scrim or the drawer's close affordance SHALL close it.

Below 800 px, the folder listing's modified column SHALL be hidden, the search input SHALL occupy the full toolbar width on its own row, and the file detail header's secondary actions (copy-link, download) SHALL collapse to icon-only buttons.

#### Scenario: Mobile listing view

- **WHEN** the viewport width is below 800 px
- **AND** the SPA is at a folder URL
- **THEN** the SPA shows the folder listing as the primary view
- **AND** the sidebar is not displayed

#### Scenario: Mobile viewer view

- **WHEN** the viewport width is below 800 px
- **AND** the SPA is at a file URL
- **THEN** the SPA shows the file viewer as the primary view

#### Scenario: Desktop split layout

- **WHEN** the viewport width is at or above 800 px
- **THEN** the SPA shows the sidebar on the left and the listing or viewer on the right at the same time

#### Scenario: Mobile drawer open

- **WHEN** the viewport width is below 800 px
- **AND** the user activates the top-bar menu affordance
- **THEN** the sidebar slides in as an overlay
- **AND** a scrim covers the rest of the viewport

#### Scenario: Mobile drawer dismiss

- **WHEN** the sidebar is open as an overlay
- **AND** the user activates the scrim or the drawer's close affordance
- **THEN** the sidebar closes

#### Scenario: Locked viewport on long content

- **WHEN** the user opens a long markdown file at a viewport size at or above 800 px
- **THEN** the toolbar remains pinned at the top of the main pane
- **AND** scrolling occurs inside the content region rather than the page

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

The SPA SHALL default to the user's system colour scheme via `prefers-color-scheme`. The SPA SHALL provide a manual theme toggle (light / dark / system) and a manual density toggle (compact / regular / comfy). Both selections SHALL persist in `localStorage` (`explorer.theme` and `explorer.density` respectively). On load, the SPA SHALL apply the persisted (or system-derived) theme and the persisted (or default) density before initial paint to avoid a flash of the wrong theme or row height.

The default density SHALL be `regular`. Density SHALL drive the row height and content padding via CSS custom properties.

#### Scenario: First load with system dark

- **WHEN** the user opens the SPA for the first time
- **AND** the OS reports `prefers-color-scheme: dark`
- **THEN** the SPA renders in dark theme

#### Scenario: User toggles to light

- **WHEN** the user opens the settings menu and selects light
- **THEN** the SPA renders in light theme
- **AND** subsequent reloads continue to render in light theme until the user changes it

#### Scenario: User selects "system"

- **WHEN** the user selects the "system" option in the settings menu theme toggle
- **THEN** subsequent reloads follow `prefers-color-scheme` again
- **AND** changing the OS theme is reflected without manual reload (or on next reload, at minimum)

#### Scenario: User selects compact density

- **WHEN** the user selects the compact density option in the settings menu
- **THEN** folder rows render with reduced height
- **AND** content padding is reduced
- **AND** subsequent reloads continue to render compact until the user changes it

#### Scenario: Default density on first load

- **WHEN** the user opens the SPA for the first time
- **THEN** the SPA renders with the regular density

#### Scenario: No flash on load

- **WHEN** the SPA loads with a non-default persisted theme or density
- **THEN** the initial paint already uses the persisted theme and density (no visible flash from default to chosen)

### Requirement: Keyboard shortcuts for navigation and search

The SPA SHALL provide keyboard shortcuts to focus the toolbar search, dismiss the search or return from a file viewer to its folder, and navigate to the parent folder. Shortcuts SHALL NOT activate while the user is typing in an input, textarea, or content-editable element.

- Pressing `/` from a folder view SHALL move keyboard focus to the toolbar search input.
- Pressing `Escape` SHALL clear the search input if it has a value; otherwise, if the user is viewing a file, it SHALL navigate to the file's parent folder.
- Pressing `Backspace` (when no field is focused and the SPA is not viewing a file) SHALL navigate to the parent folder of the current path. The SPA SHALL prevent the browser default of navigating back in history when this shortcut applies.

#### Scenario: Slash focuses search

- **WHEN** the user is on a folder view with no input focused
- **AND** presses `/`
- **THEN** the toolbar search input gains keyboard focus
- **AND** the browser does not insert a `/` character anywhere

#### Scenario: Slash is inert while typing

- **WHEN** the user is typing in any input
- **AND** presses `/`
- **THEN** the keystroke is delivered to the input as a normal character
- **AND** focus does not move

#### Scenario: Escape clears search

- **WHEN** the toolbar search input contains text
- **AND** the user presses `Escape`
- **THEN** the search input becomes empty
- **AND** the listing returns to its unfiltered state

#### Scenario: Escape returns from file to folder

- **WHEN** the SPA is on a file URL with no search active
- **AND** the user presses `Escape`
- **THEN** the SPA navigates to the file's parent folder

#### Scenario: Backspace navigates up from a folder

- **WHEN** the SPA is on a non-root folder URL with no field focused
- **AND** the user presses `Backspace`
- **THEN** the SPA navigates to the parent folder
- **AND** the browser does not navigate back in history

#### Scenario: Backspace inert at root

- **WHEN** the SPA is on the root folder URL with no field focused
- **AND** the user presses `Backspace`
- **THEN** the SPA does not change route

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

### Requirement: Embedded SPA assets ship in the published module

The compiled Single-Page Application assets that the Go binary serves SHALL be present in the published source tree at `internal/server/ui/dist/`, so that any consumer obtaining the module via the Go module proxy (`go install`, `go run`, or `go get` followed by a local build) produces a binary whose `embed.FS` contains a fully functional SPA without requiring Node.js, npm, or a separate frontend build step on the consumer's machine.

#### Scenario: Fresh clone produces a runnable binary without npm

- **WHEN** a contributor clones the repository on a machine with only the Go toolchain installed
- **AND** runs `go build ./cmd/explorer`
- **THEN** the produced binary serves the SPA at `/` and renders folder listings, markdown previews, and image previews against any readable directory
- **AND** no `npm` or `node` invocation is required to obtain a working binary

#### Scenario: Module-proxy install produces a runnable binary

- **WHEN** a user with no clone of the repository runs `go install github.com/anantadwi13/explorer/cmd/explorer@latest`
- **THEN** the resulting binary serves a non-empty SPA shell at `/` (HTTP 200 with a non-trivial HTML body that loads the bundled JS/CSS)
- **AND** the binary does NOT serve the empty-embed fallback (an HTTP 404 with `Content-Type: text/plain` and body `404 page not found`, returned by the stock `http.ServeFileFS` handler in `internal/server/static.go` when `dist/index.html` is missing)

#### Scenario: SPA source change without dist regeneration is detectable

- **WHEN** a contributor modifies files under `web/src/` and commits without regenerating `internal/server/ui/dist/`
- **THEN** the project provides a documented mechanism (a Make target, pre-commit hook guidance, or CI check) by which the staleness of `internal/server/ui/dist/` relative to `web/src/` can be detected before merge
