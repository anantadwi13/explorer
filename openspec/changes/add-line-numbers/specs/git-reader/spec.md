## ADDED Requirements

### Requirement: Diff hunk line numbers

In commit detail and status views, every rendered diff line SHALL be preceded by an always-on two-column line-number gutter. The first column SHALL display the line's number in the **old** file ("old number"); the second column SHALL display the line's number in the **new** file ("new number"). For each diff line, gutter cell occupancy SHALL depend on line type:

- **Context lines**: both old and new numbers are shown.
- **Added lines (`+`)**: only the new number is shown; the old column is rendered blank.
- **Deleted lines (`−`)**: only the old number is shown; the new column is rendered blank.

Line numbers SHALL be derived purely client-side from each hunk's `old_start` and `new_start` fields by walking the hunk's lines in order. The `GitHunk` JSON schema SHALL NOT change for this feature: no per-line numbers are added to the wire format.

The two-column gutter SHALL be visible at every supported viewport width, including phone-class widths. On viewports below `768px` the gutter MAY render with reduced font size and padding to keep both columns within a typical 360px viewport without crowding the diff text below ~30 character columns; the gutter SHALL NOT be hidden. There SHALL NOT be a user-facing toggle, settings-menu entry, or `localStorage` key controlling diff line-number visibility.

When the active wrap preference is `off` (read from `localStorage["explorer.wrap"]` via the existing `useWrap` hook), the diff hunk body SHALL scroll horizontally, and BOTH gutter columns AND the single-character marker column (`+`, `−`, space) SHALL remain pinned to the left edge of the visible viewport (sticky-left) while the diff text scrolls beneath them. The marker is included in the pinned block so that a horizontally scrolled long line still shows the reader which type of line they are reading.

For tinted rows (`add` and `del`), the gutter cells of that row SHALL carry the same row tint as the diff text — the `add` row gutter cells SHALL use `var(--color-diff-add-bg)` and the `del` row gutter cells SHALL use `var(--color-diff-del-bg)` — so the row tint extends continuously across both gutter columns and the diff text. Context-row gutter cells SHALL use a background that matches the hunk body so they remain opaque while sticky-left in wrap-off mode.

The gutter SHALL be excluded from clipboard copies — a user selecting diff text SHALL receive the marker (`+`, `−`, space) and the source content, with no line numbers, when they copy and paste. The gutter SHALL also be marked `aria-hidden="true"`.

The existing single-character marker (`+`, `−`, space) SHALL remain outside the gutter and outside the highlighted span, retaining its existing palette and position.

#### Scenario: Context line shows both numbers

- **WHEN** a hunk with header `@@ -42,3 +58,3 @@` is rendered
- **AND** the first line is a context line
- **THEN** the gutter shows `42` in the old column and `58` in the new column
- **AND** the marker is a space and the diff text follows

#### Scenario: Added line shows only the new number

- **WHEN** a hunk contains an `add` line at new position `59`
- **THEN** the gutter renders the old column blank and shows `59` in the new column
- **AND** the row is tinted with the additions background

#### Scenario: Deleted line shows only the old number

- **WHEN** a hunk contains a `del` line at old position `43`
- **THEN** the gutter shows `43` in the old column and renders the new column blank
- **AND** the row is tinted with the deletions background

#### Scenario: Numbers walk forward correctly through a mixed hunk

- **WHEN** a hunk with `old_start: 42, new_start: 58` contains the line sequence `context, del, del, add, context`
- **THEN** the gutter columns over those rows are `(42, 58)`, `(43, blank)`, `(44, blank)`, `(blank, 59)`, `(45, 60)`
- **AND** the next hunk's numbering starts from its own `old_start` / `new_start`, independent of any prior hunk

#### Scenario: Wrap-off pins both gutter columns AND the marker to the left

- **WHEN** the wrap preference is `off`
- **AND** the user scrolls a diff hunk body horizontally to the right
- **THEN** the old gutter column, the new gutter column, AND the `+` / `−` / space marker column all remain pinned to the left edge of the visible viewport
- **AND** the gutter and marker cells' backgrounds remain opaque (matching their row tint or the hunk body background) so scrolled diff text is not visible through them
- **AND** only the diff text continues to scroll horizontally underneath the pinned block

#### Scenario: Gutter inherits the row tint on add and del rows

- **WHEN** a tinted `add` row is rendered
- **THEN** the new column gutter cell, the blank old column gutter cell, the marker cell, and the diff text cell all show the same `var(--color-diff-add-bg)` tint
- **AND** the same rule applies symmetrically for `del` rows with `var(--color-diff-del-bg)`

#### Scenario: Gutter is excluded from clipboard copies

- **WHEN** the user selects a region of diff text (across multiple lines, possibly including the marker) and copies it
- **THEN** the clipboard receives only the marker characters and the source content
- **AND** no line numbers appear in the pasted output

#### Scenario: Gutter remains visible on mobile

- **WHEN** the SPA renders a diff hunk at a viewport width below `768px`
- **THEN** both gutter columns are present and the numbers are readable
- **AND** the diff text remains legible alongside the gutter (gutter typography MAY be tightened to keep both visible)

#### Scenario: Wire format is unchanged

- **WHEN** the SPA fetches a hunk from `/api/git/...` lazy hunk endpoints
- **THEN** the JSON response matches the existing `GitHunk` schema with no per-line number fields added
- **AND** the SPA derives the displayed numbers from `old_start`, `new_start`, and the line-type sequence
