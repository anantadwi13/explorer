## ADDED Requirements

### Requirement: Text-like file line numbers

When the file viewer renders a text-like file (`kind === 'text'`), the SPA SHALL display an always-on line-number gutter to the left of the rendered code. The gutter SHALL show exactly one number per logical line of the file, starting at `1` for the first line, with the number anchored to the first visual row of its line so that wrapped continuation rows do not receive their own number.

The line-number gutter SHALL be visible at every supported viewport width, including phone-class widths below the `≥768px` breakpoint. There SHALL NOT be a user-facing toggle, settings-menu entry, or `localStorage` key controlling line-number visibility.

The line-number gutter SHALL NOT appear on rendered prose surfaces. Specifically:

- Markdown files (`kind === 'markdown'`, rendered via `MarkdownRenderer`) SHALL NOT show a line-number gutter around the rendered prose output.
- Fenced code blocks rendered inside `MarkdownRenderer` SHALL NOT show a line-number gutter in this change (those blocks are out of scope and continue to render as they do today).
- Image previews (`kind === 'image'`) and the non-previewable fallback view SHALL NOT show a line-number gutter.

The gutter SHALL apply only when the file viewer is rendering a text-like file through `CodeBlock` (i.e. `kind === 'text'`).

When the active wrap preference is `off` (read from `localStorage["explorer.wrap"]` via the existing `useWrap` hook), the code area SHALL scroll horizontally inside the file-viewer code block, and the line-number gutter SHALL remain pinned to the left edge of the visible viewport (sticky-left) while the code text scrolls beneath it. The pinned gutter SHALL have an opaque background derived from the existing `var(--bg-panel)` token so scrolled code text is not visible through it.

The line-number gutter SHALL be excluded from clipboard copies — a user selecting code (including with `Ctrl/Cmd+A`) SHALL receive only the source text, with no line numbers, when they copy and paste. The gutter SHALL also be marked `aria-hidden="true"` because the line content already conveys position to assistive technology.

Syntax highlighting for the line-numbered file viewer SHALL be performed per logical line using the existing shared `lowlight` instance (`web/src/components/syntax/grammars.ts`). This is a known approximation: multi-line tokens such as block comments and template literals may re-tokenise on each continuation line. The same approximation is already used by the diff-hunk renderer (see `git-reader` capability) and is accepted as the rendering baseline.

#### Scenario: Line numbers appear for a code file

- **WHEN** the SPA renders `internal/server/api.go` (a text-kind file with a registered grammar)
- **THEN** every logical line is preceded in the gutter by its 1-based line number (`1`, `2`, `3`, …)
- **AND** the numbers run from `1` to the file's total line count

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
