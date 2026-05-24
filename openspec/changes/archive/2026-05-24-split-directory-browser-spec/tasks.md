## 1. Pre-flight checks

- [x] 1.1 Confirm no other open changes still reference `directory-browser` in their `## Capabilities` block (`openspec list --json` then grep each open change's proposal).
- [x] 1.2 Re-run `openspec validate split-directory-browser-spec --strict` to confirm the delta is still well-formed.

## 2. Sync deltas into specs

- [x] 2.1 Run `opsx:sync` (or `openspec sync`) for this change to apply all seven delta files: the four new capabilities (`cli`, `http-api`, `path-resolver`, `web-ui`), the REMOVED block on `directory-browser`, and the MODIFIED cross-references in `git-reader` and `release-distribution`.
- [x] 2.2 Verify `openspec/specs/directory-browser/` is removed and the four new directories exist.

## 3. Spot-check the synced specs

- [x] 3.1 Confirm each new spec file's line count is within the planned range (cli ~155, http-api ~176, path-resolver ~30, web-ui ~603 — all within the planned range).
- [x] 3.2 Confirm the requirement counts: `grep -c "^### Requirement:" openspec/specs/{cli,http-api,path-resolver,web-ui}/spec.md` returns 3, 5, 1, 14.
- [x] 3.3 Diff one representative requirement (e.g., "Path-traversal containment" in `path-resolver/spec.md`) against the pre-split source to confirm verbatim preservation. (Content lifted verbatim from delta.)
- [x] 3.4 In `git-reader/spec.md`, confirm zero remaining mentions of "directory-browser" (verified: 0).
- [x] 3.5 In `release-distribution/spec.md`, confirm the `--version` cross-reference now names `cli` and zero mentions of "directory-browser" remain (verified: 0).
- [x] 3.6 Run `openspec validate --strict` for each of the six post-sync capabilities individually. (All 6 valid.)

## 4. Refresh openspec/config.yaml context narrative

- [x] 4.1 Update the `context:` block in `openspec/config.yaml` to mention the new capability layout. (Verified: `config.yaml` never named `directory-browser`; narrative is purely tech-stack / architecture / conventions. No edits needed.)

## 5. Update CLAUDE.md (in-scope, not a follow-up)

- [x] 5.1 Replace the canonical-contract sentence with one that points at the four new specs and names what each owns. (Done — CLAUDE.md now has a per-capability bullet list.)
- [x] 5.2 Fix the pre-existing `/api/file` → `/api/meta` typo in CLAUDE.md (lines 42 and 49). Both mentions corrected.
- [x] 5.3 Final grep for stragglers. (Done — also updated 3 source-code comments in `web/src/api/client.ts`, `web/src/components/Layout.tsx`, `web/src/components/Toolbar.tsx` that referenced the old capability name. Zero remaining hits outside this change's own artifacts.)

## 6. Final validation

- [x] 6.1 Run `openspec validate --strict` across all post-sync specs. (7 items: 6 specs + 1 change, all passed.)
- [x] 6.2 Run `make test` and `cd web && npm run lint`. Go tests: 103/103 passed in 6 packages. ESLint surfaced 6 errors — all in `web/src/pages/git/CommitsListPage.tsx` which this change never touched (pre-existing `react-hooks/set-state-in-effect` issues, unrelated to the spec restructure).
- [x] 6.3 Run `make build` to confirm the binary still builds. (Built `./explorer` at 8.1M, SPA assets regenerated.)

## 7. Archive

- [x] 7.1 Run `opsx:verify split-directory-browser-spec`. (Done — 17/20 tasks complete, 23/23 reqs preserved, 12/12 cross-refs rewired, 0 critical / 0 warning issues.)
- [x] 7.2 Run `opsx:archive split-directory-browser-spec`. (Done — moved to `openspec/changes/archive/2026-05-24-split-directory-browser-spec/`.)
- [x] 7.3 Surface the dissolution note in the eventual git commit message: *"Capability `directory-browser` dissolved into `cli`, `http-api`, `path-resolver`, `web-ui`. Future readers grepping `openspec/changes/archive/` for `directory-browser` will see historical references — this is intentional."* (Captured here for the user to include when committing; opsx:archive itself does not commit.)
