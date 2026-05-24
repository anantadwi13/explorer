## Why

`explorer` today is a read-only filesystem browser. When the served root happens to be a git repository, the most natural questions a user wants to answer — *what changed recently, what's on this branch, what am I about to commit?* — can only be answered by leaving the tool and dropping into a terminal. Adding a small read-only git surface (commit history, branch/tag picker, per-commit diff, working-tree status) makes `explorer` useful for the way developers actually browse a project, without compromising its single-binary, no-CLI-dependency posture.

## What Changes

- New HTTP API surface under `/api/git/*` (info, refs, commits, commit detail, status, patch) — all read-only, all JSON, all typed errors.
- New SPA routes (`/git/commits`, `/git/commits/<sha>`, `/git/status`) and toolbar/drawer affordances (branch pill + changes badge) that render **only** when the served root is a git repository.
- Lazy paging at two levels for diffs: files within a commit (offset-based) and hunks within a file (offset-based). Commit history paginates cursor-based by sha.
- New typed error kinds: `not_a_repo`, `unknown_ref`. TS `ApiError` union mirrors.
- New Go dependency: `github.com/go-git/go-git/v5`. **BREAKING for the "stdlib only" convention** — CLAUDE.md carve-out required.
- New test fixture: a small generated git repo under `testdata/sample-repo/` for manual and automated testing.
- Gate behaviour: a `.git` entry (directory **or** worktree pointer file) must exist at the served root itself; ancestor `.git` directories are **not** walked. With no `.git`, all `/api/git/*` endpoints return `not_a_repo` and the SPA hides every git affordance — no impact on existing non-repo use.

## Capabilities

### New Capabilities
- `git-reader`: Read-only browsing of the git repository at the served root — branches, tags, commit history, per-commit diffs, and working-tree status (staged, unstaged, untracked) — over the same HTTP+SPA shape that directory-browser uses.

### Modified Capabilities
- `directory-browser`: the existing "Keyboard shortcuts for navigation and search" requirement is scoped to directory-browser routes (`/`, `/view/*`) so it doesn't conflict with the new git-reader keyboard rules on `/git/*`. The "inert when typing in an input/textarea/content-editable" rule remains shared across both capabilities. No other behaviour changes.

<!-- The git-reader spec declares its own additions to the typed-error union (not_a_repo, unknown_ref) and explicitly references — but does not modify — the existing /raw/ "no query-param behaviour" rule as a non-goal boundary. -->

## Impact

- **Code**: new `internal/server/git/` package wrapping go-git; new handlers wired into `internal/server/routes.go`; new SPA pages under `web/src/pages/git/` plus components for diff rendering, branch picker, and changes badge.
- **API**: 6 new endpoints under `/api/git/*` (exact-match). No change to `/api/tree`, `/api/meta`, `/raw/`, `/view/*`. The `/raw/` "SHALL NOT inspect query parameters" rule is preserved as a non-goal boundary in the new spec.
- **Dependencies**: adds `github.com/go-git/go-git/v5` (Go module). Binary size grows ~3–4 MiB. No new build-tool dependencies. The CLAUDE.md "stdlib only" convention gets an explicit, documented exception for this capability.
- **SPA**: new routes, new toolbar pills (desktop) / drawer entries (mobile, option C). New typed-error cases in the TS `ApiError` union. Existing routing, theming, density, and keyboard shortcuts are extended (not replaced) — `/`, `Escape`, `Backspace` behavior is pinned for git pages so it stays consistent.
- **Security**: `/api/git/*` does NOT route through `resolver.Resolve`. The `path` parameter on git endpoints is repo-relative (a key into the git object DB), not a filesystem path; escape is prevented by go-git's pathspec rules. Spec must declare this clearly so the existing path-resolver chokepoint invariant remains legible.
- **Operations**: read-only stance preserved. No write operations of any kind (no checkout, commit, stage, fetch, push, …). No caching in v1; every request invokes go-git fresh.
- **Testing & dev workflow**: `make sample-repo` generates a fixture repo; a `make dev-git-server` (or equivalent extension to `make dev-server`) lets manual testing target the fixture. Fixture is gitignored (regenerated locally) to avoid committing nested `.git/` noise.
- **Out of scope for v1**: submodules, stash, blame, log search, ref compare, tags-as-route, "view file at commit", caching, any write operation.
