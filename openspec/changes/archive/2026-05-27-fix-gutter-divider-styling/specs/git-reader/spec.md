## MODIFIED Requirements

### Requirement: Diff rendering rules

In commit detail and status views, rendered hunks SHALL follow these rules:

- Unified diff format only (no side-by-side).
- The hunk header (`@@ -O,L +N,L @@ <header>`) is displayed above each hunk's lines.
- Each line is rendered in a fixed-pitch font with a leading single-character marker indicating its type: a space for context, `+` for additions, `−` for deletions.
- Line backgrounds are themed via CSS custom properties: a light-green tint for additions, a light-red tint for deletions, default for context. The exact colours follow the active theme (light, dark, system) using the same custom-property pattern as the existing file viewer.
- Source lines SHALL be syntax-highlighted using the same shared `lowlight` instance the file viewer uses (`web/src/components/syntax/grammars.ts`), with the language detected from the file path via the same `extToLanguage` helper. Highlighting is performed *per line* (the SPA does not have the surrounding file context), which is a known approximation for multi-line constructs (e.g. long string literals) but matches how widely-used diff viewers behave. When the file path has no registered grammar (`extToLanguage` returns `null`), lines render as plain monospace text.
- The single-character `+`/`−`/space marker SHALL remain outside the highlighted span so its colour is driven by the diff palette, not the language grammar.
- The change-type marker column (`.diff-line-marker`) SHALL have a `1px solid var(--line)` right border separating it from the code text cell. The code text cell (`.diff-line-text`) SHALL have `0.5ch` of left padding so that code text does not abut the border. The marker column SHALL be `1.75ch` wide (the third track in `.diff-hunk-lines` `grid-template-columns`) and SHALL carry `padding-right: 0.25ch` so the `+`/`−` glyph has breathing room before the border. The marker column and both gutter columns SHALL use `var(--line-soft)` as their opaque base background so the gutter lane is visually distinct from the code content.
- In wrap-off mode, the sticky `left` offset for `.diff-gutter-new` SHALL be `calc(var(--gutter-old-w, 3ch) - 1px)` and for `.diff-line-marker` SHALL be `calc(var(--gutter-old-w, 3ch) + var(--gutter-new-w, 3ch) - 1px)`. The 1 px negative overlap prevents a subpixel transparent gap between adjacent sticky columns at certain device pixel ratios.
- Long lines wrap inside the hunk block by default (no horizontal scroll on the page).
- The commit detail and status views SHALL expose a wrap/no-wrap toggle button in their page header (same `WrapIcon` button used by the web-ui file viewer). The current wrap state SHALL be read from and written to the existing `localStorage["explorer.wrap"]` key via the existing `useWrap` hook — so toggling wrap inside the file viewer and inside the diff views shares one global preference (single key, no surprise). When wrap is OFF, hunk bodies SHALL allow horizontal scroll instead of wrapping (`white-space: pre` + `overflow-x: auto`). When wrap is ON (the default), behaviour matches the previous bullet (no horizontal scroll on the page).
- **Mobile font-size**: at viewport widths ≤767px the entire `.diff-hunk-body` element (not its individual gutter children) SHALL carry `font-size: 0.75rem`. This ensures that the `ch` unit resolves from a single font-size context for both `grid-template-columns` on `.diff-hunk-lines` and `position: sticky; left:` on the gutter cells, preventing sticky mis-alignment on mobile.

#### Scenario: Line backgrounds by theme

- **WHEN** a hunk is rendered under `[data-theme="light"]`
- **THEN** additions render with the light-mode green tint and deletions with the light-mode red tint

- **WHEN** the user switches to `[data-theme="dark"]`
- **THEN** the same hunk re-renders with the dark-mode green and red tints via the CSS custom properties

#### Scenario: Syntax highlighting follows the file's grammar

- **WHEN** a hunk for `internal/server/api.go` is rendered
- **THEN** the lines are tokenised with the registered Go grammar
- **AND** keyword / string / comment tokens carry the same `hljs-*` class names used by the file viewer
- **AND** the `+`/`−` line marker is a sibling span outside the highlighted content, so it picks up the diff palette colour and not a grammar colour

#### Scenario: Unknown language falls back to plain monospace

- **WHEN** a hunk for `notes.foobar` is rendered (the extension has no grammar registered)
- **THEN** the lines render as plain monospace text with no `hljs-*` token spans

