## 1. Repo skeleton

- [x] 1.1 Initialise the Go module at the repo root (`go mod init`) with a sensible module path
- [x] 1.2 Create the directory layout: `cmd/explorer/`, `internal/server/`, `internal/server/resolver/`, `internal/server/mime/`, `web/`, `testdata/`
- [x] 1.3 Add a `Makefile` with targets `web`, `build`, `dev-web`, `dev-server`, `run`, `clean`, `test`, `docker` (each documented with a one-line comment)
- [x] 1.4 Add a top-level `.gitignore` covering Go build output, `web/node_modules/`, `web/dist/`, IDE files, OS files
- [x] 1.5 Add a placeholder `README.md` (filled in later in task group 9)

## 2. Go server foundation

- [x] 2.1 Implement CLI flag parsing in `cmd/explorer/main.go`: positional `<dir>`, `--port` (default 8080), `--host` (default 127.0.0.1); validate that `<dir>` exists and is a readable directory; exit non-zero on bad input with a stderr message
- [x] 2.2 Compute the served root's absolute, symlink-resolved path once at startup and pass it into the server as immutable config
- [x] 2.3 Print the startup banner on stdout: served-root path and the bound URL; print the non-loopback warning when `--host` is not `127.0.0.1` / `::1` / `localhost`
- [x] 2.4 Wire `signal.NotifyContext` for SIGINT and SIGTERM and call `http.Server.Shutdown` with a 5–10s timeout on signal; exit 0
- [x] 2.5 Add an integration smoke test that boots the server against a fixture directory, hits a known endpoint, and checks the response

## 3. Path resolver and MIME detector

- [x] 3.1 Implement the path resolver in `internal/server/resolver/`: input is a request-relative path; output is either a contained absolute path (with `os.FileInfo`) or a typed error (`not_found`, `permission_denied`, `outside_root`, `not_regular`)
- [x] 3.2 The resolver must `path.Clean` first, reject `..` after cleaning, join with the served root, `EvalSymlinks` the joined path, and verify containment using a path-prefix check that respects path separators (no false matches like `/root` vs `/rooted`)
- [x] 3.3 Unit-test the resolver: dot-dot escape, percent-encoded escape, symlink to outside root, symlink within root, missing path, unreadable path, regular file, directory, special file
- [x] 3.4 Implement the MIME detector in `internal/server/mime/`: extension lookup table first (md, markdown, txt, json, yaml, yml, toml, go, ts, tsx, js, jsx, py, rb, rs, sh, html, css, scss, sql, png, jpg, jpeg, gif, webp, svg, plus a small handful of common ones); fall back to `http.DetectContentType` when extension is unknown
- [x] 3.5 Unit-test the MIME detector for the known-extension cases and for at least one extensionless text file falling through to sniff

## 4. JSON API endpoints

- [x] 4.1 Implement `GET /api/tree?path=...`: resolver → readdir → return JSON `{entries: [{name, type, size?, mtime?, mime?}, ...]}` with folders first then files, both case-insensitive alphabetical; include dotfiles; drop entries whose targets resolve outside the served root
- [x] 4.2 Implement `GET /api/file?path=...`: resolver → for image files return metadata-only `{size, mtime, mime, kind: "image"}`; for markdown / text-like files within the size cap, read UTF-8 content into `{size, mtime, mime, kind: "text"|"markdown", content}`; for files outside previewable categories, over the cap, or not valid UTF-8, return the typed error JSON
- [x] 4.3 Centralise the typed-error JSON shape (`{error: "<kind>", message: "..."}`) and the HTTP status mapping (`not_found` → 404, `permission_denied` → 403, `outside_root` → 400, `not_regular` → 400, `too_large` → 413, `not_utf8` → 400, `internal_error` → 500)
- [x] 4.4 Add the 5 MiB inline cap as a named constant; enforce in `/api/file` for markdown and text-like
- [x] 4.5 Integration tests for `/api/tree` and `/api/file` covering each typed-error case and at least one happy path per renderer category

## 5. /raw streaming endpoint

- [x] 5.1 Implement `GET /raw/<path>`: resolver → open the file → `io.Copy` to the response writer with `Content-Type` set from the MIME detector; do NOT set `Content-Disposition`; do NOT inspect query or headers
- [x] 5.2 Path argument is taken from the URL path, not a query parameter, so percent-encoded segments must be URL-decoded before resolving
- [x] 5.3 Apply the same resolver and typed-error mapping as the JSON endpoints; return the mapped HTTP status
- [x] 5.4 Integration tests: PNG bytes round-trip, dot-dot escape rejected, symlink-out-of-root rejected, large file streamed without buffering whole body in memory

## 6. SPA scaffold (Vite + React + TypeScript)

- [x] 6.1 Initialise Vite + React + TS in `web/` (`npm create vite@latest web -- --template react-ts`); commit `package.json`, `tsconfig.json`, `vite.config.ts`
- [x] 6.2 Configure Vite dev-server proxy: forward `/api`, `/raw`, `/view` (passthrough for HTML), `/assets` to `http://127.0.0.1:8080`
- [x] 6.3 Add the router (React Router or equivalent) with routes: `/` (root listing), `/view/*` (folder or file, decided by API), 404 fallback
- [x] 6.4 Build a typed API client in `web/src/api/` exposing `tree(path)`, `file(path)`, with consistent error handling that surfaces typed errors as a discriminated union

