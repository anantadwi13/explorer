## Context

The repository is a fresh OpenSpec scaffold — no existing code, no archived changes. This is the first capability. The product is a Go CLI, `explorer`, that serves any local directory over HTTP for read-only browsing, with a React (Vite + TypeScript) SPA embedded into the binary. Primary user is a phone on the same LAN as the host machine; secondary is the host's own browser. The threat model is "local, read-only" — there is no auth and no write surface.

Constraints driving the design:

- Single static binary (Go) with the React build embedded via `embed.FS`. No separate frontend process at runtime.
- Default-safe network posture: bind to `127.0.0.1` unless the user opts in.
- Mobile-first UI — the desktop split layout is the *secondary* shape, not the primary.
- v1 must stay focused. Several obvious adjacent features (file watch, search, syntax highlighting, README auto-render, pagination) are explicitly deferred so we don't drift.

## Goals / Non-Goals

**Goals:**

- Drop-in single binary: `explorer <dir>` → working URL in seconds, no setup.
- Phone-friendly browsing: tap into folders, read markdown / text / images inline, download anything else.
- Deep-linkable: every folder and file has a stable URL (`/view/<path>/` or `/view/<path>`).
- Defence-in-depth path containment, even on loopback.
- Trivial container story: `Dockerfile` + `docker-compose.yml` example that bind-mounts the host's working directory.

**Non-Goals:**

- Auth, multi-user, write/edit/delete operations.
- Live reload / file watcher.
- Search across files.
- Syntax highlighting for code.
- README auto-render in folder listings.
- Tree pagination per folder.
- PDF / Office / video / audio preview.
- Cross-process scaling (only one binary per served directory).

## Decisions

### Architecture: single static Go binary with embedded React SPA

```
                ┌──────────────────────────────────────────────┐
                │  explorer (single static Go binary)          │
                │                                              │
   browser ──▶  │  net/http mux                                │
   (phone)      │   ├─ /api/tree?path=...   (JSON listing)     │
                │   ├─ /api/file?path=...   (JSON content)     │
                │   ├─ /raw/<path>          (byte stream)      │
                │   ├─ /view/<path>[/]      ─┐                 │
                │   ├─ /                    ─┤  → SPA shell    │
                │   └─ /assets/*            ─┘    from embed   │
                │                                              │
                │  internal/server                             │
                │   ├─ resolver (path-traversal + symlink)     │
                │   ├─ mime detector                           │
                │   └─ filesystem reader (read-only)           │
                │                                              │
                │  embedded:                                   │
                │   web/dist/  (React+TS build via Vite)       │
                └──────────────────────────────────────────────┘
                              │
                              ▼
                       served root <dir>
```

**Rationale.** A Go binary is the smallest deployable unit that meets "drop in anywhere, no runtime deps". Embedding the SPA via `embed.FS` keeps it to one artefact and avoids a CORS/proxy dance during local use. The frontend is a *thick* client (handles routing, theming, layout) so the Go side stays a thin file/JSON server.

**Alternatives considered.**

- *Server-rendered HTML (templ / html/template).* Rejected: markdown sanitization and a tree sidebar with dynamic state are awkward server-side; mobile-first responsive UX is much easier in React.
- *Two-process dev/runtime (Go API + node-served React).* Rejected: two artefacts to ship, two ports to manage, no upside for v1 when we can `embed.FS` the production build.
- *Static-only site generated ahead of time.* Rejected: doesn't satisfy "point at any directory" — generation step would have to re-run on every invocation and break for very large trees.

### URL map: SPA at `/view/<path>`, JSON API at `/api/*`, dumb byte stream at `/raw/<path>`

Final shape:

```
/                        → SPA (root folder listing)
/view/<path>/            → SPA (folder listing)
/view/<path>             → SPA (file viewer)
/raw/<path>              → raw file bytes streamed with correct Content-Type
                           (no attachment header, no UI, no logic)
/api/tree?path=...       → JSON folder listing (lazy, one call per folder open)
/api/file?path=...       → JSON file content + metadata (size, mtime, mime)
/assets/*                → embedded React build assets
```

**The `/raw/` endpoint is intentionally dumb.** It does one job: stream a single file's bytes with a correct `Content-Type`. It does *not* set `Content-Disposition: attachment` and it does *not* render any UI. The same endpoint is consumed in two ways from the SPA:

