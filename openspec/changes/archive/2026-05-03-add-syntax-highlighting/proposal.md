## Why

Today the file viewer renders every text-like file (including source code) as plain monospace, with no colour cues for keywords, strings, comments, or punctuation. The current `directory-browser` spec explicitly carries this constraint as a v1 limitation ("The SPA SHALL NOT apply syntax highlighting in v1"), and the project's MIME table is heavily weighted toward source-code extensions (Go, TypeScript, Python, Rust, Ruby, Shell, HTML, CSS, SQL, C/C++, Java, XML, ...), so reading code in the browser is a primary use case rather than an edge one. Adding syntax highlighting closes the most visible gap between this tool and a code host like the GitHub blob view, and unblocks markdown previews (currently fenced code blocks inside `.md` files render as plain monospace too).

## What Changes

- Add a syntax-highlighting renderer for the text-file viewer. Replace the plain `<pre className="text-body">` block in `FileViewer.tsx` with a highlighter component that detects the language from the file's extension/MIME and emits coloured tokens.
- Apply the same highlighter to fenced code blocks inside `MarkdownRenderer.tsx` so ` ```go `, ` ```ts `, etc. render with token colours and the unspecified ` ``` ` form remains plain.
- Cover a broad set of popular programming and data languages — beyond the current text-classified extensions (Go, TypeScript, JavaScript, Python, Ruby, Rust, Bash, HTML/XML, CSS, SCSS, SQL, C, C++, Java, YAML, Markdown), add C#, Kotlin, Swift, Scala, Groovy, Objective-C, F#, PHP, Dart, Lua, Perl, PowerShell, R, Haskell, Elixir, Erlang, Clojure, Julia, Zig, plus the data/config formats JSON, TOML, GraphQL, and Protobuf.
- Extend `internal/server/mime/mime.go`'s extTable so files in the new languages are classified as `text` by the server. Without this, the file viewer would still see `kind: ""` for a `.kt` or `.json` file and render the "not previewable" fallback. This is the only Go change in the entire proposal; the API surface (`/api/meta`, `/api/tree`, `/raw`) and the resolver are untouched.
- Maintain existing rendering invariants: long lines SHALL still wrap (no horizontal scrollbar on narrow viewports), the inline size cap (5 MiB) and UTF-8 fallback SHALL still apply, and the rendered block SHALL still respect the active light/dark theme via CSS custom properties.
- Files with text-like MIMEs but no registered grammar (e.g. `.txt`, `.csv`) SHALL render as plain monospace — highlighting is opt-in by language, not forced.
- Pull in one highlighter dependency under `web/` (chosen in design.md). No new Go dependencies.

## Capabilities

### New Capabilities

_None — this change extends an existing capability rather than introducing a new one._

### Modified Capabilities

- `directory-browser`: the "Text-like file rendering" requirement currently mandates that no syntax colours are applied; this change inverts that for files whose extension/MIME maps to a registered language grammar, expands the MIME extTable so the new languages are classified as `text` server-side, and leaves the wrap-not-scroll and plain-text-default behaviour intact. The "Markdown rendering" requirement gains scenarios for fenced code blocks rendering with the same highlighter.

## Impact

- **SPA (`web/src/`)**:
  - `web/package.json` gains one highlighter dependency (and possibly a small grammar/theme package).
  - `web/src/components/FileViewer.tsx` switches the text-body rendering path through a new `CodeBlock` (or similarly named) component.
  - `web/src/components/MarkdownRenderer.tsx` adds a `code` element renderer that delegates to the same component for fenced blocks.
  - New CSS file (or addition to `FileViewer.css` / `MarkdownRenderer.css`) provides token colour custom properties keyed off `[data-theme="light"|"dark"]`.
- **Go server**: `internal/server/mime/mime.go`'s extTable gains entries for the new programming-language and data extensions (`.cs`, `.kt`, `.kts`, `.swift`, `.scala`, `.sc`, `.groovy`, `.gradle`, `.m`, `.mm`, `.fs`, `.fsi`, `.fsx`, `.php`, `.phtml`, `.dart`, `.lua`, `.pl`, `.pm`, `.ps1`, `.psm1`, `.r`, `.R`, `.hs`, `.lhs`, `.ex`, `.exs`, `.erl`, `.hrl`, `.clj`, `.cljs`, `.cljc`, `.edn`, `.jl`, `.zig`, `.json`, `.toml`, `.graphql`, `.gql`, `.proto`). The resolver, `/raw`, `/api/meta`, `/api/tree`, and the embed/static handler are unchanged.
- **Embedded SPA artefact (`internal/server/ui/dist/`)**: regenerated as part of the change commit, per the existing "embedded SPA assets" requirement.
- **Bundle size**: grows by the size of the highlighter and the larger grammar set. Design.md picks the library and sets a revised budget (≤ 150 KB gz) so we don't regress mobile load time.
- **Spec**: one delta in `directory-browser` (rewrites the "SHALL NOT apply syntax highlighting" sentence, expands the language list, and adds new scenarios). No new capability files.
