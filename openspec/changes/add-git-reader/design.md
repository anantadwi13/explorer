## Context

`explorer` today is a static-binary directory browser with three HTTP surfaces (`/api/tree`, `/api/meta`, `/raw/*`) and a React SPA served from `embed.FS`. Filesystem access is gated through `internal/server/resolver` — every endpoint that touches the FS resolves the request path against the served root, rejecting `..` traversal and out-of-root symlinks. The codebase keeps a hard "stdlib only" rule on the Go side; the SPA owns all the heavy rendering libraries.

This change introduces a *second* read surface — git — alongside the existing filesystem surface. Both surfaces share the same served root, but git operates over a different data model (commits, refs, objects) and is gated by an additional precondition: the served root must contain a `.git` (directory or worktree pointer file) at its **top level**.

The implementation has three obvious tensions to resolve:

1. **CLI shell-out vs. embedded library.** The earlier "stdlib only" invariant suggests shelling out. But shelling out means the binary now silently depends on `git` being on PATH and on a particular CLI version; output parsing is fiddly even with `-z` plumbing; and we'd have to gate the feature on `exec.LookPath("git")`, which mixes host-environment state into a feature-availability check that should really be about *repo* state.
2. **Filesystem resolver vs. git pathspec.** The resolver chokepoint is the directory-browser security invariant. Git endpoints take repo-relative paths into the git object tree, not into the filesystem — these are different things and using the resolver on them would be semantically wrong.
3. **Diff size.** A real-world commit can produce gigabytes of patch text (regenerated lockfiles, vendored deps). The existing `inlineSizeCap = 5 MiB` posture is one approach; pagination is another. We chose pagination, and we need to define it precisely at two levels (files within a commit, hunks within a file).

The spec captures behaviour; this document captures *why we made these choices and not other plausible ones*.

## Goals / Non-Goals

**Goals:**
- Read-only git browsing — commit history, refs (branches + tags), per-commit diff, working-tree status — that feels familiar to anyone who has used GitHub's commit views.
- Lazy paging so large commits and large repos don't ship megabytes of JSON to the browser.
- Strict scope gate: the feature exists only when the served root is itself the git working-tree root. No ancestor walking, no inferred git context.
- Zero impact on non-repo use: when the gate is false, the entire git surface disappears (no toolbar pills, no routes, no broken affordances).
- Single-binary distribution preserved: still one `go build`, still embeds the SPA, still no runtime dependency on `git` CLI.

**Non-Goals:**
- Any write operation (`checkout`, `commit`, `stage`, `fetch`, `push`, `merge`, `rebase`, …). The feature is read-only.
- Submodules (treated as plain directories by the existing directory-browser; no nested git context).
- Stash, blame, log search, ref-to-ref compare (`main...feature`), per-file commit history.
- Tags as a routed view. Tags appear in the refs dropdown only.
- "View file content at a specific commit" — does NOT extend `/raw/` and is not a new endpoint in v1. If added later, it goes through a new `/api/git/blob` endpoint.
- Caching. Every request invokes go-git fresh.
- Multi-repo browsing, or browsing a subdirectory of a repo as if it were a repo root.

## Decisions

### Decision 1: Use `github.com/go-git/go-git/v5`, not the `git` CLI

**Choice:** Embed go-git. No `exec.Command("git", …)` anywhere in the codebase.

**Alternatives considered:**

| Option | Pro | Con |
|---|---|---|
| Shell out to `git` CLI | Zero new Go deps; matches the existing "stdlib only" rule; ubiquitous, well-tested git semantics | Hard runtime dep on `git` binary; binary version skew is invisible; feature-availability gate now depends on host environment (`exec.LookPath`), conflating "is this a repo?" with "is git installed?"; output parsing is annoying (even with `-z`); spawning a process per request is the heaviest path |
| go-git (chosen) | Pure Go, self-contained; gate is purely "does `.git` exist at root?"; idiomatic Go API; no version-skew surface; works the same on every host | Breaks the "stdlib only" CLAUDE.md rule; binary grows ~3–4 MiB; go-git has some edge cases (partial clones, LFS pointers) that are spotty — but none affect the four v1 features |
| Both, with CLI as fallback | Maximum coverage | Doubles the surface area and the test matrix for negligible benefit |

**Rationale:** The "stdlib only" rule is a *convention*, not an architectural invariant — it was right when `explorer` only touched the filesystem (stdlib has everything you need), but git is a different beast and reinventing it in stdlib is not on the table. go-git is mature, single-package, MIT-licensed, and covers all four required features (`repo.Branches`, `repo.Log`, `commit.Patch`, `worktree.Status`). The CLAUDE.md "stdlib only" line gets an explicit, documented exception for this capability — it remains the rule everywhere else.

### Decision 2: Gate on `.git` at the served root, not via ancestor walking

**Choice:** A `.git` entry (directory or worktree pointer file) must exist at the served root itself. We do not walk up the directory tree looking for one.

**Alternatives considered:**