1. *Inline* — `<img src="/raw/<path>">` for image files and for relative image refs inside rendered markdown.
2. *Download* — `<a href="/raw/<path>" download="<filename>">Download</a>` on the "Not previewable" placeholder. The browser's `download` attribute (always same-origin in our setup) instructs it to save the response instead of navigating.

This keeps the server simple and pushes the "inline vs download" choice into the SPA where the context for that choice already lives.

**Rationale for separating `/view` (SPA) from `/raw` (bytes).** A user pasting `/view/image.png` into the address bar gets the rendered viewer (with metadata, breadcrumbs, theme). Pasting `/raw/image.png` gets the bare bytes (the browser just shows the image). Two intents, two URLs, no clever routing.

**Rationale for keeping `/api` as the JSON namespace.** `/view/` already namespaces every user-facing path under `/view/<path>`, so `/api/*` cannot collide with a real folder/file in the served root. We don't need a more exotic prefix like `/_api/`.

**Folder vs file at `/view/<path>`.** The SPA does not pre-decide. It calls `/api/tree?path=<path>` first; if the server replies with a directory listing, render the listing view; if it replies with a "not a directory" error, the SPA falls back to `/api/file?path=<path>` for the file viewer. (Equivalent to a single combined "stat-or-list" endpoint, but using two well-typed endpoints keeps payloads simple.)

### Tree loading: lazy per folder

The SPA fetches `/api/tree?path=<folder>` exactly when a folder needs to render — on initial load (root), when the user expands a node in the desktop sidebar, or when navigating into a folder URL on mobile. The response is *one level only*: direct children of the requested folder, each entry tagged `dir | file` with a name and (for files) size + mtime + mime.

**Why lazy.** Eager full-tree responses break on real-world directories — a `node_modules` or a media library can have tens of thousands of files. Lazy keeps each response bounded and renders fast.

**Pagination is deferred.** A v1 lazy request still returns *all* immediate children of one folder, which can itself be huge in pathological cases. We accept this and note tree pagination per folder as a planned follow-up.

**No client-side caching across navigations in v1.** Each open re-fetches. Good enough for v1; a small in-memory cache keyed by path is a future micro-optimisation.

### Rendering pipeline

The SPA's file viewer dispatches by mime category:

| Category         | Detection                                                | Renderer                                                                 |
|------------------|----------------------------------------------------------|--------------------------------------------------------------------------|
| Markdown         | extension `.md` / `.markdown`                            | GFM via `react-markdown` + `remark-gfm`, sanitized via `rehype-sanitize` |
| Text-like        | mime starts with `text/`, plus a small allowlist of code/data extensions (`.json`, `.yaml`, `.yml`, `.toml`, `.go`, `.ts`, `.js`, `.py`, etc.) | `<pre>`-wrapped monospace, no highlighting                               |
| Image            | mime starts with `image/` and is one of png/jpg/jpeg/gif/webp/svg | `<img src="/raw/<path>">`                                                |
| Anything else    | fallthrough                                              | "Not previewable" placeholder + `<a href="/raw/<path>" download>` button |

**Markdown specifics.**

- *GFM* (tables, task lists, fenced code, autolinks).
- *Sanitization* on by default — even though source is local, the sanitizer prevents an unexpected `<script>` in a `.md` from running. `rehype-sanitize` with the default GFM-friendly schema is the chosen pipeline.
- *Relative image and link refs resolve to other files in the served root.* Implementation: a custom remark/rehype transform that rewrites:
  - `![](./diagram.png)` → `<img src="/raw/<currentDir>/diagram.png">`
  - `[link](other.md)` → `<a href="/view/<currentDir>/other.md">`
  - Absolute URLs (`http(s)://…`, `mailto:`, etc.) and root-relative paths (`/...`) pass through unchanged.

**Text-like specifics.**

- The server returns the file body as UTF-8 in `/api/file`. If the file is not valid UTF-8, the response includes a flag and the SPA degrades to the non-previewable placeholder (the user can still download via `/raw/`).
- Long lines wrap (CSS `white-space: pre-wrap`) — code stays mono, but a phone doesn't get a horizontal scrollbar.
- No syntax highlighting in v1.

**Inline render size cap.**

