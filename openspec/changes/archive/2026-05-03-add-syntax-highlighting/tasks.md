## 1. Server-side MIME extTable expansion

- [x] 1.1 Extend `internal/server/mime/mime.go`'s `extTable` with the new programming-language extensions per design.md Decision 8: `.cs`, `.kt`, `.kts`, `.swift`, `.scala`, `.sc`, `.groovy`, `.gradle`, `.m`, `.mm`, `.fs`, `.fsi`, `.fsx`, `.php`, `.phtml`, `.dart`, `.lua`, `.pl`, `.pm`, `.ps1`, `.psm1`, `.r`, `.R`, `.hs`, `.lhs`, `.ex`, `.exs`, `.erl`, `.hrl`, `.clj`, `.cljs`, `.cljc`, `.edn`, `.jl`, `.zig`. Use `text/x-<lang>; charset=utf-8` per the existing convention.
- [x] 1.2 Extend `extTable` with the data/config extensions: `.json → text/json; charset=utf-8`, `.graphql`/`.gql → text/x-graphql; charset=utf-8`, `.proto → text/x-protobuf; charset=utf-8`. (`.toml` is already in the table — no change.)
- [x] 1.3 Extend `internal/server/mime/mime_test.go` table-driven tests with one assertion per new extension confirming the expected mime type. Include at least one negative case (e.g. an unknown extension still returns `application/octet-stream` or whatever the existing fallback returns).
- [x] 1.4 Add an integration-style test (in the existing server `_test` package using `httptest`) that requests `/api/meta?path=<file>` for representative new extensions (`.kt`, `.json`, `.proto`) and asserts `kind: "text"` and a `text/...` mime in the JSON response.
- [x] 1.5 Run `make test` to confirm the Go server changes pass before moving to the SPA.

## 2. SPA dependencies and grammar registry

- [x] 2.1 Add `lowlight` and `rehype-highlight` to `web/package.json` dependencies; run `npm install` and commit the lockfile update.
- [x] 2.2 Create `web/src/components/syntax/grammars.ts` exporting a shared `lowlight` instance with the full language set from design.md Decision 2: go, typescript, javascript, python, ruby, rust, bash, xml, css, scss, sql, c, cpp, java, yaml, markdown, csharp, kotlin, swift, scala, groovy, objectivec, fsharp, php, dart, lua, perl, powershell, r, haskell, elixir, erlang, clojure, julia, zig, json, ini (for TOML), graphql, protobuf. Register only those grammars — no `common` import.
- [x] 2.3 In the same module, export `extToLanguage(filename: string): string | null` that mirrors the new server-side extTable from §1 and returns the highlight.js language id (or `null` for `.txt`/`.csv`/no-extension/unknown). Note `.toml → 'ini'` and `.m`/`.mm → 'objectivec'`.
- [x] 2.4 Add a unit test `web/src/components/syntax/grammars.test.ts` (or extend an existing test setup) that asserts `extToLanguage` returns the expected id for a representative sample covering each language family (`.go`, `.tsx`, `.kt`, `.swift`, `.cs`, `.rb`, `.py`, `.lua`, `.json`, `.toml`, `.proto`, `.txt`, `.csv`, no-extension file).
- [x] 2.5 Add a unit test asserting that every extension that has a non-`null` `extToLanguage` mapping is also classified as `text/...` by the server's MIME table — guard against the SPA/server drift risk called out in design.md. (Implement as a TS-side test that hard-codes the expected list and a Go-side test that exercises the same expectation; keep the lists side-by-side in the two test files so a contributor adding a language sees both.)

## 3. Theme stylesheet

- [x] 3.1 Add a stylesheet — either `web/src/styles/syntax.css` or appended to `MarkdownRenderer.css` — that defines token-role custom properties (`--code-keyword`, `--code-string`, `--code-comment`, `--code-number`, `--code-builtin`, `--code-literal`, `--code-attr`, `--code-tag`, `--code-meta`, `--code-variable`) at `:root` (light) and overrides them under `[data-theme="dark"]`.
- [x] 3.2 In the same stylesheet, map highlight.js classes (`.hljs-keyword`, `.hljs-string`, `.hljs-comment`, `.hljs-number`, `.hljs-built_in`, `.hljs-literal`, `.hljs-attr`, `.hljs-tag`, `.hljs-name`, `.hljs-meta`, `.hljs-variable`, `.hljs-symbol`, `.hljs-params`, `.hljs-title`, `.hljs-section`) onto the custom properties from 3.1.
- [x] 3.3 Verify token contrast ratios in light and dark themes against the project's existing background custom properties; adjust palette to meet WCAG AA for normal-weight text.
- [x] 3.4 Import the new stylesheet from the entry that already loads `MarkdownRenderer.css` (or from `main.tsx` if it stands alone) so it ships with every page.

