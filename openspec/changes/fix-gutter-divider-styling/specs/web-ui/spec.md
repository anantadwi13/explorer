## MODIFIED Requirements

### Requirement: Text-like file line numbers

When the file viewer renders a text-like file (`kind === 'text'`), the SPA SHALL display an always-on line-number gutter to the left of the rendered code. The gutter SHALL show exactly one number per logical line of the file, starting at `1` for the first line, with the number anchored to the first visual row of its line so that wrapped continuation rows do not receive their own number.

The line-number gutter SHALL be visible at every supported viewport width, including phone-class widths below the `≥768px` breakpoint. There SHALL NOT be a user-facing toggle, settings-menu entry, or `localStorage` key controlling line-number visibility.

The line-number gutter SHALL NOT appear on rendered prose surfaces. Specifically:

- Markdown files (`kind === 'markdown'`, rendered via `MarkdownRenderer`) SHALL NOT show a line-number gutter around the rendered prose output.
- Fenced code blocks rendered inside `MarkdownRenderer` SHALL NOT show a line-number gutter in this change (those blocks are out of scope and continue to render as they do today).
- Image previews (`kind === 'image'`) and the non-previewable fallback view SHALL NOT show a line-number gutter.

The gutter SHALL apply only when the file viewer is rendering a text-like file through `CodeBlock` (i.e. `kind === 'text'`).

The line-number gutter cell (`.line-no`) SHALL have a `1px solid var(--line)` right border separating it from the code content cell. The code content cell (`.line-text`) SHALL have `0.75ch` of left padding so that code text does not abut the border. The gutter cell SHALL use `var(--line-soft)` as its background colour so the gutter lane is visually distinguishable from the code content area (`var(--bg-panel)`).

The top/bottom breathing room of the code block SHALL be provided by padding on the first and last grid-row cells (via `.code-line:first-child` / `.code-line:last-child` selectors) rather than on the `<pre>` container, so that the gutter background fills the full height of the panel with no uncoloured band above the first line or below the last line.

When the active wrap preference is `off` (read from `localStorage["explorer.wrap"]` via the existing `useWrap` hook), the code area SHALL scroll horizontally inside the file-viewer code block, and the line-number gutter SHALL remain pinned to the left edge of the visible viewport (sticky-left) while the code text scrolls beneath it. The pinned gutter SHALL have an opaque background using `var(--line-soft)` so scrolled code text is not visible through it. The right border SHALL remain visible at the sticky left edge while the code cell scrolls.

The line-number gutter SHALL be excluded from clipboard copies — a user selecting code (including with `Ctrl/Cmd+A`) SHALL receive only the source text, with no line numbers, when they copy and paste. The gutter SHALL also be marked `aria-hidden="true"` because the line content already conveys position to assistive technology.

Syntax highlighting for the line-numbered file viewer SHALL be performed per logical line using the existing shared `lowlight` instance (`web/src/components/syntax/grammars.ts`). This is a known approximation: multi-line tokens such as block comments and template literals may re-tokenise on each continuation line. The same approximation is already used by the diff-hunk renderer (see `git-reader` capability) and is accepted as the rendering baseline.

#### Scenario: Line numbers appear for a code file

- **WHEN** the SPA renders `internal/server/api.go` (a text-kind file with a registered grammar)
- **THEN** every logical line is preceded in the gutter by its 1-based line number (`1`, `2`, `3`, …)
- **AND** the numbers run from `1` to the file's total line count

#### Scenario: Gutter divider is visible between numbers and code

- **WHEN** a text-kind file is rendered in the file viewer
- **THEN** a visible vertical line (`1px solid var(--line)`) is present between the line-number gutter and the code content
- **AND** the gutter lane has a `var(--line-soft)` background that is visually distinct from the `var(--bg-panel)` code area
- **AND** the code text has `0.75ch` left padding so it does not abut the divider line
- **AND** the gutter background extends flush to the top and bottom edges of the panel (no uncoloured band above line 1 or below the last line)

#### Scenario: Wrapped line keeps a single number

