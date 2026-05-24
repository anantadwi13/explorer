# Capability: Web UI

## Purpose

Everything the React + Vite SPA does — URL routing (`/` and `/view/*` for folder vs file views), responsive layout (split tree+viewer at ≥800px, single-pane below), theme handling, design tokens, keyboard shortcuts, and the file-rendering pipelines for markdown, text (with syntax highlighting), images, and non-previewable fallbacks. The SPA is served as an embedded `embed.FS` bundle by the binary defined in `cli`, fetches data from `http-api`, and follows the URL conventions documented here. The `git-reader` capability layers additional `/git/*` surfaces on top of the same shell.

## Requirements

### Requirement: SPA folder URL renders folder listing

A request to `GET /` or `GET /view/<path>/` (folder URL) SHALL serve the SPA shell. The SPA SHALL fetch `/api/tree?path=<path>` for that folder and render a folder listing view. The view SHALL show breadcrumbs (within the main toolbar) whose segments link to ancestor folder URLs, the directory's direct children sorted folders-first then case-insensitive alphabetical by default, and an indication of empty folders.

The folder listing view SHALL provide:

- A **search input** in the main toolbar that filters the displayed entries by case-insensitive substring match on the entry name. Filtering SHALL be performed client-side over the entries returned by `/api/tree` for the current folder; it SHALL NOT trigger additional API calls and SHALL NOT recurse into subfolders.
- A **list / grid view toggle** in the main toolbar. List view SHALL render entries as rows with name, modified, and size columns. Grid view SHALL render entries as tiles; image entries SHALL display an inline thumbnail sourced from `/raw/<path>` and other entries SHALL display a kind-appropriate icon. The chosen view SHALL persist in `localStorage` under `explorer.view` and SHALL be restored on subsequent loads.
- **Sortable column headers** in list view for name, modified, and size. Activating a header SHALL sort entries by that column ascending; activating the already-active header SHALL toggle the direction. Folders SHALL remain grouped above files in every sort order. The sort selection SHALL be session-only and reset to name-ascending when the path changes.
- An **empty state** visible when the folder has no children, or when the search filter eliminates every entry. The empty state SHALL include a recognisable indicator, a title, and (when filtered) a hint referencing the active query.

#### Scenario: Open root folder URL

- **WHEN** the browser navigates to `/`
- **THEN** the SPA renders a folder listing view of the served root
- **AND** breadcrumbs in the toolbar show the served-root identifier as the only segment

#### Scenario: Open nested folder URL

- **WHEN** the browser navigates to `/view/docs/architecture/`
- **AND** that folder exists under the served root
- **THEN** the SPA renders the listing of `docs/architecture/`
- **AND** breadcrumbs are clickable: `<root>` / `docs` / `architecture`

#### Scenario: Empty folder

- **WHEN** the SPA navigates to a folder URL whose folder has no children
- **THEN** the listing view shows an empty-state indicator instead of an entry list

#### Scenario: Filter with search

- **WHEN** the user types `read` in the toolbar search input on a folder containing `README.md` and `index.html`
- **THEN** only `README.md` is shown
- **AND** no additional `/api/tree` request is issued

#### Scenario: Search with no matches

- **WHEN** the user types a query that matches no entry in the current folder
- **THEN** the empty state appears with a hint referencing the query

#### Scenario: Clear search

- **WHEN** the user clears the search input
- **THEN** the full folder listing is shown again

#### Scenario: Switch to grid view

- **WHEN** the user activates the grid option in the view toggle
- **THEN** the listing renders as tiles
- **AND** image entries display inline thumbnails sourced from `/raw/<path>`
- **AND** subsequent loads of the SPA continue in grid view until the user changes it

#### Scenario: Sort by size descending

- **WHEN** the user clicks the size column header twice
- **THEN** the rows are sorted by size descending
- **AND** folder entries remain above file entries

#### Scenario: Sort resets on navigation

- **WHEN** the user has sorted by size descending in folder A
- **AND** navigates into folder B
- **THEN** folder B renders with the default name-ascending sort

### Requirement: SPA file URL renders file viewer

A request to `GET /view/<path>` (file URL, no trailing slash) SHALL serve the SPA shell. The SPA SHALL determine via the API whether the path is a file and, if so, render the file viewer for the appropriate renderer.

The file viewer SHALL display a header containing:

