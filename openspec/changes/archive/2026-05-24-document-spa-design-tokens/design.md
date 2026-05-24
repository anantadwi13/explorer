## Context

The SPA defines a coherent design system as CSS custom properties in `web/src/index.css`:

```css
:root {
  --bg, --bg-soft, --bg-panel,
  --fg, --fg-muted, --fg-faint,
  --line, --line-soft,
  --hover, --active,
  --accent, --accent-fg,
  --shadow, --radius, --radius-lg,
  --row-h, --content-pad,
  --font-sans, --font-mono
}
```

Each is redeclared under `[data-theme="light"]` and `[data-theme="dark"]` so the active theme drives the rendered colour. The token boot script in `web/index.html` applies the persisted theme before React mounts to avoid a flash.

Additional themed tokens (`--code-*` for syntax tokens, `--color-diff-*` for diff add/del tints) live in `web/src/styles/syntax.css` and follow the same `[data-theme]` pattern.

Today the openspec only requires this pattern in two places:
- Syntax highlighting (`directory-browser/spec.md:462,480`)
- Diff line backgrounds (`git-reader/spec.md:602`)

Everything else in the SPA — toolbar, popovers, badges, cards, sidebar, page chrome — is implicitly expected to follow the same pattern but is not specified. The git-reader CSS landed using a parallel, undefined vocabulary (`--bg-1`, `--bg-2`, `--bg-elev`, `--border`, `--border-strong`, `--radius-2`, `--space-*`) with hardcoded dark fallbacks (`var(--bg-1, #1a1a1a)`). Because the SPA had no `:root` declaration for those names, every reference resolved to the dark fallback — looking acceptable in dark theme and rendering dark-on-light (invisible) in light theme. The BranchPicker menu items in particular were unreadable in light mode until the bug was caught visually.

The code fix has already shipped in this branch (all seven git-reader CSS files refactored). This change documents the rule so the same gap can't reopen.

## Goals / Non-Goals

**Goals:**
- Canonicalise the design-token vocabulary in spec, with the source of truth being `web/src/index.css`.
- Make it a normative requirement that all SPA chrome (not just diff lines and syntax tokens) uses the documented tokens.
- Forbid the pattern that caused the regression: `var(--undocumented-name, <hardcoded-fallback>)`.

**Non-Goals:**
- Defining a new design system. The tokens already exist; the change documents them.
- Tooling. No stylelint config or lint rule is introduced; enforcement remains code review.
- Expanding the token set. New roles MAY be added later via a separate change.
- Touching the diff-line or syntax-token requirements that already work — those clauses stand as-is; the new requirement is additive and the git-reader update is a scope widening, not a rewrite.

## Decisions

### Where the token vocabulary lives in spec

**Decision:** Add the requirement to `directory-browser/spec.md`, not a new capability and not `git-reader/spec.md`.

**Rationale:** The SPA itself is owned by `directory-browser` — `index.css`, the `[data-theme]` switching, the localStorage theme key, and the existing "Theme handling" requirement (`directory-browser/spec.md:701`) all live there. `git-reader` is a layered capability that gates on `.git` presence; it consumes the SPA's design system rather than owning it. A separate "design-system" capability would create an artificial split for a single CSS file and one rule.

**Alternative considered:** A standalone `spa-design-system` capability. Rejected because (a) it has no API of its own — it's pure CSS — and (b) the existing `directory-browser` capability already covers the SPA's chrome, theming, layout, and density.

### Whether to enumerate every token in spec

**Decision:** Yes — list the full vocabulary in the requirement body. The spec is the canonical reference; readers shouldn't have to grep `index.css` to find which tokens exist.

**Rationale:** The whole problem was that the vocabulary lived only in one file with no normative declaration. Listing it in spec means future contributors can check "is `--bg-elev` documented?" against a single file. Drift between the spec and `index.css` is much easier to spot in code review than drift between two `.css` files.

**Trade-off:** When a token is added or removed, both `index.css` and the spec need updating. Acceptable — token churn is rare and the spec list is short (~20 entries).

### How tight to make the "no inventing tokens" rule

**Decision:** The rule forbids component CSS that *defines* new token names inline via `var(--newname, <fallback>)`. Adding tokens to the central `index.css` (with light AND dark variants) is permitted.

**Rationale:** The bug was a class of "ad-hoc token with hardcoded dark fallback" — that's the pattern to ban. Genuinely new design roles (e.g. a future overlay scrim) can be added to `index.css`; the bar is that they're declared per-theme, not that they're rationed.

### Whether to add a lint rule now

**Decision:** No — out of scope.

**Rationale:** The change is documentation only. A stylelint rule (e.g. `declaration-strict-value` configured to require known tokens) is a fine follow-up but introduces a new dev dependency, a lint config, and a CI gate; that's its own change. Today, enforcement is code review against the documented list.

## Risks / Trade-offs

- **Spec/code drift on token additions** → Mitigation: the requirement explicitly names `web/src/index.css` as the source of truth, and a future change adding a token will need to update both the spec list and `index.css` to validate.
- **The git-reader "Diff rendering rules" requirement currently scoped to diff line tints** → widening it to cover the whole git surface changes a requirement's scope, not its semantics. The diff-line scenarios at `git-reader/spec.md:608–614` are preserved verbatim; new scenarios are added for the chrome surfaces.
- **No automated enforcement** → The rule can be quietly violated by a future contributor. Acceptable for now (the same is true of most stylistic rules in spec); a follow-up change can introduce a lint rule if regressions recur.