- **WHEN** wrap preference is `on` (the default)
- **AND** a logical line in the rendered file is wider than the viewport so it wraps to multiple visual rows
- **THEN** the gutter shows the line number once, vertically aligned with the first visual row of that wrapped line
- **AND** no additional numbers appear next to continuation rows

#### Scenario: Wrap-off pins the gutter to the left

- **WHEN** the user toggles wrap to `off` via the file-viewer wrap toggle
- **AND** scrolls the code area horizontally to the right
- **THEN** the line-number gutter remains pinned to the left edge of the visible viewport
- **AND** the gutter's background remains opaque so the scrolled code text is not visible through it
- **AND** the right border of the gutter remains visible at the sticky left edge
- **AND** the line numbers remain readable and aligned with their corresponding source lines

#### Scenario: Line numbers are excluded from clipboard copies

- **WHEN** the user selects all visible content in the file viewer (e.g. by `Cmd+A` / `Ctrl+A`) and copies it
- **THEN** the clipboard receives the source text only
- **AND** no line numbers appear in the pasted output

#### Scenario: Line numbers remain visible on mobile

- **WHEN** the SPA is rendered at a viewport width below `768px`
- **AND** a text-kind file is shown
- **THEN** the line-number gutter is present and readable next to the code
- **AND** no responsive rule hides the gutter at any supported viewport width

#### Scenario: Markdown file does not show a line-number gutter

- **WHEN** the SPA renders `README.md` (a file with `kind === 'markdown'`)
- **THEN** the rendered prose, headings, lists, tables, and any embedded fenced code blocks are shown without any line-number gutter beside them
- **AND** the rendering pipeline (`MarkdownRenderer` with its rehype plugins) is unchanged by this feature

#### Scenario: Image preview does not show a line-number gutter

- **WHEN** the SPA renders an image file (`kind === 'image'`, e.g. `logo.png`)
- **THEN** the image preview is shown without any line-number gutter beside it

#### Scenario: Non-previewable fallback does not show a line-number gutter

- **WHEN** the SPA opens a file that the server reports as non-previewable (e.g. a binary)
- **THEN** the fallback view (download affordance + message) is shown without any line-number gutter

#### Scenario: Per-line highlighting is the rendering baseline

- **WHEN** a code file containing a multi-line block comment is rendered
- **THEN** each line of the comment is highlighted independently using the file's grammar
- **AND** the resulting token colours on continuation lines may differ from the colours that would be produced by whole-file tokenisation
- **AND** this re-tokenisation is the documented baseline (the same approach the diff renderer already uses)

### Requirement: File last-commit strip — subject/author hierarchy

When the file viewer renders the last-commit strip (`FileLastCommitStrip`) above a file's content, the strip SHALL display: short SHA · commit subject · author name · relative time, all in a single flex row.

The commit subject SHALL be the visually dominant field: it SHALL carry `font-weight: 500` (semi-bold) and SHALL be the only field that gets ellipsized when the strip narrows (`flex: 1 1 auto` + `overflow: hidden; text-overflow: ellipsis`).

The author name SHALL be constrained so it cannot crowd the subject: it SHALL use `flex: 0 1 auto` (can shrink), `min-width: 0` (removes the implicit flex-item minimum so it can shrink below content width), `max-width: 20ch`, and `overflow: hidden; text-overflow: ellipsis`. The author name SHALL also render at `font-size: 0.9em` to further de-emphasise it relative to the subject.

The relative time field SHALL retain `flex-shrink: 0` and `white-space: nowrap` — time strings are always short and must not be truncated.

#### Scenario: Long author name does not crowd the subject

- **WHEN** a file has a last commit authored by a person with a name longer than 20 characters
- **THEN** the commit subject is readable in the strip (not ellipsized to a few characters)
- **AND** the author name is truncated with an ellipsis at or before 20ch
- **AND** the time field remains fully visible

#### Scenario: Commit subject is visually prominent

- **WHEN** the last-commit strip renders any commit
- **THEN** the subject text is semi-bold (`font-weight: 500`) and the author name is rendered at `0.9em` relative to the strip's base font size
- **AND** the subject ellipsizes before the author name begins to shrink