- A back affordance that navigates to the file's parent folder.
- A kind-appropriate icon and the file name.
- A meta line showing the file's mime type, size, and modification time.
- A copy-link affordance that writes the current page URL to the clipboard and surfaces a transient confirmation toast.
- A download affordance that links to the file's `/raw/<path>` URL with a `download` attribute.

Breadcrumbs in the main toolbar SHALL show ancestor folders ending with a non-clickable segment for the file name.

#### Scenario: Open a file URL

- **WHEN** the browser navigates to `/view/docs/api.md`
- **AND** the file exists under the served root
- **THEN** the SPA renders the file viewer
- **AND** the viewer header shows the file's name with a kind icon, mime, size, and mtime
- **AND** the toolbar breadcrumbs are clickable through ancestor folders

#### Scenario: File URL points to a folder

- **WHEN** the browser navigates to `/view/docs` (no trailing slash) but `docs` is a folder
- **THEN** the SPA renders the folder listing view (equivalent to navigating to `/view/docs/`)

#### Scenario: Copy link

- **WHEN** the user activates the copy-link affordance in the file viewer header
- **THEN** the SPA writes the current page URL to the clipboard
- **AND** a transient toast confirming the copy appears and dismisses automatically

#### Scenario: Download

- **WHEN** the user activates the download affordance in the file viewer header
- **THEN** the browser saves the file via the `/raw/<path>` URL

#### Scenario: Back navigates to parent folder

- **WHEN** the user activates the back affordance in the file viewer header
- **THEN** the SPA navigates to the file's parent folder URL

### Requirement: Markdown rendering

When the file viewer's content is a markdown file (`.md` or `.markdown`), the SPA SHALL render it as GitHub-Flavoured Markdown with HTML output sanitized to remove scripts and unsafe handlers. Relative image references and relative link references SHALL resolve to other files in the served root. The rendered markdown body SHALL apply a constrained reading width and the design's type scale, blockquote, and code-block styling.

Fenced code blocks whose info-string names a registered language (the same set enumerated in the "Text-like file rendering" requirement, plus all standard highlight.js aliases such as `golang`/`go`, `js`/`javascript`, `ts`/`typescript`, `sh`/`bash`, `cs`/`csharp`) SHALL render with syntax-aware token colouring driven by the same theme-aware CSS custom properties. Fenced code blocks without an info-string, or whose info-string names an unregistered language, SHALL render as plain monospace without token colouring (no automatic content-based language detection). Inline `<code>` spans SHALL render as plain monospace.

Sanitisation SHALL allow CSS class names emitted by the highlighter (those matching `^hljs(-[a-z_]+)*$`) on `<code>` and `<span>` elements while continuing to strip arbitrary class names, scripts, and unsafe handlers.

#### Scenario: GFM features render

- **WHEN** the markdown contains GFM tables, task lists, fenced code blocks, or autolinks
- **THEN** they render correctly in the viewer

#### Scenario: Embedded script is sanitized

- **WHEN** the markdown source contains a `<script>` tag
- **THEN** the rendered output does not execute or include the script

#### Scenario: Relative image reference

- **WHEN** the markdown at `/view/docs/architecture.md` contains `![](./diagram.png)`
- **THEN** the rendered HTML contains `<img src="/raw/docs/diagram.png">` (or equivalent root-relative URL)

#### Scenario: Relative markdown link

- **WHEN** the markdown at `/view/docs/index.md` contains `[next](./api.md)`
- **THEN** the rendered HTML contains `<a href="/view/docs/api.md">next</a>`

#### Scenario: Absolute URL passes through

- **WHEN** the markdown contains `[ext](https://example.com)`
- **THEN** the rendered HTML keeps the absolute URL unchanged

#### Scenario: Constrained reading width

- **WHEN** the SPA renders a markdown file in a wide viewport
- **THEN** the body of the markdown is constrained to a comfortable reading width centred in the content region

#### Scenario: Fenced code block with registered language

- **WHEN** the markdown contains a fenced block written as ` ```go ` followed by Go source and ` ``` `
- **THEN** the rendered HTML contains a `<code>` whose children are tokenised spans with class names beginning with `hljs-` (e.g. `hljs-keyword`, `hljs-string`, `hljs-comment`)
- **AND** those spans render with the same theme-aware colours as a standalone Go file in the file viewer

#### Scenario: Fenced code block without info-string

