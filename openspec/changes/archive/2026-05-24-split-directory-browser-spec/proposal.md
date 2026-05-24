## Why

`openspec/specs/directory-browser/spec.md` has grown to 942 lines and 23 requirements — roughly 2× the largest spec in OpenSpec's own dogfooded specs (8–17 requirements / 250–500 lines is the observed comfort zone). The monolith forces every reader (human or assistant) to load the whole file even when working on a single area, and obscures that `path-traversal containment` is a security boundary other capabilities (`git-reader`) already rely on implicitly. Past change proposals back this up: 6 of the 9 substantive archived changes touched only one cluster within `directory-browser`, so a finer split lowers context cost without raising proposal blast radius.

## What Changes

- **BREAKING (spec layout only, no runtime behavior change):** dissolve the `directory-browser` capability and redistribute its 23 requirements across four new, focused capabilities — `cli`, `http-api`, `path-resolver`, `web-ui`.
- Promote path-traversal containment to its own `path-resolver` capability so other capabilities can reference it explicitly instead of implicitly.
- Update cross-references in `git-reader` and `release-distribution` that currently point at `directory-browser` to point at the appropriate new capability.
- Refresh `openspec/config.yaml` context block so its narrative still matches the new capability layout.
- Update `CLAUDE.md` so the "canonical contract" pointer names the four new specs instead of the dissolved `directory-browser/spec.md`, and **fix a pre-existing doc bug** while we're in there: two CLAUDE.md mentions of `GET /api/file` are stale — the actual endpoint is `GET /api/meta` (confirmed by `internal/server/routes.go` and the server tests). Both lines get corrected.
- No source-code, API, CLI, or SPA behavior changes. No file renames in `internal/` or `web/`. The touched files are `openspec/specs/**`, `openspec/config.yaml`, and `CLAUDE.md`.

## Capabilities

### New Capabilities
- `cli`: Binary invocation surface — flag parsing (`--port`, `--host`, `--version`/`-v`), positional `<dir>` ordering, playground banner, non-loopback warning, `--help` footer, graceful shutdown on SIGINT/SIGTERM, and the embedded SPA assets contract that lets `go install` produce a working binary without Node.
- `http-api`: JSON and raw HTTP endpoints — `GET /api/tree`, `GET /api/meta`, `GET /raw/*`, server-side MIME classification (extension-first table plus `http.DetectContentType` fallback), the typed `{error, message}` error envelope, and the `inlineSizeCap` semantics. References `path-resolver` for path validation.
- `path-resolver`: Security boundary — path cleaning, rejection of `..` / absolute / out-of-root inputs, `filepath.EvalSymlinks` containment check, the typed `outside_root` / `not_found` / `permission_denied` / `not_regular` error kinds, and the rule that out-of-root symlinks are silently dropped from listings. Referenced by `http-api` and `git-reader`.
- `web-ui`: All SPA surfaces — `/view/*` folder vs file URL convention, deep-linkable URLs, responsive layout (split ≥768px, single-pane below), desktop tree behavior, theme handling, design tokens, keyboard shortcuts, markdown rendering pipeline (relative-link rewrite → `rehype-highlight` → `rehype-sanitize`), text rendering (`CodeBlock` + `extToLanguage`), image rendering, non-previewable fallback, and the wrap toggle.

### Modified Capabilities
- `git-reader`: Update cross-references that today say "directory-browser" to point at the appropriate new capability — design-tokens reference → `web-ui`; keyboard-shortcuts reference → `web-ui`; error-envelope reference → `http-api`; path-resolver reference (currently implicit) → `path-resolver` (now explicit).
- `release-distribution`: Update the `--version` line cross-reference from "directory-browser CLI invocation requirement" to `cli`.

### Removed Capabilities
- `directory-browser`: All 23 requirements are redistributed across the four new capabilities listed above. The capability directory `openspec/specs/directory-browser/` is removed after sync. Every requirement currently in `directory-browser` is preserved verbatim somewhere; see `design.md` for the requirement → new-capability mapping table.

## Impact

- **Affected files:** `openspec/specs/directory-browser/spec.md` (deleted), `openspec/specs/cli/spec.md` (new), `openspec/specs/http-api/spec.md` (new), `openspec/specs/path-resolver/spec.md` (new), `openspec/specs/web-ui/spec.md` (new), `openspec/specs/git-reader/spec.md` (cross-ref updates), `openspec/specs/release-distribution/spec.md` (cross-ref updates), `openspec/config.yaml` (context narrative refresh), `CLAUDE.md` (canonical-contract pointer + `/api/file` → `/api/meta` typo fix).
- **Source code:** none. No `.go`, `.ts`, `.tsx`, `.css`, `Makefile`, or `Dockerfile` changes.
- **In-flight proposals:** any open change proposal that still names `directory-browser` in its `## Capabilities` block will need its delta filename and capability reference re-pointed before merge. None are currently open.
- **External readers:** anyone (including `opsx:*` skills) that hard-codes the string `directory-browser` will need to update. CLAUDE.md is updated in this change; README.md does not currently reference the spec layout (verified).
- **Risk:** low. This is a pure documentation restructure plus a small doc typo fix. Behavior contracts are preserved verbatim. Worst case is a missed cross-reference, which `openspec validate` and `opsx:verify` should surface.
