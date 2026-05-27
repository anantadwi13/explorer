## MODIFIED Requirements

### Requirement: File reader wrap toggle

The SPA file viewer SHALL expose a wrap toggle whose visibility depends on the **active tab** in the file viewer's tablist (see `git-reader` capability, "Code and Blame tabs in the file viewer"):

- When the active tab is `code` or `blame`, the wrap toggle SHALL be rendered in the file viewer's header actions area.
- When the active tab is `preview` (markdown only), the wrap toggle SHALL NOT be rendered.
- When the file viewer renders a kind with no tablist (`image`, non-previewable, or error state), the wrap toggle SHALL NOT be rendered.

The toggle controls whether long lines wrap to fit the viewport (wrap on) or extend to their natural width and become horizontally scrollable inside the code block (wrap off). Markdown fenced code blocks rendered inside the Preview tab SHALL retain their existing wrap behavior and SHALL NOT be affected by the toggle.

The default state SHALL be wrap **on**, matching prior behavior. The user's choice SHALL persist in `localStorage` under the key `explorer.wrap` with values `"on"` or `"off"`; an absent or unrecognized value SHALL be treated as `"on"`. The persisted value SHALL apply across page reloads, navigation between files, the layout split-vs-stacked breakpoint, and tab switches between Code and Blame.

The toggle SHALL be a single icon button with a 32×32 px visible footprint at all viewport widths, sized identically to the existing Copy-link icon button (matching the project's shared `.icon-btn` shape). On viewports `< 800px` the toggle SHALL NOT render any text label. Its current state SHALL be exposed assistively via `aria-pressed` (true when wrap is on — the button represents an active wrap-lines action and is "engaged" while wrap is enabled), and a descriptive `aria-label` and `title` SHALL be provided ("Wrap lines: on" / "Wrap lines: off" or equivalent).

When wrap is **off**, the standalone code block SHALL render with `white-space: pre` and a horizontal scrollbar local to the code block (the page itself SHALL NOT scroll horizontally as a result). When wrap is **on**, the code block SHALL render exactly as it does today (`white-space: pre-wrap` with break-on-anywhere word breaks).

#### Scenario: Toggle visible for text files

- **WHEN** the file viewer renders a file whose `kind` is `text` (default Code tab active)
- **THEN** a wrap toggle button is present in the file viewer's header actions area

#### Scenario: Toggle visible on markdown Code tab

- **WHEN** the file viewer renders a `markdown` file
- **AND** the user activates the Code tab
- **THEN** the wrap toggle is present in the file viewer's header actions area

#### Scenario: Toggle visible on markdown Blame tab

- **WHEN** the file viewer renders a `markdown` file
- **AND** the user activates the Blame tab
- **THEN** the wrap toggle is present in the file viewer's header actions area

#### Scenario: Toggle hidden on markdown Preview tab

- **WHEN** the file viewer renders a `markdown` file with the Preview tab active (default)
- **THEN** the wrap toggle is NOT rendered in the file viewer's header actions area

#### Scenario: Toggle hidden on non-tab kinds

- **WHEN** the file viewer renders an `image`, non-previewable, or errored file
- **THEN** the wrap toggle is NOT rendered

#### Scenario: Default is wrap on

- **WHEN** a user with no prior `explorer.wrap` value in `localStorage` opens any text or markdown file in a tab where the toggle is visible
- **THEN** the code block is rendered with lines wrapped to fit the viewport
- **AND** the toggle's `aria-pressed` is `true`

#### Scenario: Toggling switches wrap mode

- **WHEN** the user clicks the wrap toggle while viewing a text file (or markdown Code/Blame tab) in wrap-on state
- **THEN** the code block re-renders with `white-space: pre` (no wrapping)
- **AND** lines longer than the viewport produce a horizontal scrollbar inside the code block, not on the page
- **AND** the toggle's `aria-pressed` becomes `false`
- **AND** clicking again returns the view to wrapped mode and `aria-pressed` becomes `true`

#### Scenario: Choice persists across reloads, navigation, and tab switches

- **WHEN** the user toggles wrap off on a markdown Code tab, then switches to the Blame tab, reloads the page, or navigates to a text file
- **THEN** the new view also renders with wrap off (wherever the wrap toggle applies)
- **AND** `localStorage["explorer.wrap"]` reads `"off"`

#### Scenario: Mobile compactness

- **WHEN** the file viewer is rendered at a viewport width below 800 px in a tab where the wrap toggle is visible
- **THEN** the wrap toggle occupies the same 32×32 footprint as the Copy-link icon button
- **AND** no text label for the wrap action is visible

#### Scenario: Markdown fenced code blocks unaffected by the toggle

- **WHEN** the user toggles wrap off and then views the Preview tab of a markdown file containing fenced code blocks
- **THEN** the markdown's fenced code blocks render with their existing wrapping behavior (independent of the toggle)
- **AND** the wrap toggle is not displayed in the header for the Preview tab
