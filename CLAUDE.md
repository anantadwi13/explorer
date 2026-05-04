# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`explorer` is a single-binary local directory browser: a Go HTTP server with an embedded React+Vite SPA. Point it at a directory; it serves a read-only browser over HTTP with markdown/text/image preview and deep-linkable URLs.

## Commands

```bash
make build          # full build: web SPA → embed → Go binary (./explorer)
make web            # SPA only (cd web && npm ci && npm run build)
make test           # go test ./cmd/... ./internal/... (excludes web/)
make dev-server     # build + run Go binary against ./testdata
make dev-web        # Vite dev server on :5173, proxies /api /raw /assets to :8080
make run            # full build then run against ./testdata
make clean          # remove ./explorer and internal/server/ui/dist
make docker         # build explorer:latest

# Single Go test
go test ./internal/server -run TestFileMarkdown -v

# SPA lint (no Go linter configured)
cd web && npm run lint
```

`make build` is required (not `go build` alone) — the Go binary uses `//go:embed all:dist` and serves an HTTP 404 fallback (the stock `http.ServeFileFS` response when `dist/index.html` is missing) if `internal/server/ui/dist/` is empty.

The dev workflow is two-process: `make dev-server` (Go on :8080) + `make dev-web` (Vite on :5173). Vite proxies API/raw paths to the Go server.

## Architecture

### Single-binary embed

The React SPA builds to `internal/server/ui/dist/` (configured in `web/vite.config.ts` via `outDir: '../internal/server/ui/dist'`). `internal/server/ui/ui.go` does `//go:embed all:dist` to bake it into the Go binary. The static handler (`internal/server/static.go`) serves exact file matches and falls back to `index.html` for SPA client-routes.

`internal/server/ui/dist/` is committed to source control so module-proxy installs (`go install` / `go run github.com/anantadwi13/explorer/cmd/explorer@latest`) produce a working binary without Node. **Any change under `web/src/` requires running `make web-commit` (or `make web` + `git add internal/server/ui/dist`) in the same commit** so the embedded SPA stays in sync with the source.

### Path-traversal containment is the security boundary

**Every** path-accepting endpoint (`/api/tree`, `/api/file`, `/raw/*`) flows through `internal/server/resolver.Resolver.Resolve`. The served root is resolved once at startup (`filepath.EvalSymlinks` + `filepath.Abs` in `cmd/explorer/main.go`). Per-request, `Resolve` cleans the input, rejects `..`/absolute paths, joins to root, `EvalSymlinks` the result, and verifies prefix-containment under the root before any file open. Symlinks pointing outside the root return `ErrOutsideRoot` (HTTP 400) and are silently dropped from `/api/tree` listings — see `TestTreeOutsideRootSymlinkDropped`. Don't add a new endpoint that touches the filesystem without going through the resolver.

Errors are typed (`not_found`, `permission_denied`, `outside_root`, `not_regular`, `too_large`, `not_utf8`, `internal_error`) and serialized via `internal/server/errors.go` as `{error, message}` JSON with mapped HTTP status codes. The TS `ApiError` union in `web/src/api/types.ts` mirrors this exactly — keep both sides in sync.

### Three endpoint shapes, three roles