- **WHEN** the markdown contains a fenced block opened with ` ``` ` (no language)
- **THEN** the rendered HTML contains a `<code>` element with the block's text as a plain text node
- **AND** no `hljs-` token spans are added (no auto-detected colouring)

#### Scenario: Fenced code block with unregistered language

- **WHEN** the markdown contains a fenced block opened with ` ```esoteric ` for a language the SPA does not register
- **THEN** the rendered HTML renders the block as plain monospace
- **AND** no `hljs-` token spans are added

#### Scenario: Inline code stays plain

- **WHEN** the markdown contains an inline `` `snippet` ``
- **THEN** the rendered HTML contains a `<code>` whose only child is the literal text
- **AND** no `hljs-` token spans are added

#### Scenario: Sanitisation preserves highlighter classes

- **WHEN** the markdown renderer processes a fenced code block with a registered language
- **THEN** the sanitiser preserves `class` attributes on `<code>` and `<span>` whose values match `^hljs(-[a-z_]+)*$`
- **AND** the sanitiser still strips arbitrary class names, inline event handlers, and `<script>` content from the same document

### Requirement: Text-like file rendering

When the file viewer's content is a text-like file (mime starts with `text/`, or a known code/data extension), the SPA SHALL render it inside a monospace, pre-formatted block. Long lines SHALL wrap so a phone does not need horizontal scroll.

When the file's extension maps to a registered programming-language grammar, the SPA SHALL render the content with syntax-aware token colouring, applying coloured spans to keywords, strings, comments, numbers, types/built-ins, and similar lexical categories. The registered set SHALL cover, at minimum, the following languages:

- **Programming**: Go (`.go`), TypeScript (`.ts`, `.tsx`), JavaScript (`.js`, `.jsx`), Python (`.py`), Ruby (`.rb`), Rust (`.rs`), Bash (`.sh`), C (`.c`, `.h`), C++ (`.cpp`), Java (`.java`), C# (`.cs`), Kotlin (`.kt`, `.kts`), Swift (`.swift`), Scala (`.scala`, `.sc`), Groovy (`.groovy`, `.gradle`), Objective-C (`.m`, `.mm`), F# (`.fs`, `.fsi`, `.fsx`), PHP (`.php`, `.phtml`), Dart (`.dart`), Lua (`.lua`), Perl (`.pl`, `.pm`), PowerShell (`.ps1`, `.psm1`), R (`.r`, `.R`), Haskell (`.hs`, `.lhs`), Elixir (`.ex`, `.exs`), Erlang (`.erl`, `.hrl`), Clojure (`.clj`, `.cljs`, `.cljc`, `.edn`), Julia (`.jl`), Zig (`.zig`).
- **Markup / styling**: HTML (`.html`, `.htm`), XML (`.xml`), CSS (`.css`), SCSS (`.scss`), Markdown (`.md`, `.markdown`).
- **Data / config / query**: YAML (`.yaml`, `.yml`), JSON (`.json`), TOML (`.toml`), SQL (`.sql`), GraphQL (`.graphql`, `.gql`), Protobuf (`.proto`).

The colour palette SHALL be supplied via CSS custom properties keyed on `[data-theme="..."]` so the highlighting follows the active light, dark, or system theme without a flash on load.

When the file's extension does not map to a registered grammar (e.g. `.txt`, `.csv`), the SPA SHALL render the content as plain monospace text without token colouring.

The rendered block SHALL preserve whitespace and SHALL wrap long lines without producing a horizontal scrollbar at any viewport width supported by the SPA.

#### Scenario: Plain text file

- **WHEN** the SPA renders `notes.txt`
- **THEN** the content is shown in a monospace block
- **AND** whitespace is preserved
- **AND** no syntax colours are applied

#### Scenario: Code file with registered grammar

- **WHEN** the SPA renders `src/main.go`
- **THEN** the content is shown in a monospace block
- **AND** Go keywords (e.g. `func`, `return`, `package`), string literals, and comments render with distinct token colours
- **AND** the colours come from theme-aware CSS custom properties (light theme on `[data-theme="light"]`, dark theme on `[data-theme="dark"]`)

#### Scenario: Code file in TypeScript

- **WHEN** the SPA renders `web/src/App.tsx`
- **THEN** the content is shown in a monospace block with TypeScript token colouring
- **AND** JSX tags, attributes, and embedded expressions are visually distinguishable from surrounding code

#### Scenario: Code file in a JVM language

- **WHEN** the SPA renders `MainActivity.kt` (or `App.scala`, `Service.java`, `build.gradle`)
- **THEN** the content is shown in a monospace block with the corresponding language's token colouring
- **AND** keywords, types, and string literals are visually distinguishable from comments

