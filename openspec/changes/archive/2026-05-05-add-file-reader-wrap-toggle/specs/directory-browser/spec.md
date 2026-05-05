## ADDED Requirements

### Requirement: File reader wrap toggle

The SPA file viewer SHALL expose a wrap toggle when previewing a `text` (code) file. The toggle controls whether long lines wrap to fit the viewport (wrap on) or extend to their natural width and become horizontally scrollable inside the code block (wrap off). The toggle SHALL NOT appear for `markdown`, `image`, non-previewable, or error states; markdown fenced code blocks SHALL retain their existing wrap behavior and SHALL NOT be affected by the toggle.

The default state SHALL be wrap **on**, matching prior behavior. The user's choice SHALL persist in `localStorage` under the key `explorer.wrap` with values `"on"` or `"off"`; an absent or unrecognized value SHALL be treated as `"on"`. The persisted value SHALL apply across page reloads, navigation between text files, and the layout split-vs-stacked breakpoint.

The toggle SHALL be a single icon button with a 32×32 px visible footprint at all viewport widths, sized identically to the existing Copy-link icon button (matching the project's shared `.icon-btn` shape). On viewports `< 800px` the toggle SHALL NOT render any text label. Its current state SHALL be exposed assistively via `aria-pressed` (true when wrap is on — the button represents an active wrap-lines action and is "engaged" while wrap is enabled), and a descriptive `aria-label` and `title` SHALL be provided ("Wrap lines: on" / "Wrap lines: off" or equivalent).

When wrap is **off**, the standalone code block SHALL render with `white-space: pre` and a horizontal scrollbar local to the code block (the page itself SHALL NOT scroll horizontally as a result). When wrap is **on**, the code block SHALL render exactly as it does today (`white-space: pre-wrap` with break-on-anywhere word breaks).

#### Scenario: Toggle visible only for text files

- **WHEN** the file viewer renders a file whose `kind` is `text`
- **THEN** a wrap toggle button is present in the file viewer's header actions area
- **AND** when the same viewer renders a `markdown`, `image`, non-previewable, or errored file, the wrap toggle is not rendered

#### Scenario: Default is wrap on

- **WHEN** a user with no prior `explorer.wrap` value in `localStorage` opens any text file
- **THEN** the code block is rendered with lines wrapped to fit the viewport
- **AND** the toggle's `aria-pressed` is `true`

#### Scenario: Toggling switches wrap mode

- **WHEN** the user clicks the wrap toggle while viewing a text file in wrap-on state
- **THEN** the code block re-renders with `white-space: pre` (no wrapping)
- **AND** lines longer than the viewport produce a horizontal scrollbar inside the code block, not on the page
- **AND** the toggle's `aria-pressed` becomes `false`
- **AND** clicking again returns the view to wrapped mode and `aria-pressed` becomes `true`

#### Scenario: Choice persists across reloads and navigation

- **WHEN** the user toggles wrap off, then reloads the page or navigates to a different text file
- **THEN** the new view also renders with wrap off
- **AND** `localStorage["explorer.wrap"]` reads `"off"`

#### Scenario: Mobile compactness

- **WHEN** the file viewer is rendered at a viewport width below 800 px and a text file is shown
- **THEN** the wrap toggle occupies the same 32×32 footprint as the Copy-link icon button
- **AND** no text label for the wrap action is visible

#### Scenario: Markdown code blocks unaffected

- **WHEN** the user toggles wrap off and then opens a markdown file containing fenced code blocks
- **THEN** the markdown's fenced code blocks render with their existing wrapping behavior
- **AND** the wrap toggle is not displayed in the header for the markdown view