## 4. Shared CodeBlock component

- [x] 4.1 Create `web/src/components/CodeBlock.tsx` that takes `{ code: string; language: string | null }` and uses the shared `lowlight` instance to render `<pre><code class="hljs language-<lang>">…</code></pre>` with tokenised spans, falling back to `<pre><code class="hljs">{code}</code></pre>` when `language` is `null` or not registered.
- [x] 4.2 Ensure the component preserves whitespace (`white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere` on the wrapper) so long lines wrap on narrow viewports.
- [x] 4.3 Convert the `lowlight` hast result to React without introducing a new runtime dependency — either traverse the tree manually or use an inlined helper. Reference: `lowlight`'s `Root`/`Element` types from the hast package already in the dependency tree via react-markdown.

## 5. File viewer integration

- [x] 5.1 In `web/src/components/FileViewer.tsx`, replace the `meta.kind === 'text'` branch (`<pre className="text-body">{content}</pre>`) with `<CodeBlock code={content!} language={extToLanguage(path)} />`.
- [x] 5.2 Move any `.text-body` specific styling that should still apply (font, padding, background) onto the new `CodeBlock` wrapper class so the visual outer chrome of the text view is unchanged.
- [x] 5.3 Smoke-test in the dev server (`make dev-server` + `make dev-web`) against `testdata/`: open a Go file, a TypeScript file, a Kotlin file, a Swift file, a JSON file, a TOML file, a `.txt` file, and a `.csv` file. Confirm code/data files show token colours and `.txt`/`.csv` stay plain.

## 6. Markdown integration

- [x] 6.1 In `web/src/components/MarkdownRenderer.tsx`, import `rehype-highlight` and the shared `lowlight` instance from `syntax/grammars.ts`. Add it to `rehypePlugins` BEFORE `rehypeSanitize`, configured with `{ detect: false }` so unspecified fences stay plain.
- [x] 6.2 Extend the `rehype-sanitize` schema (use `defaultSchema` from `rehype-sanitize` as the base and clone it) to allow `className` on `code` and `span` for values matching `/^hljs(-[a-z_]+)*$/`. Pass the customised schema as the second argument to `rehypeSanitize`.
- [x] 6.3 Verify inline `<code>` (single backticks) renders without `hljs-` token spans; only fenced blocks should be tokenised.
- [x] 6.4 Smoke-test in the dev server with a markdown file containing fenced blocks for `go`, `typescript`, `python`, `kotlin`, `json`, an unspecified ` ``` ` block, an unknown-language fence (e.g. ` ```esoteric `), and an inline `` `snippet` ``. Confirm only the registered-language fences show token colours and that inline code / unknown / unspecified blocks stay plain.

## 7. Regression tests

- [x] 7.1 Add a unit/integration test for `MarkdownRenderer` that mounts a sample with a fenced ```go block and asserts the rendered DOM contains a `class` attribute whose value matches `^hljs-(keyword|string|comment|...)`. (Choose at least three token classes that the test fixture is guaranteed to produce.)
- [x] 7.2 Add a similar test for at least one newly added language (e.g. fenced ```kotlin or ```swift) to guard against regressions in the registration list.
- [x] 7.3 Add a test that mounts `MarkdownRenderer` with `<script>alert(1)</script>` plus a fenced ```go block and asserts the script is stripped while the highlighter classes survive.
- [x] 7.4 Add a test for `FileViewer` (or `CodeBlock` in isolation) confirming an unknown-language input renders as `<code class="hljs">…literal text…</code>` with no token spans.

## 8. Build, bundle, embed

- [x] 8.1 Run `cd web && npm run build`; record the SPA bundle size delta against the prior commit. Confirm the gzipped delta is ≤ 150 KB (per design.md Decision 5); if it exceeds the budget, lazy-load the highlighter chunk on the file viewer route via `React.lazy` before proceeding.
- [x] 8.2 Re-embed the built SPA: `make web-commit` (or `make web` followed by `git add internal/server/ui/dist`) so the published Go module continues to ship a runnable binary without Node.
- [x] 8.3 Run `make test` (Go) end-to-end after the SPA is rebuilt — should pass with the new MIME-table assertions from §1 included.
- [x] 8.4 Run `make build` end-to-end and verify the resulting `./explorer` binary serves a Kotlin file with token colours when pointed at `testdata/` (drop a small `.kt` fixture into `testdata/` if none exists).

## 9. Documentation

- [x] 9.1 Update the relevant section of `CLAUDE.md` ("SPA conventions" → markdown rendering pipeline) to mention rehype-highlight + the customised sanitiser schema, so future contributors don't accidentally remove either. Mention the SPA-grammars / server-mime-table alignment invariant.
- [x] 9.2 If the README mentions previewable file types, update it to note that source-code files (with the expanded language list) are now syntax-highlighted.