- `GET /api/tree?path=<rel>` — JSON listing of a single folder level. Lazy: no recursion. Sort is dirs-first, then case-insensitive name. Hidden files (`.foo`) are included.
- `GET /api/file?path=<rel>` — JSON metadata + inline content for previewable files. Cap is `inlineSizeCap = 5 * 1024 * 1024` (named constant in `internal/server/api.go`). Markdown/text are inlined as UTF-8 strings; images return metadata only (the SPA loads bytes via `/raw/`); everything else gets `not_regular`.
- `GET /raw/<path>` — streams bytes with `Content-Type` from MIME detection; **never** sets `Content-Disposition` (the SPA's `<a download>` handles save-vs-display).

The SPA's `/view/<path>/` (folder, trailing slash) vs `/view/<path>` (file, no slash) convention is reconciled in `web/src/pages/ViewPage.tsx`: it calls `/api/tree` first; if the server says `not_regular`, falls back to `FileViewer`.

### MIME detection is extension-first

`internal/server/mime/mime.go` uses an explicit `extTable` (md, txt, source-code extensions, common image formats) before falling back to `http.DetectContentType` on the first 512 bytes. This is what classifies a file as `markdown` / `text` / `image` / non-previewable in `fileKind` (`internal/server/api.go`).

### CLI flag parsing is custom

`cmd/explorer/main.go` partitions argv into flag-args and positional-args manually so `<dir>` can appear before or after `--port`/`--host`. Don't switch to plain `flag.Parse()` — it would break `explorer . --port 9000` ordering documented in tests/docs.

### SPA conventions

- Routing: `react-router-dom` v7. `/` and `/view/*` route to `ViewPage`; trailing slash means folder, no slash means file.
- Markdown rendering pipeline: `web/src/components/MarkdownRenderer.tsx` runs three rehype plugins in order: (1) a custom relative-link-rewrite plugin (`img src` → `/raw/…`, `a href` → `/view/…`); (2) **`rehype-highlight`** with `{ detect: false }` and a curated grammar set from `web/src/components/syntax/grammars.ts` — this tokenises fenced code blocks for registered languages only; (3) **`rehype-sanitize`** with a schema extended from `defaultSchema` to also allow `className` values matching `^hljs(-[a-z_]+)*$` on `<code>` and `<span>`. The sanitiser runs last to strip arbitrary classes and scripts. Do not reorder or remove any of these plugins; the allowlist specifically covers only the classes emitted by the highlighter.
- Syntax highlighting for standalone files: `web/src/components/CodeBlock.tsx` uses the same shared `lowlight` instance from `syntax/grammars.ts`. The file viewer delegates to `CodeBlock` for all `kind="text"` files. `extToLanguage(filename)` maps extensions to highlight.js grammar ids; returns `null` for `.txt`, `.csv`, and unknown extensions, which renders as plain monospace.
- **Grammar/MIME alignment invariant**: every file extension that `extToLanguage` maps to a non-null grammar must also return a `text/…` MIME from the server's extTable. This is guarded by `TestExtensionsWithTextKindAreTextMIME` (Go) and the "SPA/server alignment" tests in `grammars.test.ts`. When adding a new language, update both the Go extTable and the TS grammar registry together.
- Theme: stored in `localStorage["explorer.theme"]` (`light` / `dark` / system = absent). Applied via inline script in `web/index.html` **before React mounts** to avoid flash. The `useTheme` hook in `web/src/hooks/useTheme.ts` keeps `<html data-theme>` in sync; CSS uses `[data-theme="..."]` custom-property switches (no Tailwind). Syntax token colours are declared in `web/src/styles/syntax.css` as `--code-*` custom properties with light defaults at `:root` and dark overrides under `[data-theme="dark"]`.
- Layout: split tree+viewer at `≥768px`, single view below. Tree sidebar lazy-loads one level at a time. Touch targets ≥44px; no hover-only affordances.

### Spec source of truth

The `openspec/` directory holds spec-driven-development artifacts. Behavior contracts live in `openspec/specs/directory-browser/spec.md` (CLI flags, API shapes, path-traversal rules, SPA URL conventions, render rules). Treat that file as the canonical contract when changing server or SPA behavior; the corresponding `opsx:*` skills are wired up in `.claude/commands/opsx/`.

## Conventions

- Go module path: `github.com/anantadwi13/explorer`. Go 1.24+. No external Go dependencies — stdlib only.
- The Go binary is committed at the repo root after a build (`./explorer`); `make clean` removes it.
- Tests live next to code (`*_test.go`); the resolver and mime packages have focused unit tests, server has black-box `_test` tests via `httptest`.
- `testdata/` is the fixture directory used by `make dev-server` / `make run` — feel free to drop sample files there for manual testing.
