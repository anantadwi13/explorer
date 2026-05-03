## Why

`explorer` is being published to a public GitHub repository (`github.com/anantadwi13/explorer`). The current README is functional but written for someone who already has the repo cloned, assumes Node is available, lists a stale Go version (1.21+ vs. the actual 1.24.4), and offers no path for users who only have a Go toolchain. A first-time visitor landing on the GitHub page needs a clearer pitch, a one-line install, and confidence that the project is real (license, screenshots, contribution path).

## What Changes

- Rewrite `README.md` for a public audience: short hero/pitch, screenshot placeholder, installation matrix, quick-start, feature list, configuration reference, development workflow, contributing, license.
- Add a `go install` / `go run` install path for users with a Go toolchain and no Node:
  - `go install github.com/anantadwi13/explorer/cmd/explorer@latest`
  - `go run github.com/anantadwi13/explorer/cmd/explorer@latest <dir>`
- Commit the built SPA (`internal/server/ui/dist/`) to source control so `go install`/`go run` from the module path produces a fully functional binary (the embed currently falls back to a 501 if `dist/` is empty).
- Update `.gitignore` to stop ignoring `internal/server/ui/dist/`; add a `Makefile` target / pre-commit guidance for regenerating the embedded dist when SPA sources change.
- Add a top-level `LICENSE` file (MIT, matching common Go OSS practice — confirm during apply).
- Fix README's stated Go version (`1.21+` → `1.24+`) and Node version sanity-check.
- Add badges (Go version, license, build status if a workflow is added later) and a small "Why explorer?" section framing the use case (read files on a phone over LAN).
- Document the security model briefly in the README (path-traversal containment, read-only, loopback default), so visitors understand the threat model before exposing on `0.0.0.0`.

## Capabilities

### New Capabilities
<!-- None — this change does not introduce new runtime behavior. -->

### Modified Capabilities
- `directory-browser`: extend the **CLI invocation and flags** requirement so the contract recognizes the `go install` / `go run` invocation paths in addition to the compiled `./explorer` binary, and add a new requirement that the compiled SPA assets are present in the binary (committed to the repo) so module-path installs produce a working server.

## Impact

- **Docs**: `README.md` rewritten end-to-end. New `LICENSE` file at repo root.
- **Repo state**: `internal/server/ui/dist/` becomes a tracked directory (~hundreds of KB of generated JS/CSS/HTML). PR diffs touching the SPA will include regenerated dist files.
- **Build / dev workflow**: `make build` behavior unchanged. New guidance: regenerate and commit `dist/` before merging SPA changes (consider a `make web-commit` helper or a pre-commit hook). A future CI workflow could verify `dist/` is in sync with sources.
- **Module consumers**: `go install github.com/anantadwi13/explorer/cmd/explorer@latest` becomes a supported install path. `go.mod` already declares the correct module path; no code changes needed in `cmd/explorer` or `internal/server/ui`.
- **Spec**: minor delta to `directory-browser` capability covering install methods and the embed-asset contract. No HTTP/JSON behavior changes.
