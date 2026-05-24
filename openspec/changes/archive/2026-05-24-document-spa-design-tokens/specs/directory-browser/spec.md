## ADDED Requirements

### Requirement: SPA design tokens

The SPA SHALL paint all chrome (toolbar, breadcrumbs, sidebar, folder listing, settings popover, file viewer chrome, badges, cards, dialogs, focus rings, and any future surface) using a documented set of CSS custom properties whose canonical declarations live in `web/src/index.css`. The vocabulary SHALL be:

| Token | Role |
|---|---|
| `--bg` | Page background |
| `--bg-soft` | Subtle recessed surface (e.g. inset code blocks, hunk bodies) |
| `--bg-panel` | Elevated surface (popovers, cards, dialogs) |
| `--fg` | Default foreground text |
| `--fg-muted` | Secondary text (meta, captions, hover borders) |
| `--fg-faint` | Tertiary text (placeholders, disabled) |
| `--line` | Default border / divider colour |
| `--line-soft` | Subtle divider |
| `--hover` | Hover/active background tint |
| `--active` | Pressed / selected background tint |
| `--accent` | Brand accent colour |
| `--accent-fg` | Foreground used on top of `--accent` |
| `--shadow` | Standard elevation shadow |
| `--radius` | Default corner radius |
| `--radius-lg` | Larger corner radius (cards, dialogs) |
| `--row-h` | List/row height (driven by density) |
| `--content-pad` | Content padding (driven by density) |
| `--font-sans` | Default sans-serif font stack |
| `--font-mono` | Default monospace font stack |

Every token in this vocabulary whose value differs between light and dark themes (the colour tokens above the `--shadow` row in the table) SHALL be redeclared under both `[data-theme="light"]` and `[data-theme="dark"]` in `web/src/index.css` with values appropriate to the theme, so the active theme drives the rendered colour without a flash on load (see "Theme handling" requirement). Theme-invariant tokens (geometry: `--radius`, `--radius-lg`, `--row-h`, `--content-pad`; typography: `--font-sans`, `--font-mono`; brand colour: `--accent`, `--accent-fg`) MAY be declared once at `:root` and are not required to be redeclared per theme.

Component CSS SHALL reference these tokens via `var(--token-name)` (without a hardcoded fallback that masks an undeclared token name). Component CSS SHALL NOT introduce parallel ad-hoc token names for the same role via `var(--newname, <hardcoded-fallback>)`; such patterns silently fall back to the hardcoded value when the name is undeclared, which has historically rendered as invisible text in one of the two themes.

If a genuinely new design role appears that the existing vocabulary cannot express, the new token SHALL be added to the central declaration in `web/src/index.css` with both light and dark variants, and SHALL be added to the vocabulary table above in the same change.

Other themed properties used by the SPA — syntax-highlighting token colours (`--code-*` in `web/src/styles/syntax.css`) and diff-line tints (`--color-diff-*` in `web/src/styles/syntax.css`) — are governed by their own existing requirements ("Syntax highlighting", `git-reader` "Diff rendering rules") and are not enumerated above. They follow the same `[data-theme]` pattern.

#### Scenario: Chrome surface uses the documented vocabulary

- **WHEN** a contributor adds a new SPA component that paints any chrome (background, border, foreground, padding, radius, font family)
- **THEN** the component's CSS uses one of the tokens listed in the vocabulary above
- **AND** the CSS does NOT introduce a new token name via inline `var(--newname, <fallback>)`

#### Scenario: Theme switch updates every chrome surface

- **WHEN** the user switches the theme from light to dark via the settings menu
- **THEN** every chrome surface in the SPA — including toolbar, sidebar, popovers, badges, and cards — re-renders with the dark-theme values of the vocabulary tokens
- **AND** no chrome surface retains light-theme colours due to a hardcoded value

#### Scenario: A new design role requires a new token

- **WHEN** a new chrome role appears that no existing token expresses (e.g. an overlay scrim colour)
- **THEN** the new token is added to `web/src/index.css` under `:root`, `[data-theme="light"]`, and `[data-theme="dark"]`
- **AND** the new token is added to the vocabulary table in this requirement in the same change

#### Scenario: Undocumented tokens are rejected by review

- **WHEN** a pull request introduces `var(--bg-1, #1a1a1a)` or similar undeclared-token reference with a hardcoded fallback
- **THEN** code review rejects the pattern and asks the contributor to use the documented vocabulary (or add the new token to the central declaration)
