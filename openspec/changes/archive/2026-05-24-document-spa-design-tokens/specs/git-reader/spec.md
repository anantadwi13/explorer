## ADDED Requirements

### Requirement: Git surfaces use the documented SPA design tokens

All git-reader SPA surfaces — `BranchPicker`, `ChangesBadge`, `FileDiffCard`, `DiffHunk` chrome (the hunk container, header, borders, and pager — distinct from the +/− line-tint backgrounds covered by the "Diff rendering rules" requirement), `CommitsListPage`, `CommitDetailPage`, and `StatusPage` — SHALL paint their backgrounds, borders, foreground text, padding, radii, shadows, and fonts using the documented SPA design-token vocabulary defined in the `directory-browser` capability's "SPA design tokens" requirement.

Git-reader component CSS SHALL NOT introduce ad-hoc token names via `var(--newname, <hardcoded-fallback>)` patterns. The historical regression that motivated this requirement (BranchPicker dropdown menu items invisible in light theme because `var(--bg-1, #1a1a1a)` fell back to a dark value) is the class of bug this rule prevents.

This requirement is additive to the existing "Diff rendering rules" requirement:

- "Diff rendering rules" governs the *inside* of a hunk — line backgrounds (`--color-diff-add-bg` / `--color-diff-del-bg`), markers, syntax highlighting, and wrap.
- This requirement governs the *outside* — the card frame around a file diff, the hunk container border, the page padding on commit detail / commits list / status, the branch picker popover surface, the changes badge pill — all of which use the standard chrome tokens (`--bg-panel`, `--line`, `--fg`, etc.).

When a new git-reader surface is added in the future, it SHALL follow the same rule: chrome from the documented vocabulary, diff-internal coloring from the existing diff/syntax requirements.

#### Scenario: Branch picker popover uses documented tokens

- **WHEN** the branch picker dropdown is opened under `[data-theme="light"]`
- **THEN** the popover surface, item text, hover background, border, and shadow all resolve to the light-theme values of the documented vocabulary
- **AND** the menu items are visible (no dark-on-dark or light-on-light text)

- **WHEN** the user switches the theme to dark
- **AND** re-opens the branch picker
- **THEN** every chrome surface in the popover re-renders with the dark-theme values of the same tokens

#### Scenario: File diff card frame uses documented tokens

- **WHEN** a commit detail page renders one or more `FileDiffCard` components
- **THEN** the card border, hover state, expanded-body separator, badge backgrounds, and pager button all resolve to tokens from the documented vocabulary
- **AND** the +/− line tints inside each hunk are still driven by `--color-diff-add-bg` / `--color-diff-del-bg` per the "Diff rendering rules" requirement (no conflict — the two requirements address different surfaces)

#### Scenario: Status page chrome uses documented tokens

- **WHEN** the status page renders staged, unstaged, and untracked sections
- **THEN** the section borders, untracked-row backgrounds, link hover states, and page padding all resolve to tokens from the documented vocabulary

#### Scenario: New git surface follows the rule

- **WHEN** a new git-reader page or component is added (e.g. a tag detail view, a stash list)
- **THEN** its CSS uses only tokens from the documented vocabulary for chrome
- **AND** introduces no `var(--newname, <fallback>)` references with ad-hoc names
