# Capability: Path Resolver

## Purpose

The security boundary of the explorer binary. Every endpoint that accepts a filesystem path routes through this capability before opening or reading any file, ensuring that requests cannot escape the served root via `..`, absolute paths, or symlinks that resolve outside the root. Other capabilities (`http-api`, `git-reader`) reference this contract by name rather than re-stating the rules.
## Requirements
### Requirement: Path-traversal containment

Endpoints under this explorer SHALL guarantee containment via one of two modes depending on the request shape:

**Mode A — Working-tree (filesystem) containment.** Every endpoint that accepts a path and serves working-tree bytes (`/view`, `/raw` without `ref`, `/api/tree`, `/api/meta` without `ref`, and the working-tree overlay branch of `/api/git/blame`) SHALL reject any request whose resolved absolute path is not contained within the served root's absolute path. Symlinks SHALL be followed only as long as the resolved target remains within the served root. This mode is implemented by `resolver.Resolve` (clean the input, reject `..` / absolute paths, join to root, `filepath.EvalSymlinks`, prefix-check).

**Mode B — Git-tree (structural) containment.** Endpoints that accept a `ref` parameter and serve commit-pinned bytes (`/raw?ref=<sha>`, `/api/meta?ref=<sha>`, and `/api/git/blame?ref=<sha>` when `ref` is an explicit historical ref) SHALL look the path up directly in the named commit's git tree via the `lookupBlobInTree` helper rather than touching the filesystem. The tree-object lookup is naturally bounded: `..` is not a valid git tree component (git rejects it at commit time), symlinks are stored as blobs with mode `120000` and SHALL be returned as blob bytes rather than followed, and a path not present in the tree returns `not_found`.

A single request SHALL be served by exactly one of the two modes. The handler SHALL choose the mode before any filesystem call, based on whether `ref` is present in the query string. Mixing the modes within one request (e.g. resolving via the filesystem and then looking up in the tree) is NOT permitted.

The two modes SHALL produce distinguishable error envelopes for security-relevant failures: Mode A returns `outside_root` for escapes via `..` or symlinks; Mode B has no `outside_root` equivalent because escapes are structurally impossible and instead returns `not_found` for any non-tree path.

#### Scenario: Dot-dot escape attempt (working tree)

- **WHEN** a request arrives at `/api/meta?path=../../../etc/passwd` or `/raw/../../../etc/passwd` with no `ref`
- **THEN** the response is a typed `outside_root` error (HTTP 400)
- **AND** no file outside the served root is opened or read

#### Scenario: Symlink to outside root (working tree)

- **WHEN** a file `link.txt` under the served root is a symlink whose target resolves outside the root
- **AND** a request arrives for `/api/meta?path=link.txt` or `/raw/link.txt` with no `ref`
- **THEN** the response is a typed `outside_root` error
- **AND** the file is not read

#### Scenario: Symlink within root (working tree)

- **WHEN** a file `shortcut.md` under the served root is a symlink to another file also under the served root
- **AND** a request arrives for `/api/meta?path=shortcut.md` with no `ref`
- **THEN** the response is metadata for the target file (size, mtime, mime, kind)

#### Scenario: Dot-dot in ref-scoped path (git-tree mode)

- **WHEN** a request arrives at `/api/meta?path=../etc/passwd&ref=<sha>` or `/raw/../etc/passwd?ref=<sha>`
- **THEN** the response is a typed `not_found` error (HTTP 404) — no such entry in the commit's tree
- **AND** the response is NOT `outside_root`
- **AND** no filesystem read occurs

#### Scenario: Git-tree symlink entry is not followed

- **WHEN** a request arrives at `/raw/link.txt?ref=<sha>`
- **AND** `link.txt` is stored in the tree as a symlink entry (mode `120000`)
- **THEN** the response streams the symlink's stored content (the link target string) as a blob
- **AND** no filesystem dereference of the symlink target is attempted

#### Scenario: Handler picks containment mode before filesystem access

- **WHEN** the handler for `/raw/<path>` receives a request
- **THEN** it inspects `ref` exactly once and dispatches to the working-tree branch (Mode A) or the git-tree branch (Mode B) before any filesystem call
- **AND** the two branches do not share filesystem-touching code

