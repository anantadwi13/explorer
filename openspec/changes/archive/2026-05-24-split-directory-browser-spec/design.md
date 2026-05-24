## Context

The `directory-browser` capability holds 23 requirements across 942 lines of `openspec/specs/directory-browser/spec.md`. Three independent signals point at it being too large:

- **OpenSpec community norm**: OpenSpec's own dogfooded specs average 8–17 requirements / 250–500 lines per capability across 41 capabilities; conflux runs 61. Our `directory-browser` is roughly 2× the largest OpenSpec-internal spec.
- **Implicit cross-capability dependency**: `git-reader` already references the path-traversal rules, design tokens, error envelope, and keyboard shortcuts that live inside `directory-browser` — currently as prose references without explicit capability boundaries.
- **Past-proposal evidence**: 6 of the 9 substantive archived changes touched only one cluster within `directory-browser`, and 1 inherently-cross-cutting refactor (`restructure-file-api`) spanned three clusters. The monolith loads every reader the full 942 lines regardless of what's actually changing.

The project today has three capabilities: `directory-browser`, `git-reader`, `release-distribution`. Splitting `directory-browser` into four targeted capabilities (`cli`, `http-api`, `path-resolver`, `web-ui`) lands the project at six capabilities total — still well below the dozens observed in mature OpenSpec adopters.

## Goals / Non-Goals

**Goals:**

- Land every individual spec file in the 150–400-line range (inside the observed norm).
- Promote path-traversal containment to a named capability so `http-api` and `git-reader` can reference it explicitly instead of implicitly.
- Preserve every requirement verbatim — no requirement text, scenario text, normative SHALL/MUST language, or threshold (e.g., `inlineSizeCap = 5 MiB`, 768px breakpoint, `explorer.theme` localStorage key) is reworded or dropped.
- Update cross-references in dependent capabilities (`git-reader`, `release-distribution`) so they name the new capability that owns the referenced contract.
- Keep change-proposal blast radius low: 6 of 9 historical changes would still touch exactly one new capability after the split.

**Non-Goals:**