#### Scenario: Code file in a scripting language

- **WHEN** the SPA renders `script.lua` (or `app.rb`, `setup.pl`, `deploy.ps1`)
- **THEN** the content is shown in a monospace block with the corresponding language's token colouring

#### Scenario: JSON file

- **WHEN** the SPA renders `package.json`
- **THEN** the content is shown in a monospace block with JSON token colouring
- **AND** object keys, string literals, numbers, and booleans render as visually distinct tokens

#### Scenario: TOML file

- **WHEN** the SPA renders `Cargo.toml` (or `pyproject.toml`)
- **THEN** the content is shown in a monospace block with token colouring
- **AND** `[section]` headers, `key = value` pairs, string literals, and comments render as visually distinct tokens
- **AND** any TOML constructs not represented by the underlying grammar (e.g. inline tables) still render legibly, falling back to default text colour

#### Scenario: Text-like file with no registered grammar

- **WHEN** the SPA renders `data.csv` (or any `.txt` file)
- **THEN** the content is shown in a plain monospace block
- **AND** no token colours are applied
- **AND** the block wraps long lines exactly as a `.txt` file would

#### Scenario: Long lines on narrow viewport

- **WHEN** the file contains lines wider than the viewport
- **THEN** lines wrap inside the block rather than producing a horizontal scrollbar
- **AND** wrapping behaviour is identical regardless of whether the file is highlighted or rendered plain

#### Scenario: Theme switch updates token colours

- **WHEN** a code file is being viewed under `[data-theme="light"]`
- **AND** the user switches the theme to dark via the settings menu
- **THEN** the token colours update to the dark palette without re-fetching the file or re-mounting the viewer

### Requirement: Image rendering

When the file viewer's content is an image (`image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml`), the SPA SHALL render an inline `<img>` whose source is `/raw/<path>` for that file.

#### Scenario: Open a PNG file

- **WHEN** the SPA renders `images/logo.png`
- **THEN** the viewer contains `<img src="/raw/images/logo.png">`
- **AND** the image loads from the `/raw/` endpoint

#### Scenario: SVG image

- **WHEN** the SPA renders an `.svg` file
- **THEN** the viewer renders it via an `<img>` element pointing at `/raw/<path>` (not by inlining the SVG markup)

### Requirement: Non-previewable file fallback

When the file viewer's file is not in a previewable category (e.g. archives, executables, video, audio, PDFs, Office documents, or any binary mime), the SPA SHALL render a "Not previewable" placeholder containing the filename, size, and a Download button. The Download button SHALL be `<a href="/raw/<path>" download="<filename>">` so the browser saves the bytes from `/raw/`.

#### Scenario: ZIP archive

- **WHEN** the SPA navigates to `/view/release.zip`
- **THEN** the viewer shows a "Not previewable" placeholder with the file name and size
- **AND** the placeholder includes a Download button linking to `/raw/release.zip` with a `download="release.zip"` attribute

#### Scenario: PDF

- **WHEN** the SPA navigates to `/view/spec.pdf`
- **THEN** the viewer shows the same "Not previewable" placeholder + Download button
- **AND** does NOT attempt to render the PDF inline

### Requirement: Inline render size cap falls through to non-previewable

When a markdown or text-like file exceeds the inline render size cap (5 MiB), the SPA SHALL render the same "Not previewable" placeholder + Download button as for non-previewable files, with a message indicating the file is too large to preview inline. The cap is enforced client-side: the SPA reads `meta.size` from the `/api/meta` response (or `entry.size` from `/api/tree` when navigating from a listing) and SHALL skip the `/raw/<path>` content fetch when the size exceeds 5 MiB.

When the SPA fetches `/raw/<path>` for a markdown or text-like file and the bytes are not valid UTF-8, the SPA SHALL render the same "Not previewable" placeholder with a message indicating the file is binary or not valid text. UTF-8 validation is performed client-side using `TextDecoder('utf-8', {fatal: true})`.

#### Scenario: Oversized markdown

- **WHEN** the SPA navigates to `/view/huge-notes.md`
- **AND** the file size (per `/api/meta` or `/api/tree`) is greater than 5 MiB
- **THEN** the SPA does NOT issue a `/raw/huge-notes.md` request
- **AND** the viewer shows the "Not previewable" placeholder
- **AND** the message indicates the cause is the file size cap
- **AND** the Download button links to `/raw/huge-notes.md`

#### Scenario: Non-UTF-8 file with text-like MIME

