## Why

The SPA already ships a coherent set of CSS custom properties in `web/src/index.css` (`--bg`, `--bg-soft`, `--bg-panel`, `--fg`, `--fg-muted`, `--fg-faint`, `--line`, `--line-soft`, `--hover`, `--active`, `--accent`, `--accent-fg`, `--shadow`, `--radius`, `--radius-lg`, `--row-h`, `--content-pad`, `--font-sans`, `--font-mono`), redefined per `[data-theme="light"|"dark"]`. But this vocabulary is documented nowhere outside the file itself. The current openspec only constrains *two* slices of UI to use it: syntax-highlighting token colours (`directory-browser/spec.md:462,480`) and diff line tints (`git-reader/spec.md:602`). Everything else — popovers, badges, cards, page padding, borders, radii — is unconstrained by spec.

That gap landed a real regression: the git-reader SPA shipped with seven CSS files referencing tokens that *don't exist* (`--bg-1`, `--bg-2`, `--bg-elev`, `--border`, `--border-strong`, `--radius-2`, `--space-*`) and falling back to hardcoded dark-theme values via `var(--bogus, #1a1a1a)` patterns. The fallbacks happen to look passable in dark mode and render dark-on-light (invisible) in light mode — the BranchPicker dropdown menu items disappeared entirely in light theme until the bug was caught visually during demo-GIF recording. The code fix has already landed in this branch; this proposal codifies the rule the corrected code follows so the same class of bug can't silently regress.

## What Changes

- **Document the design-token vocabulary** as a new requirement in the `directory-browser` capability. Enumerate each token's purpose and constrain that the canonical definitions live in `web/src/index.css`, redeclared per `[data-theme="light"|"dark"]`.
- **Widen the existing styling clauses** so they apply to all SPA chrome, not just diff lines and syntax tokens:
  - `directory-browser/spec.md`: add a "all SPA chrome uses the documented design tokens" requirement that covers tree, listing, breadcrumbs, toolbar, settings popover, sidebar, file viewer chrome — anything painted by the SPA.
  - `git-reader/spec.md:602` (existing "Line backgrounds" requirement): broaden to cover BranchPicker, ChangesBadge, FileDiffCard, CommitsListPage, CommitDetailPage, and StatusPage in addition to diff line tints.
- **Forbid inventing parallel token names** for the same concept (e.g. `--bg-1`/`--bg-2`/`--bg-elev` when `--bg-panel`/`--hover` exist). New tokens MAY be added to the central vocabulary in `index.css` (with light + dark variants) when a genuinely new role appears; they MUST NOT be introduced inline in component CSS via `var(--new-name, <hardcoded fallback>)`.

No code change is required — this branch already refactors all seven git-reader CSS files to the documented tokens. The proposal makes the rule explicit so the next contributor can't repeat the mistake.

## Capabilities

### New Capabilities

None. The design-token rule belongs to an existing capability (the SPA, owned by `directory-browser`).

### Modified Capabilities

- `directory-browser`: add a new "Design tokens" requirement enumerating the token vocabulary and constraining all SPA chrome to use it; the existing "Theme handling" requirement already references "CSS custom properties" but doesn't enumerate the set — the new requirement is the canonical list.
- `git-reader`: widen the existing "Diff rendering rules" requirement at `spec.md:602` (currently scoped to diff line backgrounds) to also constrain branch picker, changes badge, file-diff card, commits list page, commit detail page, and status page to use the documented tokens.

## Impact

- **Spec**: two delta specs (`directory-browser` and `git-reader`). No new top-level capability.
- **Code**: no implementation change required in this branch — the refactor that motivated this proposal has already shipped across `web/src/git/*.css` and `web/src/pages/git/*.css`. Future contributors gain a checkable rule.
- **Tests**: no automated test added in this change; the rule is enforced by code review against the documented token list. A future change could add a lint rule (`stylelint-declaration-strict-value` or a custom check) that fails on `var(--name, <fallback>)` patterns where `<name>` is not in the documented vocabulary, but that is out of scope here.
- **Docs**: the new requirement effectively becomes the design-system reference; the SPA's `web/README.md` (if/when expanded) can link to it instead of duplicating the token list.