- Any source-code behavior change. No edits to `cmd/`, `internal/`, `web/`, `Makefile`, `Dockerfile`, or tests.
- Any change to the runtime CLI flags, HTTP endpoints, JSON shapes, SPA routes, or rendering rules.
- Renaming files under `internal/server/` or `web/src/` to match new capability names (out of scope; capability names are documentation concerns, not code layout).
- Splitting `web-ui` further into `web-ui-shell` and `web-ui-rendering`. The evidence shows shell and rendering move together in real proposals (`refresh-spa-design` touched both); splitting now would add blast radius without benefit. Revisit if `web-ui` outgrows ~500 lines.
- Adding hierarchical specs (the upstream OpenSpec project has an open issue #662 for this; until that lands we stay flat).
- Broader CLAUDE.md or README.md rewrites beyond the canonical-contract pointer and the `/api/file` typo. README.md does not currently mention the OpenSpec capability layout (verified with grep), so no change is needed there.

## Decisions

### Decision 1: Four capabilities, not three or six

**Chosen:** `cli`, `http-api`, `path-resolver`, `web-ui` (4 new capabilities; `directory-browser` dissolves).

**Alternatives considered:**

- *Three capabilities* (`browser-core`, `path-resolver`, `web-ui`) where `browser-core` bundles CLI + HTTP API. Rejected: CLI and HTTP API surfaces are unrelated (binary startup vs request handling) and OpenSpec's dogfood pattern is one user-visible surface per capability. Keeping them merged would leave one capability at ~400 lines on the upper end of the norm and obscure the boundary.
- *Six capabilities* (`cli`, `http-api`, `path-resolver`, `spa-shell`, `spa-rendering`, `mime`). Rejected: `mime` is a single requirement (~35 lines) and reads naturally as part of `http-api`. Splitting `spa-shell` from `spa-rendering` would have made the `refresh-spa-design` proposal a 2-spec change for no real benefit — they're co-evolved in practice.
- *Keep monolith, trim narrative*. Rejected: trimming gets ~942 → ~600 lines but doesn't fix the implicit cross-capability coupling problem, and `path-resolver` deserves its own first-class home regardless of line count.

**Rationale:** Four capabilities is the lowest count that (a) lands every file in the observed norm, (b) makes the security boundary explicit, and (c) keeps proposal blast radius low based on the historical evidence.

### Decision 2: Extract `path-resolver` as a first-class capability

**Chosen:** Path-traversal containment becomes its own capability with explicit references from `http-api` and `git-reader`.

**Alternative considered:** Leave it inside `http-api` (since the HTTP layer is its only direct caller today).

**Rationale:** Path-traversal containment is the security boundary of the entire product — both the CLAUDE.md and current spec call it out as such. It's the one cluster touched by exactly one historical change (low churn = low cross-reference maintenance cost). Promoting it lets `git-reader` say "uses `path-resolver`" explicitly instead of duplicating the contract in prose. This matches the OpenLore-pattern observation that the most-referenced cluster benefits from being a first-class capability.

### Decision 3: Cross-reference convention is plain prose + spec-relative path

**Chosen:** When one spec needs to reference another, use prose like:

> "Resolves request paths via the `path-resolver` capability (see `openspec/specs/path-resolver/spec.md`)."

OR, when referencing a specific requirement:

> "Errors follow the envelope defined in `http-api` § *Error envelope*."

**Alternative considered:** Markdown links like `[path-resolver](../path-resolver/spec.md#requirement-...)`.

**Rationale:** OpenSpec has no native cross-reference mechanism (confirmed by reviewing the upstream concepts.md and 41 dogfooded specs). Prose references survive section renaming and don't break OpenSpec's archive workflow. The spec-relative path makes them grep-able. Other OpenSpec adopters (conflux, OpenLore) use the same prose-reference convention.

### Decision 4: Capability names use plain domain words, no project prefix

**Chosen:** `cli`, `http-api`, `path-resolver`, `web-ui`.

**Alternatives considered:** `browser-cli` / `browser-api` / `browser-spa` (project-prefixed); `frontend` / `spa` / `viewer` (alternatives for `web-ui`).

**Rationale:** OpenSpec's own capabilities (`cli-init`, `workspace-foundation`, `artifact-graph`, `config-loading`) and conflux's (`server-api`, `tui-architecture`) don't restate the project name — the capability already lives under `openspec/specs/`, so prefixing is stutter. `web-ui` reads more clearly than `spa` for outsiders unfamiliar with the acronym, more accurately than `frontend` (which can imply a separate deploy unit), and less narrowly than `viewer` (which would imply only the file-preview surface).

### Decision 5: Use OpenSpec delta semantics — REMOVED on the old, ADDED on the new

**Chosen:** The change ships these delta files:

- `specs/directory-browser/spec.md`: `## REMOVED Requirements` block listing all 23 requirements. Each entry includes a `**Reason**:` and `**Migration**:` line pointing at the new capability that owns it.
- `specs/cli/spec.md`, `specs/http-api/spec.md`, `specs/path-resolver/spec.md`, `specs/web-ui/spec.md`: each contains a `## ADDED Requirements` block with the requirements verbatim from the old spec.
- `specs/git-reader/spec.md`: `## MODIFIED Requirements` block with the full updated text of any requirement whose cross-reference wording changes.
- `specs/release-distribution/spec.md`: `## MODIFIED Requirements` block updating the `--version` cross-reference.

**Alternative considered:** `## RENAMED Requirements` with FROM:/TO: pairs to express the move.

**Rationale:** Inspection of the OpenSpec schema and the 41 dogfooded specs shows `RENAMED Requirements` is for in-capability renames, not cross-capability moves. The REMOVED-on-old + ADDED-on-new pattern is the documented way to express a move across capability boundaries. The `**Migration**:` line on each REMOVED entry preserves the trail.

## Requirement → new-capability mapping

Every requirement in the current `directory-browser/spec.md` is preserved verbatim under exactly one new capability:

| # | Current requirement (in `directory-browser`)                  | New capability       |
|---|---------------------------------------------------------------|----------------------|
| 1 | CLI invocation and flags                                       | `cli`                |
| 2 | Graceful shutdown on signals                                   | `cli`                |
| 3 | Lazy folder listing API                                        | `http-api`           |
| 4 | File metadata API                                              | `http-api`           |
| 5 | Server-side MIME classification covers popular language exts   | `http-api`           |
| 6 | Raw file streaming endpoint                                    | `http-api`           |
| 7 | Error responses                                                | `http-api`           |
| 8 | Path-traversal containment                                     | `path-resolver`      |
| 9 | SPA folder URL renders folder listing                          | `web-ui`             |
| 10 | SPA file URL renders file viewer                              | `web-ui`             |
| 11 | Markdown rendering                                            | `web-ui`             |
| 12 | Text-like file rendering                                      | `web-ui`             |
| 13 | Image rendering                                               | `web-ui`             |
| 14 | Non-previewable file fallback                                 | `web-ui`             |
| 15 | Inline render size cap falls through to non-previewable        | `web-ui`             |
| 16 | SPA layout adapts to viewport                                 | `web-ui`             |
| 17 | Desktop tree behaves GitHub-style                              | `web-ui`             |
| 18 | Theme handling                                                | `web-ui`             |
| 19 | SPA design tokens                                             | `web-ui`             |
| 20 | Keyboard shortcuts for navigation and search                  | `web-ui`             |
| 21 | Deep-linkable folder and file URLs                            | `web-ui`             |
| 22 | Embedded SPA assets ship in the published module              | `cli`                |
| 23 | File reader wrap toggle                                       | `web-ui`             |

Resulting capability sizes (approximate, based on current line counts):

| Capability       | Requirements | Lines (approx) |
|------------------|--------------|----------------|
| `cli`            | 3            | ~155           |
| `http-api`       | 5            | ~190           |
| `path-resolver`  | 1            | ~25            |
| `web-ui`         | 14           | ~570           |

`web-ui` is on the high end of the norm but acceptable — the rendering requirements (markdown / text / image / fallback / size cap / wrap) form a cohesive unit. If it grows further, splitting `web-ui-rendering` out is a clean follow-up.

`path-resolver` is small (one requirement). That's fine: its value isn't size, it's making the security-boundary contract addressable by name from other capabilities.

## Risks / Trade-offs

- **[Risk] Cross-references in CLAUDE.md and README.md become stale.** → Mitigation: in `tasks.md`, include explicit follow-up tasks to scan for occurrences of `directory-browser` in `CLAUDE.md`, `README.md`, and `.claude/commands/opsx/`. Not blocking for spec sync, but should land in the same PR.
- **[Risk] `openspec validate` fails because the REMOVED block doesn't match the existing requirement headers exactly.** → Mitigation: when writing the REMOVED block, copy each `### Requirement: <name>` header verbatim from the current spec; run `openspec validate split-directory-browser-spec --strict` before considering specs done.
- **[Risk] An in-flight or future change proposal still names `directory-browser` in its `## Capabilities` block, causing archive conflicts.** → Mitigation: confirm no open changes exist before archiving this one (`openspec list --json`); document the rename in the archive commit message so future readers can grep history.
- **[Trade-off] Two of the nine historical changes (`syntax-highlighting`, `refresh-spa-design`) would have been multi-spec proposals under the new layout.** Accepted: the same two would also have been multi-spec under any reasonable split, and 7 of 9 single-spec changes more than compensate.
- **[Trade-off] `web-ui` has 14 requirements, above the norm's upper end of ~17 but visually denser than other specs.** Accepted: splitting it now would harm proposal cohesion; a later split is cheap because none of the 14 requirements cross-reference others within `web-ui` in load-bearing ways.

## Migration Plan

1. Land this change (spec deltas only).
2. After `opsx:sync` runs, manually verify:
   - `openspec/specs/directory-browser/` no longer exists.
   - The four new spec files exist with the expected requirement counts.
   - `openspec validate --strict` passes for every spec.
   - `grep -r "directory-browser" openspec/` returns only historical references inside `openspec/changes/archive/` (those are immutable and intentionally preserved).
3. Follow-up (not part of this change): update `CLAUDE.md` and `README.md` references to point at the new capabilities. This is intentionally deferred to keep this PR focused on the spec layout itself.

**Rollback:** if anything goes wrong, revert the merge commit. The four new spec files, the REMOVED-block on `directory-browser`, and the CLAUDE.md edit are the entire surface area; reverting restores the old layout exactly. No data, runtime, or external-system state depends on the spec names.

### CLAUDE.md edits (in-scope)

Two changes to the project-root `CLAUDE.md`:

1. **Canonical-contract pointer (line ~74)** currently says: *"Behavior contracts live in `openspec/specs/directory-browser/spec.md` (CLI flags, API shapes, path-traversal rules, SPA URL conventions, render rules)."* Replace with one sentence per new capability so a reader knows which spec owns which contract:
   - `cli` → CLI flags, startup banner, shutdown, embedded SPA assets
   - `http-api` → JSON/raw endpoints, MIME classification, error envelope
   - `path-resolver` → path-traversal containment (the security boundary)
   - `web-ui` → SPA routes, layout, theme, design tokens, shortcuts, file rendering
2. **`/api/file` → `/api/meta` (lines 42 and 49)** is a pre-existing doc bug surfaced by the spec-redistribution work. The endpoint is `GET /api/meta` (see `internal/server/routes.go:11` and `internal/server/server_test.go:122–308`). Both mentions get corrected.

Both edits are tiny, mechanical, and don't change the structure of CLAUDE.md.

## Open Questions

- *None blocking.* The mapping is unambiguous, the cross-references are enumerable, and no behavior changes.
- *Future:* if `path-resolver` grows (e.g., adding rate-limiting or per-user roots), should it absorb `error responses` from `http-api`? Defer until there's a concrete pressure to merge them.