- **WHEN** the SPA navigates to `/view/corrupt.txt`
- **AND** the file's MIME classifies as `text` but the bytes are not valid UTF-8
- **THEN** the SPA fetches `/raw/corrupt.txt` and attempts UTF-8 decoding
- **AND** the decoder throws (fatal mode)
- **AND** the viewer shows the "Not previewable" placeholder
- **AND** the message indicates the file is binary or not valid text
- **AND** the Download button links to `/raw/corrupt.txt`

### Requirement: SPA layout adapts to viewport

The SPA SHALL render a single-view layout below 800 CSS pixels of viewport width and a split tree-and-viewer layout at and above 800 CSS pixels. The application root SHALL occupy the full viewport (`100vh`) and SHALL NOT page-scroll; scrolling SHALL occur inside the sidebar tree and the main content region independently. Touch targets SHALL be at least 44×44 CSS pixels. The SPA SHALL NOT rely on hover-only affordances for any interaction reachable on mobile.

At and above 800 px, the SPA SHALL render a two-column layout:

- A **sidebar** containing the brand identifier and the lazy folder tree.
- A **main pane** containing a single toolbar (breadcrumbs, search input, view toggle, settings menu) above the content region (folder listing or file viewer).

Below 800 px, the SPA SHALL render a single-column layout with a top bar containing the brand and a theme toggle. The sidebar SHALL be hidden by default and SHALL open as an overlay drawer with a scrim when the user activates the top-bar menu affordance; activating the scrim or the drawer's close affordance SHALL close it.

Below 800 px, the folder listing's modified column SHALL be hidden, the search input SHALL occupy the full toolbar width on its own row, and the file detail header's secondary actions (copy-link, download) SHALL collapse to icon-only buttons.

#### Scenario: Mobile listing view

- **WHEN** the viewport width is below 800 px
- **AND** the SPA is at a folder URL
- **THEN** the SPA shows the folder listing as the primary view
- **AND** the sidebar is not displayed

#### Scenario: Mobile viewer view

- **WHEN** the viewport width is below 800 px
- **AND** the SPA is at a file URL
- **THEN** the SPA shows the file viewer as the primary view

#### Scenario: Desktop split layout

- **WHEN** the viewport width is at or above 800 px
- **THEN** the SPA shows the sidebar on the left and the listing or viewer on the right at the same time

#### Scenario: Mobile drawer open

- **WHEN** the viewport width is below 800 px
- **AND** the user activates the top-bar menu affordance
- **THEN** the sidebar slides in as an overlay
- **AND** a scrim covers the rest of the viewport

#### Scenario: Mobile drawer dismiss

- **WHEN** the sidebar is open as an overlay
- **AND** the user activates the scrim or the drawer's close affordance
- **THEN** the sidebar closes

#### Scenario: Locked viewport on long content

- **WHEN** the user opens a long markdown file at a viewport size at or above 800 px
- **THEN** the toolbar remains pinned at the top of the main pane
- **AND** scrolling occurs inside the content region rather than the page

### Requirement: Desktop tree behaves GitHub-style

In the desktop tree sidebar, each folder row SHALL expose two distinct affordances: a chevron icon that toggles the expand/collapse state of the folder inline without navigating, and a folder name that, when clicked, navigates to that folder's listing URL.

#### Scenario: Click chevron expands inline

- **WHEN** the user clicks the chevron next to a folder name in the tree
- **THEN** the folder's children expand inline below it
- **AND** the URL does not change

#### Scenario: Click name navigates

- **WHEN** the user clicks the folder name in the tree
- **THEN** the URL changes to that folder's listing URL
- **AND** the right-hand viewer renders the folder listing

### Requirement: Theme handling

The SPA SHALL default to the user's system colour scheme via `prefers-color-scheme`. The SPA SHALL provide a manual theme toggle (light / dark / system) and a manual density toggle (compact / regular / comfy). Both selections SHALL persist in `localStorage` (`explorer.theme` and `explorer.density` respectively). On load, the SPA SHALL apply the persisted (or system-derived) theme and the persisted (or default) density before initial paint to avoid a flash of the wrong theme or row height.

The default density SHALL be `regular`. Density SHALL drive the row height and content padding via CSS custom properties.

#### Scenario: First load with system dark

- **WHEN** the user opens the SPA for the first time
- **AND** the OS reports `prefers-color-scheme: dark`
- **THEN** the SPA renders in dark theme

#### Scenario: User toggles to light

