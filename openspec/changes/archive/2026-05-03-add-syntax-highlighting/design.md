## Context

The SPA's file viewer renders text-like files in two places:

- `web/src/components/FileViewer.tsx` line 148 — `<pre className="text-body">{content}</pre>` for `meta.kind === 'text'`. Plain monospace, no tokenisation.
- `web/src/components/MarkdownRenderer.tsx` — fenced code blocks inside markdown go through `react-markdown` with the default renderer for `<code>`, also plain monospace.

The project already runs an explicit rehype pipeline in `MarkdownRenderer.tsx` (a relative-link-rewrite plugin followed by `rehype-sanitize`), so any markdown-side highlighter must slot into that pipeline and survive sanitisation. The text-body path is independent of react-markdown.

Constraints from existing requirements that must hold:

- Long lines wrap (no horizontal scrollbar on narrow viewports).
- Inline preview is gated by the 5 MiB cap, enforced client-side from `meta.size`.
- Light/dark/system theme is applied before React mounts via an inline script in `index.html`; CSS uses custom properties keyed on `[data-theme="..."]`. No Tailwind.
- The Go server is stdlib-only and serves `/raw/<path>` as untransformed bytes — highlighting is a client-side concern.
- Embedded SPA assets must ship in `internal/server/ui/dist/`; module-proxy installs must keep working without Node.

## Goals / Non-Goals

**Goals:**

- Token-level colouring for source files in the file viewer for a broad set of popular languages: the existing text-classified set (Go, TypeScript, JavaScript, Python, Ruby, Rust, Bash, HTML, XML, CSS, SCSS, SQL, C, C++, Java, YAML, Markdown) plus C#, Kotlin, Swift, Scala, Groovy, Objective-C, F#, PHP, Dart, Lua, Perl, PowerShell, R, Haskell, Elixir, Erlang, Clojure, Julia, Zig, and the data/config formats JSON, TOML, GraphQL, Protobuf.
- Token-level colouring for fenced code blocks inside markdown previews when the fence specifies a registered language.
- One highlighter dependency, one grammar registry, shared between the file viewer and the markdown renderer.
- Light/dark theme parity using the project's existing CSS-custom-property mechanism.
- Predictable bundle size growth: target ≤ 150 KB gzipped added to the SPA bundle (revised upward from the original 80 KB target to accommodate the expanded language set; revisit lazy-loading if this is exceeded).
- Plain-monospace behaviour preserved for `.txt`, `.csv`, unknown languages, and unspecified markdown fences.
- Long-line wrapping preserved.
- Server-side classification keeps pace: `internal/server/mime/mime.go`'s extTable is extended so the new extensions register `kind: "text"` in `/api/meta` and `/api/tree`. Without this, the file viewer would never reach the highlighter for a standalone `.kt` or `.json`.

**Non-Goals:**

- Server-side highlighting. The Go binary stays stdlib-only; `/raw` and `/api/meta` contracts are unchanged in shape.
- Filename-based language detection (e.g. `Dockerfile`, `Makefile`, `BUILD`, `WORKSPACE`). The server's MIME lookup is extension-only today; supporting filename-based matching requires a small architectural change to `mime.go` (a basename table consulted before the extension table) and is deferred to a follow-up. Files named `Dockerfile`, `Makefile`, etc. continue to fall through to non-previewable.
- Line numbers, copy-code-block buttons, line-anchor links, language-name badges. Those are SPA polish that can land separately.
- A user-facing toggle to disable highlighting. Highlighting is always on for known languages.
- Auto-detection of language from content. We always know the extension; auto-detection adds bundle weight and ambiguity.
- Highlighting markdown's other inline constructs (e.g. inline `<code>` spans). Only fenced blocks get tokenised; inline `<code>` stays as plain monospace, matching common reading conventions.

## Decisions

### Decision 1: Use `lowlight` (highlight.js as hast) for both paths

We will add a single dependency, `lowlight`, plus `rehype-highlight` for the markdown-pipeline integration. `lowlight` is highlight.js's grammar engine wrapped to produce hast (HTML AST), which means:

- The markdown renderer can drop `rehype-highlight` into its existing `rehypePlugins` array and reuse the same `lowlight` instance.
- The file viewer can call `lowlight.highlight(language, code)` directly and convert the resulting hast to React via `hast-util-to-jsx-runtime` (or hand-rolled traversal — small enough to avoid an extra dep).
- We register exactly the grammars we need; nothing is auto-included.

**Alternatives considered:**

