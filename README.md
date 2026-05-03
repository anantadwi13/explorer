# explorer

A lightweight, single-binary local directory browser. Point it at a directory, open a URL, read everything in place — primarily from a phone on the same LAN.

## What it does

- Serves any local directory over HTTP as a read-only browser
- Embedded React SPA with markdown rendering (GFM), syntax-free text viewer, inline images, and a download button for anything else
- Mobile-first responsive layout; desktop shows a persistent tree sidebar
- Deep-linkable URLs for every folder and file
- Light / dark / system theme toggle
- Single static binary — no runtime dependencies

## Build

Requires Go 1.21+ and Node 18+.

```bash
make build       # builds ./explorer
```

This runs `cd web && npm ci && npm run build` first, then embeds the SPA into the Go binary.

## Usage

```bash
explorer <dir> [--port PORT] [--host HOST]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `8080` | TCP port to listen on |
| `--host` | `127.0.0.1` | Address to bind to |

### Examples

```bash
# Serve current directory on default loopback port
explorer .

# Serve /home/alice/docs on port 9000
explorer /home/alice/docs --port 9000

# Expose on all interfaces (LAN-accessible)
explorer . --host 0.0.0.0
```

When `--host` is not a loopback address, the startup banner prints a warning:

```
explorer serving /home/alice/docs
  → http://0.0.0.0:8080   (also reachable on your LAN)
  ⚠ host is not loopback — anyone on this network can read these files.
```

## Docker / Compose

Build and run with Docker Compose:

```bash
docker compose up --build
```

Then open `http://localhost:8080` in a browser.

The `docker-compose.yml` bind-mounts the current directory into `/data` (read-only) and runs:

```
explorer /data --host 0.0.0.0 --port 8080
```

**Important**: `--host 0.0.0.0` is required inside the container. With the default `127.0.0.1`, the server listens only on the container's loopback interface and Docker's port mapping cannot reach it.

## Development

```bash
# Backend only (no SPA)
make dev-server       # builds and runs against testdata/

# Frontend hot-reload (requires backend running on :8080)
make dev-web          # starts Vite dev server on :5173

# Run Go tests
make test

# Clean build artifacts
make clean
```

## Out-of-scope (v1)

These are intentionally deferred:

- File watcher / live reload
- Search across files
- Syntax highlighting for code
- README auto-render in folder listings
- Tree pagination per folder
- Authentication / multi-user
- Write / update / delete
- PDF, Office, video, audio preview

## Troubleshooting

**"connection refused" on port 8080 in Docker**

Make sure the `command` in `docker-compose.yml` includes `--host 0.0.0.0`. The default loopback bind is not reachable through Docker's port mapping.

**Binary shows "SPA not yet embedded" or 501 errors**

Run `make build` (not just `go build`) to ensure the frontend is built and embedded.

**Symlink file is missing from listing**

Symlinks whose targets resolve outside the served root are silently omitted from directory listings and return a `400 outside_root` error when accessed directly — this is intentional path-traversal containment.
