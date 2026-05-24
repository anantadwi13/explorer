## 1. Verify implementation already in this branch

- [x] 1.1 Grep `web/src/git/` and `web/src/pages/git/` for any remaining `var(--bg-1|bg-2|bg-elev|border|border-strong|radius-2|space-)` references — the refactor is complete only if grep returns zero matches.
- [x] 1.2 Run `npm test -- --run` in `web/` and confirm 136/136 (or current count) pass.
- [x] 1.3 Run `npx tsc --noEmit` in `web/` and confirm no errors.
- [x] 1.4 Run `go test ./cmd/... ./internal/...` and confirm all pass.
- [x] 1.5 Manually confirm BranchPicker dropdown is legible in light AND dark theme (the regression's smoking gun).

## 2. Cross-check spec deltas against the source of truth

- [x] 2.1 Verify every token enumerated in the new `directory-browser` "SPA design tokens" requirement is declared in `web/src/index.css`: colour tokens under `:root` + `[data-theme="light"]` + `[data-theme="dark"]`; theme-invariant tokens (geometry, typography, brand colour) at `:root` only.
- [x] 2.2 Confirm `web/src/styles/syntax.css` continues to own `--code-*` and `--color-diff-*` (these are NOT in the chrome vocabulary — they're covered by the existing syntax/diff requirements).
- [x] 2.3 Confirm no other file under `web/src/` declares chrome tokens (`grep -rn ":root\|--bg\|--fg\|--line\|--accent" web/src/ | grep -v "index.css\|syntax.css"` should return only consumption, never declaration).

## 3. Sync deltas into main specs

- [x] 3.1 Run `openspec validate document-spa-design-tokens` to confirm the change parses and the deltas are well-formed.
- [x] 3.2 Use the `openspec-sync-specs` skill (or `/opsx:sync`) to apply the delta in `specs/directory-browser/spec.md` to `openspec/specs/directory-browser/spec.md` (ADDED block).
- [x] 3.3 Use the same skill to apply the delta in `specs/git-reader/spec.md` to `openspec/specs/git-reader/spec.md` (ADDED block).
- [x] 3.4 Confirm the synced files contain the new requirements and that no existing requirement was mangled.

## 4. Archive

- [x] 4.1 Use the `openspec-archive-change` skill (or `/opsx:archive`) to move `openspec/changes/document-spa-design-tokens/` into `openspec/changes/archive/<date>-document-spa-design-tokens/`.
- [x] 4.2 Commit the spec sync + archive in one commit (`chore(openspec): sync + archive document-spa-design-tokens`).