- **Walk ancestors (go-git's `DetectDotGit: true`).** Convenient — point `explorer` at `repo/cmd/explorer/` and the tool still gives you the repo's history. But this means: (a) "what is the repo?" depends on the parent chain, which violates `explorer`'s "the served root is the source of truth" mental model; (b) commit history would surface files outside the served root, which is confusing and a soft-leak of names; (c) the user explicitly rejected this during exploration.

**Rationale:** Keeping the gate strict makes the security and UX story clean. The user explicitly asked for it. We re-evaluate if there's actual demand later.

### Decision 3: `/api/git/*` does NOT route through `resolver.Resolve`

**Choice:** The path-traversal resolver is bypassed for git endpoints. Path inputs to git endpoints are repo-relative paths into the git object tree, not filesystem paths.

**Alternatives considered:**

- **Run paths through the resolver anyway.** Wrong: the resolver maps to the *working tree*, but git operations can ask about files that don't currently exist there (e.g., a file deleted in HEAD vs. one that existed in an old commit). Requiring the path to resolve to a current FS entry would break legitimate queries.
- **Build a parallel "git path resolver".** Over-engineered. go-git's tree lookup is the resolver — `tree.File(path)` returns nil for any path not present in that tree's object graph, and pathspec rules forbid `..`/absolute paths at the API level.

**Rationale:** The existing resolver is a *filesystem* security boundary. Git operates over the object database; the analogous boundary there is git's own pathspec rules, which already forbid escape. The spec must state this explicitly so the bypass doesn't look like a security hole — *the chokepoint exists, but it lives inside go-git, not in our code*.

We additionally validate inputs at the HTTP layer: `sha=` must match `[0-9a-f]{4,64}` (the user's quote in `/api/git/commit?sha=` is never interpolated into a CLI), and `ref=` is checked against git's ref-name rules. Path inputs are passed to go-git unchanged; go-git does the rest.

### Decision 4: Two-level lazy paging for diffs

**Choice:**
- Files within a commit: offset-based pagination (`?file_offset=&file_limit=50`). The commit endpoint returns file headers only — no patch bodies.
- Hunks within a file: offset-based pagination via a separate `/api/git/patch` endpoint (`?hunk_offset=&hunk_limit=3`).
- Commits within a branch: cursor-based pagination (`?cursor=<sha>&limit=30`).

**Alternatives considered:**

| Option | Why rejected |
|---|---|
| Single-shot full diff | Pathological commits (regenerated lockfiles) ship megabytes; browser tab freezes |
| Single-level paging (files only, full patches per file) | A single huge file (200k-line generated SQL) still blows up |
| Offset for commits too | The commit DAG has no stable index; offset-based commit log is `O(skip+limit)` in go-git and surprisingly slow on deep skips |
| Cursor for files/hunks too | The file list within a commit is a fixed-size ordered slice; cursor adds complexity with no benefit |
| Pagination + caching of generated patches | Add complexity; defer to a future change if profiling shows it's needed |

**Rationale for asymmetry:** The asymmetry is principled — commits are an unbounded DAG without stable index, files/hunks are fixed-size ordered lists. We declare the asymmetry in the spec so it doesn't look accidental and so a future contributor doesn't "normalize" it incorrectly.

**One defensive bound stays:** a single response from `/api/git/patch` will never exceed ~512 KiB of patch text. If the requested hunk batch would exceed it, the server returns fewer hunks (never breaking mid-hunk) and sets `more_available: true`. Worst case: one gigantic hunk crossing the cap is returned alone; the next page picks up after it.

### Decision 5: SPA discovery surface — desktop pills, mobile drawer (option C)

**Choice:** On desktop (≥800px), add two pills to the main toolbar: `[branch: <ref> ▾]` and `[● N changes]`. On mobile (<800px), neither pill renders in the top bar; they live in the sidebar drawer's header so the cramped mobile toolbar stays as it is today.

**Alternatives considered:**

- **Mobile pills in the top bar.** Too cramped — brand, menu, theme, branch, badge all in one row at 320px viewports is unreadable.
- **Pills hidden on mobile entirely.** Users on phones would have no entry into git features at all. Discoverability matters.
- **Branch pill replaces brand on mobile.** Confusing — brand is the home affordance.
- **A bottom-tab bar.** Would touch a lot of existing layout for one feature.

**Rationale:** Option C reuses the drawer pattern that's already established for navigation overflow on mobile. Branch pill + changes badge live in the drawer header, above the tree. This requires no top-bar changes on mobile at all — minimal disruption to the existing mobile layout.

When the served root is not a repo, neither pill renders, the drawer header degrades to just the brand, and the `/git/*` routes resolve to a "not a git repository" placeholder. Existing users see exactly no change.

### Decision 6: Diff rendering — unified format, with syntax highlighting layered on diff backgrounds

**Choice:** Unified diff format. Per-file collapsible cards. `+`/`−` line backgrounds in light-green / light-red. Source text inside each line is tokenised with the same `lowlight` instance the file viewer uses; the `+`/`−`/space marker stays a sibling span so its colour is governed by the diff palette, not by the language grammar.

**Alternatives considered:**

- **Side-by-side diff.** More readable for big changes but harder on narrow viewports; doubles the rendering surface; deferred to a future change if requested.
- **Plain monospace, no tokenisation (original v1 plan).** Simpler, but loses the at-a-glance scan that comes with hljs colours. Per-line highlighting is an approximation (multi-line constructs re-tokenise on each line), but it matches what widely-used diff viewers do and is good enough to ship.
- **Highlighting the whole file then projecting onto diff lines.** Would be more correct for multi-line tokens but requires fetching the full file content (or doing a much bigger server-side change), which we don't want to pay for in v1.

**Rationale:** The infra cost is small — the SPA already has the `lowlight` instance, the grammar registry, and the `extToLanguage` helper. The marker-outside-span discipline keeps the +/− colours intact and the implementation simple. The acknowledged approximation (per-line tokenisation losing some multi-line context) is consistent with comparable tools.

### Decision 7: Test fixture as a gitignored, generated repo

**Choice:** Add `testdata/sample-repo/` to `.gitignore` and provide `make sample-repo` that creates it on demand (3 commits on `main`, one secondary branch `feature/x`, one tag `v0.1.0`, one staged file, one unstaged modification, one untracked file).

**Alternatives considered:**

- **Commit a real `.git/` under `testdata/`.** Nested git directories inside a checked-in working tree create endless tooling confusion (IDEs walking up, `git status` getting confused, `go install` embedding objects). Avoid.
- **Use the explorer's own `.git/`.** Couples tests to the repo's evolving state — flaky and unfit for assertions.
- **Pure in-memory go-git fixtures.** Possible (go-git supports memory storage), but the integration tests want to exercise the same `PlainOpen` path real users hit. A real on-disk fixture is more faithful.

**Rationale:** Gitignored + script-generated keeps the working tree clean, lets each test guarantee a fresh repo state, and exercises the same code path production uses.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **go-git memory usage on huge commits.** `commit.Patch(parent)` computes diffs for *all* files in one pass. A commit touching 20k files is going to consume real memory on the server before pagination kicks in at the response layer. | Acceptable for the playground-tool posture. If it bites, we can switch to per-file diffs via `object.NewPatch(from, to)` selecting only the requested file page. No spec impact. |
| **`.git` is a *file* (worktree pointer) is easy to forget.** | go-git's `PlainOpen` handles both; the spec calls this out as a first-class case; an explicit scenario covers it. |
| **Detached HEAD / empty repo crash the branch picker if naive.** | Both are spec'd as first-class states with explicit scenarios. `head_ref` and `head_sha` are nullable in `/api/git/info`; the `detached` boolean disambiguates. |
| **Repo state changes outside `explorer` (user runs `git commit` in a terminal) won't reflect until refresh.** | Documented limitation. No caching, so a page reload picks up the new state. Live updates (SSE, polling) are not v1. |
| **Branch names with slashes (`feature/x/y`) break naïve URL handling.** | Spec mandates query-param encoding (`?ref=feature%2Fx%2Fy`); branch names are never URL path segments in any of our routes. |
| **Binary detection is heuristic.** go-git's `IsBinary()` uses a NUL-byte heuristic. A few text files with embedded NULs will be misclassified. | Acceptable; render as "binary file changed" with byte deltas. Users can always check the working tree directly. |
| **Conflicted-merge state in the working tree.** Could surprise `status` lookups. | Spec'd as a non-goal but with a "server SHALL NOT crash" backstop — conflicted entries may be omitted or surfaced in their own bucket, either is acceptable for v1. |
| **CLAUDE.md "stdlib only" rule and the new dep.** | Update CLAUDE.md as part of this change. The new rule reads: *stdlib only, with the documented exception of `github.com/go-git/go-git/v5` used by the git-reader capability*. |
| **Binary size increase (~3–4 MiB).** | Acceptable for a local playground tool; documented in the proposal's Impact section. |
| **The `/raw/` endpoint's "SHALL NOT inspect query parameters" rule could tempt a future contributor to add `?ref=`.** | The new git-reader spec explicitly declares `/raw/?ref=` as a non-goal and re-states that any "file content at commit" feature must be a new endpoint, not an extension of `/raw/`. |

## Migration Plan

This is an additive change with no breaking impact for users who don't have a `.git` at their served root. For users who do:

- **Rollout:** ships in the next release cut. No flag, no opt-in — the feature appears automatically when `.git` is detected at the served root.
- **Rollback:** trivial. The feature is gated by `.git` detection; rolling back to a prior binary simply removes the surface, no data migration involved.
- **Documentation:** README gets a short "git browsing" section pointing at the relevant screenshots. CLAUDE.md is updated for the go-git exception.

## Open Questions

None remaining. All scope and design questions were locked during exploration. Decisions to revisit only if usage signal demands:
- Per-file commit history (`/api/git/commits?path=…`).
- Tags as a first-class route (currently only in the refs dropdown).
- Switching to per-file diffs for memory efficiency on huge commits.
- Live updates (SSE) when the repo state changes outside `explorer`.