## 7. Layout, breadcrumbs, theme

- [x] 7.1 Implement the responsive layout shell with a single `md` breakpoint: below the breakpoint show one view at a time; at/above show a fixed-width tree sidebar (left) plus the content area (right)
- [x] 7.2 Implement breadcrumbs: each segment is a folder URL link; the trailing segment is the current folder/file
- [x] 7.3 Apply CSS custom properties keyed off `[data-theme]`; ensure a minimum touch-target size of 44px on interactive elements
- [x] 7.4 Implement theme: an inline `<script>` in `index.html` reads `localStorage["explorer.theme"]` (or system) and sets `data-theme` on `<html>` before React mounts; expose a top-bar toggle (light / dark / system) that writes back to `localStorage`
- [x] 7.5 Add a basic accessibility pass: keyboard focus visible, semantic landmarks (`<nav>`, `<main>`), all icons have accessible names

## 8. Tree sidebar (desktop) and listing view

- [x] 8.1 Build the desktop tree component that lazy-loads each folder via `/api/tree`; root is fetched on mount; each folder caches its children once expanded for the lifetime of the component
- [x] 8.2 Implement the GitHub-style folder row: chevron toggles expand/collapse without navigating; the folder name is a `<Link>` to its `/view/<path>/` URL
- [x] 8.3 Build the folder listing view (used in both mobile and desktop content area) that calls `/api/tree` for the current folder URL and renders rows; folders link to their listing URL, files link to their viewer URL
- [x] 8.4 Empty-folder state with a placeholder message
- [x] 8.5 Loading and error states for the listing view (use the typed-error message)

## 9. File viewer renderers

- [x] 9.1 File viewer container: calls `/api/file` for the current file URL, dispatches by `kind` ("markdown" | "text" | "image") or by typed error to the non-previewable placeholder
- [x] 9.2 Markdown renderer: `react-markdown` + `remark-gfm` + `rehype-sanitize` (or equivalent); custom rehype plugin that rewrites relative `<img src>` to `/raw/<currentDir>/<src>` and relative `<a href>` to `/view/<currentDir>/<href>`; absolute URLs and root-relative paths pass through
- [x] 9.3 Text-like renderer: `<pre>` with `white-space: pre-wrap`, monospace font, no syntax highlighting
- [x] 9.4 Image renderer: `<img src="/raw/<path>">` with appropriate alt text from the filename; the image is allowed to scale to viewport width
- [x] 9.5 Non-previewable placeholder: filename, size, the explanatory message (different copy for "unsupported type" vs "too large"), and the Download button as `<a href="/raw/<path>" download="<filename>">Download</a>`
- [x] 9.6 Viewer header showing size and modification time on every renderer

## 10. Embed React build into the Go binary

- [x] 10.1 Add a `//go:embed all:web/dist` directive in the server package and serve it as the static asset root (`/`, `/assets/*`)
- [x] 10.2 SPA fallback: any non-API, non-raw request that doesn't match a static file path serves `web/dist/index.html` so client-side routes (`/view/...`) work on direct page load
- [x] 10.3 Make `make build` orchestrate: `cd web && npm ci && npm run build`, then `go build -trimpath -ldflags="-s -w" ./cmd/explorer`
- [x] 10.4 Verify a clean `make build` produces a single binary that, when run against `testdata/`, serves the SPA without needing `web/dist/` on disk

## 11. Docker and compose

- [x] 11.1 Write a multi-stage `Dockerfile`: stage 1 (`node:LTS-alpine`) does `npm ci && npm run build` in `web/`; stage 2 (`golang:LTS-alpine`) builds a static binary with `CGO_ENABLED=0`; stage 3 (`gcr.io/distroless/static-debian12:nonroot`) copies the binary and runs as `nonroot`
- [x] 11.2 Add `.dockerignore` covering `web/node_modules/`, `web/dist/`, build output, IDE files
- [x] 11.3 Write `docker-compose.yml` at the repo root: `build: .`, `ports: ["8080:8080"]`, `volumes: [".:/data:ro"]`, `command: ["/data", "--host", "0.0.0.0", "--port", "8080"]`
- [x] 11.4 Add a comment in the compose file explaining why `--host 0.0.0.0` is required inside the container

## 12. README and final smoke

- [x] 12.1 Write `README.md` covering: what `explorer` does, install/build instructions (`make build`), `explorer <dir>` usage, the `--port` and `--host` flags, the non-loopback warning behaviour, the Docker / compose flow with the `--host 0.0.0.0` gotcha called out, the explicit out-of-v1 list, and a short troubleshooting section
- [x] 12.2 Populate `testdata/` with a small fixture tree exercising each renderer (one markdown with a relative image and a relative link, one plain `.txt`, one source file, a PNG, a SVG, a binary file like a tiny `.zip`, a hidden file, a symlink within the root, and a symlink pointing outside)
- [x] 12.3 End-to-end smoke: `make build && ./explorer ./testdata` and walk through, on both desktop and a mobile viewport (Chromium device emulation is fine), each renderer category, the breadcrumbs, the theme toggle, the symlink-outside rejection, and the download button on a non-previewable file
- [x] 12.4 Update `openspec/config.yaml` with a short `context:` block summarising the tech stack (Go stdlib server, React + TS + Vite SPA, embedded via `embed.FS`, mobile-first read-only browser) and any conventions worth pinning for future changes
