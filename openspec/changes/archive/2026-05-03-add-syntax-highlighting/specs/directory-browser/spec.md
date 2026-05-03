# Capability: Directory Browser — Syntax Highlighting Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