#### Scenario: Marker divider is visible between line numbers and code

- **WHEN** a diff hunk is rendered
- **THEN** a visible vertical line (`1px solid var(--line)`) is present on the right edge of the change-type marker column
- **AND** the gutter and marker columns have a `var(--line-soft)` background visually distinct from the code content
- **AND** the code text has `0.5ch` left padding so it does not abut the divider line
- **AND** no transparent gap appears between the old-line-number, new-line-number, and marker columns when the diff scrolls horizontally in wrap-off mode

#### Scenario: Long line wraps inside the hunk block

- **WHEN** a line in a hunk is wider than the viewport
- **AND** the wrap preference is ON (the default)
- **THEN** the line wraps inside the hunk block
- **AND** the page itself does not scroll horizontally

#### Scenario: Toggling wrap off enables horizontal scroll inside hunks

- **WHEN** the user activates the wrap toggle in the commit detail or status page header
- **AND** wrap was previously ON
- **THEN** the wrap preference becomes OFF
- **AND** every rendered hunk body switches to `white-space: pre` with horizontal scroll inside the hunk block
- **AND** the preference persists across page reloads via `localStorage["explorer.wrap"]`
- **AND** the file viewer (when next opened on a text file) reads the same preference, so the wrap state is shared across both surfaces

#### Scenario: Mobile horizontal scroll shows no gap between gutter and marker

- **WHEN** the SPA is rendered at a viewport width ≤767px
- **AND** wrap is OFF
- **AND** the user scrolls a diff hunk horizontally to the right
- **THEN** the old-line-number gutter, new-line-number gutter, and +/− marker remain flush with no transparent gap between them
- **AND** the right border of the marker column remains visible and aligned with the sticky gutters

#### Scenario: Wrap toggle does not render on web-ui routes

- **WHEN** the SPA is on a web-ui folder URL (`/` or `/view/<path>/`)
- **THEN** no diff wrap toggle is present in the toolbar
- **AND** the existing file-viewer wrap toggle (for `kind === 'text'` files) is unchanged

### Requirement: Blame view rendering

The Blame view rendered by the file viewer's Blame tab SHALL show every working-tree line of the file paired with its blame attribution from `/api/git/blame`.

The view SHALL render the file content from `/raw/<path>` (the same source used by `<CodeBlock>`), paired by line number with the chunks from the blame response.

Each blame chunk SHALL render as a visually distinct section:
- **Committed chunks** SHALL display metadata `<short_sha> · <subject> · <author_name> · <relative-time>`. The short_sha and subject SHALL be linked to `/git/commits/<sha>`.
- **Uncommitted chunks** (`uncommitted: true` in the response) SHALL display the label `Working tree · uncommitted` in place of commit metadata, with no author, no timestamp, and no link. The chunk body SHALL render with a distinct background using a themed CSS custom property (e.g. `--blame-uncommitted-bg`) so the chunk reads as visually different from a committed chunk at a glance.

Within each chunk, lines SHALL render in order with a single-column line-number gutter. The gutter SHALL be 1-based and continuous across chunks (i.e. the first line of the second chunk is `chunk1.start_line + chunk1.line_count`). Per-line syntax highlighting SHALL use the shared `lowlight` instance from `web/src/components/syntax/grammars.ts` with the language derived from the file path via `extToLanguage` (the same per-line approximation already used by `DiffHunk`). When `extToLanguage` returns `null`, lines SHALL render as plain monospace text.

The line-number gutter cell (`.blame-gutter`) SHALL have a `1px solid var(--line)` right border separating it from the code content cell. The code content cell (`.blame-line-text`) SHALL have `0.75ch` of left padding so that code text does not abut the border. The gutter cell SHALL use `var(--line-soft)` as its background colour so the gutter lane is visually distinguishable from the code content area. The top/bottom breathing room within each chunk body SHALL be provided by padding on the first and last line cells (`.blame-line:first-child` / `.blame-line:last-child`) rather than on the chunk-body container, so the gutter background fills the full height of each chunk with no uncoloured band at the top or bottom.