- The cap is **5 MiB** per file for the inline-render path (markdown and text-like). Above the cap, `/api/file` returns a "too large for inline preview" error and the SPA renders the non-previewable placeholder + download. Image files are not subject to the same cap — the browser handles image decoding directly via `<img>`.

### Path-traversal and symlink containment

This is the security boundary, even on loopback.

**Resolution rule (applied in the resolver before any read on `/api/*`, `/raw/*`, or `/view/*`):**

1. Take the requested path as a *relative* path under the served root (strip leading `/`).
2. `path.Clean` it. Reject any input that contains `..` segments after cleaning.
3. Join with the served root.
4. `filepath.EvalSymlinks` on the joined path.
5. Verify the resolved absolute path has the (also-eval-symlinks'd) served-root absolute path as a prefix (using a path-aware check, not a string prefix that would falsely match `/served-root-evil`). Reject otherwise.
6. Stat. Reject anything that isn't a regular file or directory.

**Symlinks within the root are allowed** (step 5 still passes). **Symlinks resolving outside the root are rejected.** This applies recursively — a directory listing also drops entries whose targets resolve outside the root.

**Errors are returned with specific reasons** so the UI can surface them: `not_found`, `permission_denied`, `outside_root`, `not_regular`, `too_large`. The SPA shows them inline in the viewer area.

**Rationale.** Loopback default reduces blast radius, but a user who passes `--host 0.0.0.0` is one keystroke away from exposing this on a LAN. The containment logic is identical regardless of bind address — defence in depth is cheap.

### MIME detection

1. Match the extension against a small lookup table for the formats we care about (markdown, text/code/data, common images).
2. Fall back to Go's `http.DetectContentType` (which sniffs the first 512 bytes) for unknowns.
3. The result is what `/raw/` sets `Content-Type` to and what `/api/file` returns in the `mime` field.

This dual approach means a `.md` with no shebang is classified as markdown (extension), and an extensionless text file still gets recognised as text (sniff).

### Layout: mobile-first, breakpoint to split on desktop

The SPA owns layout. It uses a single CSS breakpoint at `md` (768 px is the working number; tweakable) to switch shape:

- **Below `md`** (default): one view at a time. The browse view *is* the folder listing. The viewer view is the file viewer. Navigation between them is via taps in the listing and the browser back button. Touch targets ≥ 44 px. No hover-only affordances — every state visible by tap or focus.
- **At and above `md`**: split — tree sidebar on the left, viewer on the right. The tree behaves GitHub-style:
  - The **chevron** (▸/▾) toggles expand/collapse without navigating.
  - Clicking the **folder name** navigates to that folder's listing URL.

Breadcrumbs are present on every view; each segment is a clickable folder URL, which means deep-linking and copy-paste work on both layouts.

**Rationale.** The user is primarily on a phone. Two-column layouts on a 5–6 inch screen waste space and force horizontal scroll. The split is genuinely better on a desktop monitor — but it's the secondary shape, gated by media query.

### Theme

`prefers-color-scheme` drives the default. A toggle button in the top bar lets the user override (light / dark / system). The chosen mode is persisted in `localStorage` under a single key (e.g. `explorer.theme`). No flash-of-wrong-theme on load: the inlined boot script in `index.html` reads `localStorage` and sets a `data-theme` attribute on `<html>` *before* React hydrates. CSS uses CSS custom properties keyed off `[data-theme]`.

### Build pipeline and dev loop

**Production build (single binary, what `go build` ships):**

```
1. cd web && npm ci && npm run build      → web/dist/
2. (back to repo root) go build ./cmd/explorer
   ├── compiles Go server
   └── //go:embed web/dist embeds the SPA
```

A `Makefile` (or `go generate` with a small wrapper) wires step 1 to run before step 2 so `make build` is one command. The CI / Docker flow follows the same two steps.

**Dev loop:**

- *Frontend-only iteration:* `cd web && npm run dev` runs Vite at `http://localhost:5173`. Vite is configured to proxy `/api`, `/raw`, and `/view` (when the SPA isn't already handling routing) to a locally running Go binary on `:8080`. The developer runs both processes side by side.
- *Production-mode smoke test:* `make build && ./explorer ./testdata` brings up the embedded SPA at `:8080`.

The dev-vs-prod split lives entirely in Vite config and a `dev` flag on the Go side; runtime stays one binary in production.

### Docker

**`Dockerfile` (multi-stage):**

```
Stage 1 (node:LTS-alpine):
  copy web/, install deps, run `npm ci && npm run build`
  → /web/dist

Stage 2 (golang:LTS-alpine):
  copy go.mod / go.sum / source
  copy /web/dist from stage 1 into web/dist
  CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/explorer ./cmd/explorer

Stage 3 (gcr.io/distroless/static-debian12 OR scratch):
  copy /out/explorer from stage 2
  USER nonroot:nonroot
  ENTRYPOINT ["/explorer"]
```

Static binary, distroless final image, non-root. No shell in the final image.

**`docker-compose.yml` example (committed at repo root):**

```yaml
services:
  explorer:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - .:/data:ro                                  # bind-mount current dir as the served root
    command: ["/data", "--host", "0.0.0.0", "--port", "8080"]
```

**Critical compose gotcha (must be documented in README and as a comment in the compose file):** inside the container the binary's `--host` MUST be `0.0.0.0`, not the default `127.0.0.1`. With the default, the server listens on the container's loopback interface only, and the `8080:8080` port mapping cannot reach it — the user gets "connection refused" with no obvious reason.

### Graceful shutdown

The Go server uses `signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)`. On signal:

1. Stop accepting new connections.
2. `http.Server.Shutdown(ctx)` with a short timeout (5–10 s) to drain in-flight requests.
3. Exit 0.

This makes Ctrl+C in a terminal and `docker compose down` both clean.

### Startup banner

The CLI prints, on stdout, the bound URL(s) and a warning when the host is not loopback:

```
explorer serving /Users/anant/myproject
  → http://127.0.0.1:8080
```

```
explorer serving /Users/anant/myproject
  → http://0.0.0.0:8080   (also reachable on your LAN)
  ⚠ host is not loopback — anyone on this network can read these files.
```

The warning text is small but pointed. The user opted in; we're just confirming.

## Risks / Trade-offs

- **`embed.FS` couples React build into Go build.** → Mitigation: documented two-step build (`npm run build` → `go build`); Makefile target wires them together; CI runs both.
- **`rehype-sanitize` may strip something the user wanted.** → Mitigation: chosen schema is GFM-friendly; the only intentional removals are scripts and unknown attribute handlers. Documented in design; if a real use case surfaces, relax the schema, don't disable sanitization.
- **Lazy tree → still unbounded per folder.** A folder with 50k files in it returns 50k entries in one `/api/tree` call. → Mitigation: noted as planned follow-up (per-folder pagination). Acceptable for v1 because the typical browsing case is a project directory, not a media dump.
- **`http.DetectContentType` only sniffs the first 512 bytes.** → Mitigation: extension lookup runs first for known types; sniffing is fallback only.
- **Symlink resolution race.** A path could be a regular file at stat time and a symlink to outside-root at open time (TOCTOU). → Mitigation: `EvalSymlinks` immediately before opening; reject the request on mismatch; never open by un-resolved path. Acceptable residual risk for a local read-only tool.
- **5 MiB inline cap.** Some legitimate markdown notes can exceed this (rare). → Mitigation: documented in proposal; user can still download via `/raw/`. Cap is a constant, easy to revisit.
- **No file watcher means stale UI.** → Mitigation: refresh re-reads. File-watcher is on the planned follow-up list with explicit naming so it isn't forgotten.
- **Single port, single root per process.** → Mitigation: out of scope for v1; users who want two roots run two binaries on two ports.

## Migration Plan

Not applicable — green-field repo, no existing system to migrate from. First binary release is `v0.1.0` after this change is implemented and archived.

## Open Questions

- Exact CSS `md` breakpoint pixel value. 768 px is conventional; happy to tune once we look at the layout on real devices.
- Whether to ship a `Makefile` or rely solely on `go generate` + a tiny wrapper script. Both work; preference is a `Makefile` for discoverability. Decide during task 1 (repo skeleton).
- Final choice between `gcr.io/distroless/static-debian12` and `scratch` for the Docker final image. `distroless` is friendlier (CA certs, /etc/passwd for non-root) without meaningfully larger size; lean toward distroless. Decide during task 8.
