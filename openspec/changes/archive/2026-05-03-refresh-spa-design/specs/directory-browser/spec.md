## MODIFIED Requirements

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

### Requirement: Markdown rendering

When the file viewer's content is a markdown file (`.md` or `.markdown`), the SPA SHALL render it as GitHub-Flavoured Markdown with HTML output sanitized to remove scripts and unsafe handlers. Relative image references and relative link references SHALL resolve to other files in the served root. The rendered markdown body SHALL apply a constrained reading width and the design's type scale, blockquote, and code-block styling.

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

## ADDED Requirements

### Requirement: Keyboard shortcuts for navigation and search

The SPA SHALL provide keyboard shortcuts to focus the toolbar search, dismiss the search or return from a file viewer to its folder, and navigate to the parent folder. Shortcuts SHALL NOT activate while the user is typing in an input, textarea, or content-editable element.

- Pressing `/` from a folder view SHALL move keyboard focus to the toolbar search input.
- Pressing `Escape` SHALL clear the search input if it has a value; otherwise, if the user is viewing a file, it SHALL navigate to the file's parent folder.
- Pressing `Backspace` (when no field is focused and the SPA is not viewing a file) SHALL navigate to the parent folder of the current path. The SPA SHALL prevent the browser default of navigating back in history when this shortcut applies.

#### Scenario: Slash focuses search

- **WHEN** the user is on a folder view with no input focused
- **AND** presses `/`
- **THEN** the toolbar search input gains keyboard focus
- **AND** the browser does not insert a `/` character anywhere

#### Scenario: Slash is inert while typing

- **WHEN** the user is typing in any input
- **AND** presses `/`
- **THEN** the keystroke is delivered to the input as a normal character
- **AND** focus does not move

#### Scenario: Escape clears search

- **WHEN** the toolbar search input contains text
- **AND** the user presses `Escape`
- **THEN** the search input becomes empty
- **AND** the listing returns to its unfiltered state

#### Scenario: Escape returns from file to folder

- **WHEN** the SPA is on a file URL with no search active
- **AND** the user presses `Escape`
- **THEN** the SPA navigates to the file's parent folder

#### Scenario: Backspace navigates up from a folder

- **WHEN** the SPA is on a non-root folder URL with no field focused
- **AND** the user presses `Backspace`
- **THEN** the SPA navigates to the parent folder
- **AND** the browser does not navigate back in history

#### Scenario: Backspace inert at root

- **WHEN** the SPA is on the root folder URL with no field focused
- **AND** the user presses `Backspace`
- **THEN** the SPA does not change route
