## Why

There's no lightweight, single-binary way to browse and read the contents of an arbitrary local directory from a phone on the same network — the common alternatives (file managers, IDEs, `python -m http.server`) either don't render markdown/images natively in the browser, are mobile-hostile, or aren't a single executable you can drop on any machine. `explorer` fills that gap: point it at a directory, open a URL, read everything in place — primarily from a phone.

## What Changes

- **New CLI binary `explorer`** that serves a single local directory over HTTP and ships an embedded React SPA for read-only browsing.
- CLI surface: `explorer <dir> [--port 8080] [--host 127.0.0.1]`. `--host` defaults to loopback; the user can override (e.g. `0.0.0.0`) and the startup banner prints the bound URL(s) and warns when the host is non-loopback.
- HTTP surface (read-only):
  - `/` and `/view/<path>/` — SPA folder listing.
  - `/view/<path>` — SPA file viewer.
  - `/raw/<path>` — dumb byte stream of a file with the right `Content-Type`. No attachment header, no UI; same endpoint serves both `<img src>` use and `<a download>` use from the SPA.
  - `/api/tree?path=...` — JSON folder listing, called lazily by the SPA (one call per folder open).
  - `/api/file?path=...` — JSON file content + metadata (size, mtime, mime) for previewable files.
  - `/assets/*` — embedded React build assets.
- File renderers in the SPA viewer:
  - Markdown (GFM, sanitized HTML, relative image/link refs resolve to other files in the served root).
  - Text-like files (txt, code, json, yaml, etc.) shown as plain monospace pre-formatted text — **no syntax highlighting in v1**.
  - Images (png/jpg/jpeg/gif/webp/svg) inline via `<img src="/raw/<path>">`.
  - Anything else, or anything over the inline-render size cap (~5 MB), shows a "Not previewable" placeholder with a Download button (`<a href="/raw/<path>" download>`).
- File / tree behaviour: lazy tree load; dotfiles shown by default; symlinks that resolve outside the served root are rejected; folders-first case-insensitive sort; filename-only in the tree, size + mtime in the viewer header; MIME by extension first, fall back to `http.DetectContentType`.
- Mobile-first responsive UI:
  - On mobile, two views, one at a time — a browse view (folder listing) and a viewer view (file). Touch targets ≥ 44 px, no hover-only affordances.
  - On desktop (≥ md breakpoint), a split layout: tree sidebar on the left, viewer on the right. GitHub-style behaviour in the tree — chevron toggles expand/collapse, clicking the folder *name* navigates to that folder's listing URL.
  - Breadcrumbs everywhere; URL deep-linking for both folder and file views.
- Theme: auto from `prefers-color-scheme`, with a manual toggle persisted in `localStorage`.
- Path-traversal hardening on every endpoint that accepts a path (`/view`, `/raw`, `/api/*`).
- Graceful shutdown on SIGINT / SIGTERM.
- Single-binary distribution: React build embedded into the Go binary via `embed.FS`; no separate frontend process at runtime.
- Container support: a multi-stage `Dockerfile` (Node build → Go build → minimal non-root final image) plus a `docker-compose.yml` example that bind-mounts the host's current directory into `/data` (read-only) and runs `explorer /data --host 0.0.0.0 --port 8080`. The compose example documents the gotcha that the in-container `--host` MUST be `0.0.0.0` for port mapping to reach the server.

### Non-goals (out of scope for v1)

These are intentionally deferred so the v1 stays focused. They are reasonable follow-up changes:

- File watcher / live reload — refresh re-reads.
- Tree pagination per folder (lazy is enough for v1; pagination is the next step for very large folders).
- Search across files.
- Syntax highlighting for code files.
- README auto-render in folder listings.
- Authentication / multi-user — the threat model is "local, read-only".
- Write / update / delete operations.
- PDF, Office, video, or audio preview — only markdown, text-like, and images preview inline in v1.

### High-level UX shape

```
   Mobile (default)              Desktop (≥ md breakpoint)
  ┌──────────────┐              ┌────────┬───────────────┐
  │  ← /sub/path │              │  tree  │  viewer       │
  ├──────────────┤              │        │               │
  │  📁 docs     │              │  📁 …  │  # Hello      │
  │  📁 images   │              │  📄 …  │  ...          │
  │  📄 README.md│              │        │               │
  └──────────────┘              └────────┴───────────────┘
   tap file →
  ┌──────────────┐
  │  ← back      │
  ├──────────────┤
  │  # Hello     │
  │  body text…  │
  └──────────────┘
```

## Capabilities

### New Capabilities

- `directory-browser`: Read-only HTTP browsing of a local directory, including the CLI entrypoint, lazy tree listing API, file content API, raw byte streaming, the SPA viewer with markdown / text / image renderers and the non-previewable fallback, mobile-first responsive layout with deep-linkable folder and file URLs, theme handling, path-traversal containment, and graceful shutdown.

### Modified Capabilities

<!-- None. This is the project's first capability; openspec/specs/ is currently empty. -->

## Impact

- **New code**: Go server (`cmd/explorer`, `internal/server`), React + TypeScript + Vite app (`web/`), embedded asset bundle wired up via `embed.FS`.
- **New repository scaffolding**: `go.mod`, `web/package.json`, build glue (Makefile or `go generate` step that runs `npm run build` before `go build`).
- **New external dependencies**:
  - Go: standard library only is the goal; small helpers may be added if cleanly justified (none required by the spec).
  - npm: React, ReactDOM, a router (e.g. React Router), a sanitizing GFM markdown stack (e.g. `react-markdown` + `remark-gfm` + `rehype-sanitize` or equivalent), and Vite's TS toolchain.
- **New ops surface**: `Dockerfile` and `docker-compose.yml` example committed at the repo root.
- **No existing systems affected** — repo currently has only the OpenSpec scaffold. No migration concerns.
- **Threat model**: local read-only. Path-traversal guards and the symlink-outside-root rule are the security boundary; binding to loopback by default minimises accidental network exposure.