The Blame view SHALL respect the `localStorage["explorer.wrap"]` preference via the existing `useWrap` hook (no separate wrap toggle inside the Blame view — the file viewer's existing wrap toggle controls both Code and Blame views). When wrap is on, lines wrap inside the code cell; when off, the code cell scrolls horizontally and the line-number gutter (and, on viewports ≥768px, the chunk-metadata column) remain sticky-left in the same pattern used by the diff hunk gutter.

When the blame response has `dirty: true`, the Blame view SHALL render a `Modified locally` status pill above the chunk list — the same pill used by the last-commit strip.

The Blame view SHALL be responsive at the existing `768px` SPA layout breakpoint:
- **≥768px**: each chunk is a row with three columns — chunk metadata (left), line-number gutter, code cell. The metadata column SHALL be narrow enough that the code cell remains the dominant visual element (suggested width ~200–280 px; exact value SHALL be defined in CSS).
- **<768px**: each chunk's metadata stacks above its line range as a compact header strip. The line-number gutter and code cell remain side-by-side below the strip. This matches the "must work on mobile" constraint stated by the user.

#### Scenario: Committed chunks render the commit metadata

- **WHEN** the Blame view renders a committed chunk attributed to commit `abc1234`
- **THEN** the chunk's metadata cell shows `abc1234 · <subject> · <author_name> · <relative-time>`
- **AND** the short_sha is linked to `/git/commits/abc1234`

#### Scenario: Uncommitted chunks render the Working tree label

- **WHEN** the Blame view renders an uncommitted chunk (`uncommitted: true`)
- **THEN** the metadata cell reads `Working tree · uncommitted`
- **AND** no author, timestamp, or link is shown
- **AND** the chunk body has a visually distinct background driven by `--blame-uncommitted-bg`

#### Scenario: Line numbers are continuous across chunks

- **WHEN** the Blame view renders chunks with start_line/line_count of (1,5), (6,3), (9,2)
- **THEN** the line-number gutter reads 1..10 across the three chunks with no gap or repetition

#### Scenario: Gutter divider is visible between line numbers and code

- **WHEN** the Blame view renders any chunk
- **THEN** a visible vertical line (`1px solid var(--line)`) is present on the right edge of the line-number gutter
- **AND** the gutter lane has a `var(--line-soft)` background visually distinct from the code content area
- **AND** the code text has `0.75ch` left padding so it does not abut the divider line
- **AND** the gutter background fills the full height of each chunk body with no uncoloured band above the first line or below the last line of the chunk

#### Scenario: Modified-locally banner

- **WHEN** the Blame view renders a response with `dirty: true`
- **THEN** a `Modified locally` status pill appears above the chunk list
- **AND** the pill uses the same visual treatment as the file viewer strip's pill

#### Scenario: Wrap toggle is shared with the file viewer

- **WHEN** the user toggles wrap off in the file viewer's Code tab
- **AND** then switches to the Blame tab
- **THEN** the Blame tab also renders in wrap-off mode (the code cell scrolls horizontally)
- **AND** in wrap-off the line-number gutter remains sticky-left while the code cell scrolls

#### Scenario: Sticky-left on desktop pins both metadata and gutter

- **WHEN** the user views the Blame tab at viewport width ≥768px with wrap off
- **AND** scrolls a chunk's code cell horizontally
- **THEN** the chunk-metadata column AND the line-number gutter both remain pinned to the left edge of the visible viewport
- **AND** only the code cell scrolls

#### Scenario: Mobile layout stacks metadata above lines

- **WHEN** the user views the Blame tab at viewport width below 768px
- **THEN** each chunk renders its metadata as a header strip above its line range
- **AND** the line range renders below in a two-column layout (gutter + code cell)
- **AND** no horizontal scrolling is required to see the metadata

#### Scenario: Untracked empty state

- **WHEN** the user activates the Blame tab on a file the blame endpoint reports as `not_found` because it is untracked
- **THEN** the view renders an empty state reading `This file is untracked. No blame available.`
- **AND** an "Open History" affordance links to `/git/commits?path=<encoded path>`
- **AND** no chunk is rendered

#### Scenario: Timeout empty state

- **WHEN** the blame endpoint responds with `blame_timeout`
- **THEN** the Blame view renders an empty state distinct from the generic internal-error state
- **AND** the empty state surfaces the "Open History" affordance as a fallback path
- **AND** no chunk is rendered

#### Scenario: Unknown language falls back to plain monospace

- **WHEN** the Blame view renders a file whose extension has no registered grammar (`extToLanguage` returns `null`)
- **THEN** the code cell renders as plain monospace text with no `hljs-*` token spans
- **AND** chunk grouping and the line-number gutter are unaffected