- **WHEN** the user opens the settings menu and selects light
- **THEN** the SPA renders in light theme
- **AND** subsequent reloads continue to render in light theme until the user changes it

#### Scenario: User selects "system"

- **WHEN** the user selects the "system" option in the settings menu theme toggle
- **THEN** subsequent reloads follow `prefers-color-scheme` again
- **AND** changing the OS theme is reflected without manual reload (or on next reload, at minimum)

#### Scenario: User selects compact density

- **WHEN** the user selects the compact density option in the settings menu
- **THEN** folder rows render with reduced height
- **AND** content padding is reduced
- **AND** subsequent reloads continue to render compact until the user changes it

#### Scenario: Default density on first load

- **WHEN** the user opens the SPA for the first time
- **THEN** the SPA renders with the regular density

#### Scenario: No flash on load

- **WHEN** the SPA loads with a non-default persisted theme or density
- **THEN** the initial paint already uses the persisted theme and density (no visible flash from default to chosen)

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

### Requirement: Keyboard shortcuts for navigation and search

The SPA SHALL provide keyboard shortcuts to focus the toolbar search, dismiss the search or return from a file viewer to its folder, and navigate to the parent folder. Shortcuts SHALL NOT activate while the user is typing in an input, textarea, or content-editable element.

These shortcuts apply on web-ui routes only — `/` and `/view/*` (folder and file URLs). On `/git/*` routes, the keyboard shortcuts defined by the git-reader capability apply instead and the rules below SHALL NOT fire. The "inert when typing in an input/textarea/content-editable" rule is shared across both capabilities.

- Pressing `/` on a web-ui route SHALL move keyboard focus to the toolbar search input.
- Pressing `Escape` on a web-ui route SHALL clear the search input if it has a value; otherwise, if the user is viewing a file, it SHALL navigate to the file's parent folder.
- Pressing `Backspace` on a web-ui route (when no field is focused and the SPA is not viewing a file) SHALL navigate to the parent folder of the current path. The SPA SHALL prevent the browser default of navigating back in history when this shortcut applies.

#### Scenario: Slash focuses search

- **WHEN** the user is on a folder view (`/` or `/view/<path>/`) with no input focused
- **AND** presses `/`
- **THEN** the toolbar search input gains keyboard focus
- **AND** the browser does not insert a `/` character anywhere

#### Scenario: Slash is inert while typing

- **WHEN** the user is typing in any input
- **AND** presses `/`
- **THEN** the keystroke is delivered to the input as a normal character
- **AND** focus does not move

#### Scenario: Escape clears search

- **WHEN** the user is on a web-ui route
- **AND** the toolbar search input contains text
- **AND** the user presses `Escape`
- **THEN** the search input becomes empty
- **AND** the listing returns to its unfiltered state

#### Scenario: Escape returns from file to folder

- **WHEN** the SPA is on a file URL (`/view/<path>`) with no search active
- **AND** the user presses `Escape`
- **THEN** the SPA navigates to the file's parent folder

#### Scenario: Backspace navigates up from a folder

- **WHEN** the SPA is on a non-root folder URL (`/view/<path>/`) with no field focused
- **AND** the user presses `Backspace`
- **THEN** the SPA navigates to the parent folder
- **AND** the browser does not navigate back in history

#### Scenario: Backspace inert at root

- **WHEN** the SPA is on the root folder URL (`/`) with no field focused
- **AND** the user presses `Backspace`
- **THEN** the SPA does not change route

#### Scenario: Directory-browser shortcuts do not fire on git routes

- **WHEN** the SPA is on any `/git/*` route with no field focused
- **AND** the user presses `/`, `Escape`, or `Backspace`
- **THEN** the web-ui shortcut handlers above do NOT fire
- **AND** the git-reader capability's keyboard rules govern the behaviour instead

### Requirement: Deep-linkable folder and file URLs

Every folder and every file under the served root SHALL be addressable by a stable URL of the form `/view/<path>/` (folder) or `/view/<path>` (file), and the SPA SHALL restore the corresponding view when such a URL is opened directly.

#### Scenario: Bookmark a file URL

- **WHEN** the user bookmarks `http://127.0.0.1:8080/view/docs/api.md`
- **AND** later opens the bookmark
- **THEN** the SPA renders the file viewer for `docs/api.md`

#### Scenario: Bookmark a folder URL

- **WHEN** the user bookmarks `http://127.0.0.1:8080/view/docs/`
- **AND** later opens the bookmark
- **THEN** the SPA renders the folder listing for `docs`

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