- **`shiki`**: more accurate (TextMate grammars), but its grammars are large JSON blobs and the default code path needs WASM (Oniguruma). The bundle and load-time hit conflicts with the project's "single static binary, instant" pitch. Rejected.
- **`prismjs` / `prism-react-renderer`**: viable for the file viewer, but Prism's React wrappers don't cleanly slot into a rehype pipeline. We'd end up running two highlighters — one for fenced markdown blocks, one for standalone text — with two grammar surfaces. Rejected to avoid duplication.
- **`react-syntax-highlighter`**: includes either highlight.js or prismjs internally and ships a "common languages" bundle by default. Tree-shaking is fragile and the API duplicates what we already do with `lowlight`. Rejected.

### Decision 2: Register a curated, popular-language set; keep SPA grammars and server MIME table aligned

Grammar registration lives in a single module, e.g. `web/src/components/syntax/grammars.ts`, that imports each grammar from `highlight.js/lib/languages/<name>` and registers it on a shared `lowlight` instance. The mapping is curated to cover popular programming languages and the data/config formats most often committed to a project tree:

| Extension(s)                              | highlight.js grammar |
|-------------------------------------------|----------------------|
| .go                                       | `go`                 |
| .ts, .tsx                                 | `typescript`         |
| .js, .jsx                                 | `javascript`         |
| .py                                       | `python`             |
| .rb                                       | `ruby`               |
| .rs                                       | `rust`               |
| .sh                                       | `bash`               |
| .html, .htm, .xml                         | `xml`                |
| .css                                      | `css`                |
| .scss                                     | `scss`               |
| .sql                                      | `sql`                |
| .c, .h                                    | `c`                  |
| .cpp                                      | `cpp`                |
| .java                                     | `java`               |
| .yaml, .yml                               | `yaml`               |
| .md, .markdown                            | `markdown`           |
| .cs                                       | `csharp`             |
| .kt, .kts                                 | `kotlin`             |
| .swift                                    | `swift`              |
| .scala, .sc                               | `scala`              |
| .groovy, .gradle                          | `groovy`             |
| .m, .mm                                   | `objectivec`         |
| .fs, .fsi, .fsx                           | `fsharp`             |
| .php, .phtml                              | `php`                |
| .dart                                     | `dart`               |
| .lua                                      | `lua`                |
| .pl, .pm                                  | `perl`               |
| .ps1, .psm1                               | `powershell`         |
| .r, .R                                    | `r`                  |
| .hs, .lhs                                 | `haskell`            |
| .ex, .exs                                 | `elixir`             |
| .erl, .hrl                                | `erlang`             |
| .clj, .cljs, .cljc, .edn                  | `clojure`            |
| .jl                                       | `julia`              |
| .zig                                      | `zig`                |
| .json                                     | `json`               |
| .toml                                     | `ini`                |
| .graphql, .gql                            | `graphql`            |
| .proto                                    | `protobuf`           |

Extensions still classified as `text` but with no grammar (`.txt`, `.csv`) render plain. `.toml` flips from "render plain" to "highlight via the `ini` grammar" — `ini` is not a perfect match for TOML's typed values and dotted keys, but it correctly tokenises `[table]` headers, `key = value` pairs, strings, numbers, and comments, which covers the common case. Files that exercise the corners (inline tables, arrays of tables) will still render legibly, just with some tokens falling back to default text colour.

A small `extToLanguage(filename: string): string | null` helper centralises the lookup. The same helper is used by the file viewer (off the file path) and is also useful as a fallback for `rehype-highlight` when a markdown fence's info-string is empty (in which case we keep `detect: false` and stay plain — see Decision 5).

The set must stay aligned with `internal/server/mime/mime.go`'s extTable: every extension that maps to a grammar here is also classified as `text/...` server-side, otherwise the file viewer would never reach the highlighter for a standalone file. See Decision 8 for the server-side delta.

**Alternative considered:** importing highlight.js's `common` bundle (~37 grammars, ~30 KB+ gz). Rejected — `common` includes formats we deliberately omit (PHP-template variants, makefile, plaintext stubs) and excludes some we want (zig, julia). Explicit registration tracks intent and keeps the bundle reproducible.

**Alternative considered:** filename-based detection for extensionless files (`Dockerfile`, `Makefile`, `BUILD`, `WORKSPACE`). Rejected for this change — see Non-Goals; the server's MIME lookup is extension-only today and adding a basename path is a separable contract change.

### Decision 3: Theme via CSS custom properties, not vendored highlight.js stylesheets

highlight.js ships theme stylesheets that hardcode hex values. We don't use them. Instead:

- Add a new stylesheet (e.g. `web/src/styles/syntax.css` or appended to `MarkdownRenderer.css`) that maps highlight.js's class names — `.hljs`, `.hljs-keyword`, `.hljs-string`, `.hljs-comment`, `.hljs-number`, `.hljs-built_in`, `.hljs-literal`, `.hljs-title`, `.hljs-attr`, `.hljs-tag`, `.hljs-name`, `.hljs-variable`, `.hljs-meta`, `.hljs-symbol`, `.hljs-params` — onto a small set of project-namespaced custom properties (`--code-keyword`, `--code-string`, `--code-comment`, ...).
- Define the property values once at `:root` (light theme defaults) and override under `[data-theme="dark"]`. This matches how existing components colour themselves and inherits the no-flash-on-load behaviour for free.
- Token palette mirrors editor conventions: keywords/control flow, strings/literals, comments (muted), numbers, types/built-ins, attributes/tags. Eight to ten colour roles is enough; we don't need to colour every highlight.js class individually.

### Decision 4: Sanitiser allowlist extension for `hljs-*` classes

`rehype-sanitize` runs after `rehype-highlight` and strips the `hljs-*` class names by default. We extend its schema to allow `className` on `code` and `span` *only when each class matches `/^hljs(-[a-z_]+)*$/`*. This keeps the existing XSS protection intact (no arbitrary class names, no `<script>`/`<style>` reaching the DOM) while letting our own classes pass.

**Alternative considered:** running rehype-highlight after rehype-sanitize. Rejected — would be safe in this case but inverts the convention of "sanitise last", and any future plugin between them risks introducing unsanitised content.

### Decision 5: Synchronous load, lazy-load only if budget breaks

The highlighter loads with the rest of the SPA bundle. The expanded grammar set in Decision 2 is roughly 39 grammars at ~1–3 KB gz each plus the highlight.js core (~10 KB gz) plus `lowlight` and `rehype-highlight` glue, so the realistic delta sits in the 90–130 KB gz range. The budget is set to **≤ 150 KB gz** — generous enough to absorb expected variance, tight enough that a regression (e.g. a new dep accidentally pulling all 200+ highlight.js grammars) is caught at build time. If a future audit shows we've blown the budget, the fallback is to lazy-load the highlighter via `React.lazy` on the file viewer route, which keeps the initial page paint cheap; we don't pre-pay that complexity now.

Configure `rehype-highlight` with `{ detect: false }` so unspecified markdown fences stay plain instead of being heuristically coloured.

### Decision 6: One shared `<CodeBlock>` component, two callers

A new `web/src/components/CodeBlock.tsx` accepts `(code: string, language: string | null)` and:

- emits `<pre><code class="hljs language-<lang>">…tokenised spans…</code></pre>` if a registered grammar matches;
- emits `<pre><code class="hljs">…</code></pre>` (no token spans) for unknown languages, so the wrapping/styling rules apply uniformly.

`FileViewer.tsx` replaces its `<pre className="text-body">` branch with `<CodeBlock code={content!} language={extToLanguage(path)} />`.

`MarkdownRenderer.tsx` adds the rehype-highlight plugin (so the heavy lifting happens in the rehype tree, before React renders) and does not need to use `<CodeBlock>` directly. The shared CSS gives both paths the same look.

### Decision 7: Wrapping, line height, font

`<pre>` wrapping rules stay on the project's existing `.text-body` / `.md-body pre` selectors: `white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere`. Token spans inherit. We do not introduce horizontal scrollbars. Font remains the existing monospace stack; no per-token font weight changes (only colour) so wrapping behaviour is unchanged.

### Decision 8: Server-side MIME extTable expansion

`internal/server/mime/mime.go` keeps its extension-first design and gains an entry per new file extension. New entries use `text/x-<lang>; charset=utf-8` for languages without a registered IANA media type (mirroring the existing `.go → text/x-go` convention) and standard media types where they exist:

- `.cs → text/x-csharp`
- `.kt`, `.kts → text/x-kotlin`
- `.swift → text/x-swift`
- `.scala`, `.sc → text/x-scala`
- `.groovy`, `.gradle → text/x-groovy`
- `.m`, `.mm → text/x-objectivec`
- `.fs`, `.fsi`, `.fsx → text/x-fsharp`
- `.php`, `.phtml → text/x-php`
- `.dart → text/x-dart`
- `.lua → text/x-lua`
- `.pl`, `.pm → text/x-perl`
- `.ps1`, `.psm1 → text/x-powershell`
- `.r`, `.R → text/x-r`
- `.hs`, `.lhs → text/x-haskell`
- `.ex`, `.exs → text/x-elixir`
- `.erl`, `.hrl → text/x-erlang`
- `.clj`, `.cljs`, `.cljc`, `.edn → text/x-clojure`
- `.jl → text/x-julia`
- `.zig → text/x-zig`
- `.json → application/json` — exception, but the server's `kind` classifier looks at the `text/` prefix only. To keep `.json` files previewable, the classifier is extended to also treat `application/json` (and a small allow-list of other `application/*+json`/`+xml`-like text formats if/when needed) as `kind: "text"`. Or simpler and lower-risk: emit `text/json; charset=utf-8` from the extTable and avoid touching the classifier. **This design picks the latter** — `.json → text/json; charset=utf-8` — because it preserves the existing one-line `kind` rule and avoids special-casing the classifier.
- `.toml → text/toml; charset=utf-8` (already in the table; no change needed)
- `.graphql`, `.gql → application/graphql` would be the IANA-style choice; same reasoning as JSON, so we use `text/x-graphql; charset=utf-8`.
- `.proto → text/x-protobuf; charset=utf-8`

Note: `.toml` is already in the existing extTable as `text/toml; charset=utf-8`, so no change there — only the SPA-side grammar registration changes (from "render plain" to "highlight via `ini`").

The `mime_test.go` table-driven tests SHALL be extended with one assertion per new extension confirming that `Detect` returns the expected mime type for each new file kind.

## Risks / Trade-offs

- **Bundle size creep** → register grammars explicitly (Decision 2) and assert in tasks that `npm run build` reports the SPA stays under the agreed 150 KB gz delta. If exceeded, lazy-load the highlighter chunk on the file viewer route (Decision 5).
- **Sanitiser regression** (a future contributor adds another rehype plugin between highlight and sanitize, or replaces sanitize wholesale) → guarded by a regression test that mounts the markdown renderer with a known fenced block and asserts the output contains `class="hljs-keyword"`.
- **Wrapping regression on long minified lines** → keep the `white-space: pre-wrap` rule on the outer block; add a manual smoke check to tasks (open a long minified `.js` in the dev server, verify no horizontal scrollbar at 320 px).
- **TOML highlighted via `ini` is imperfect** — inline tables and arrays-of-tables tokenise loosely → call out in spec scenarios and design (Decision 2). Acceptable trade-off vs plain rendering. Revisit if highlight.js adds a first-class TOML grammar.
- **`.m` extension collides with MATLAB** — Objective-C and MATLAB both use `.m`; we register `objectivec`. MATLAB users will see ObjC-flavoured tokens, which still mostly aligns on numbers/strings/comments. Documented; no good way to disambiguate without content inspection, which we explicitly avoid.
- **Auto-detection drift** in markdown — highlight.js's auto-detection is on by default — → configure `rehype-highlight` with `detect: false` so an unspecified ` ``` ` block stays plain instead of being heuristically coloured.
- **Theme contrast** in dark mode → palette must be reviewed against the existing dark-mode background custom property; pick token colours that satisfy WCAG AA against that background. Captured as a review-task in tasks.md.
- **MIME table drift between SPA and server** — adding a grammar without the server-side extension entry means standalone files of that kind never reach the highlighter (they hit the non-previewable fallback). → Tasks.md sequences server-side extTable updates immediately after grammar registration and includes a unit assertion that every grammar-registered extension returns `kind: "text"` from the server's classifier.

## Migration Plan

Single-step ship. No data migration, no config flags, no backwards-compatibility shim:

1. Land the SPA changes in a single PR.
2. Regenerate `internal/server/ui/dist/` in the same commit (per the existing "embedded SPA assets" requirement).
3. CI runs `make test` (Go) and `cd web && npm run build` (SPA). Visual diff is by hand on `make dev-server` against `testdata/`.
4. Rollback = revert. The change is purely additive in the SPA layer; no API or storage changes to undo.

## Open Questions

- **Filename-based detection for `Dockerfile`, `Makefile`, etc.?** Deferred. Requires extending `internal/server/mime/mime.go` with a basename-first lookup before the extension table. Track as a follow-up change.
- **Should the file viewer surface the detected language as a small badge in the header?** Out of scope for this change; would be one more piece of UI to design and is not required to satisfy the highlighter requirement. Track separately if/when desired.
- **`.m` ambiguity (ObjC vs MATLAB):** registering `objectivec` is the higher-coverage default given current language popularity, but we should revisit if MATLAB usage in served trees turns out to be common. A future "language override" affordance per file could resolve it without picking a side.
