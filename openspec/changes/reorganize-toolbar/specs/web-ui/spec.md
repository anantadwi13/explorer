## MODIFIED Requirements

### Requirement: SPA layout adapts to viewport

The SPA SHALL render a single-view layout below 800 CSS pixels of viewport width and a split tree-and-viewer layout at and above 800 CSS pixels. The application root SHALL occupy the full viewport (`100vh`) and SHALL NOT page-scroll; scrolling SHALL occur inside the sidebar tree and the main content region independently. Touch targets SHALL be at least 44×44 CSS pixels. The SPA SHALL NOT rely on hover-only affordances for any interaction reachable on mobile.

At and above 800 px, the SPA SHALL render a two-column layout:

- A **sidebar** containing the brand identifier and the lazy folder tree.
- A **main pane** containing a two-row toolbar above the content region (folder listing or file viewer):
  - A **controls row** that is right-aligned and contains, in order: the branch picker, the changes badge, the search input, and the settings menu.
  - A **path row** beneath the controls row that contains the breadcrumb path and no other controls.

Below 800 px, the SPA SHALL render a single-column layout with a top bar containing, in order: the drawer menu affordance, the brand identifier, and the settings menu. The top bar SHALL NOT expose a standalone theme toggle; theme selection is reachable through the settings menu. The sidebar SHALL be hidden by default and SHALL open as an overlay drawer with a scrim when the user activates the top-bar menu affordance; activating the scrim or the drawer's close affordance SHALL close it. The mobile drawer header SHALL continue to host the branch picker and the changes badge (these do not appear in the mobile top bar or the mobile toolbar).

Below 800 px, the main pane SHALL render a single toolbar row containing the breadcrumb path; the controls-row members are placed elsewhere (settings menu in the top bar; branch picker and changes badge in the drawer header). The folder listing's modified column SHALL be hidden, the search input SHALL occupy the full toolbar width on its own row directly above the breadcrumbs (immediately below the top bar), and the file detail header's secondary actions (copy-link, download) SHALL collapse to icon-only buttons.

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

#### Scenario: Desktop toolbar splits into controls and path rows

- **WHEN** the viewport width is at or above 800 px
- **THEN** the main pane shows a controls row at the top of the toolbar containing the branch picker, the changes badge, the search input, and the settings menu, right-aligned
- **AND** the controls row sits above a path row that contains the breadcrumb path alone

#### Scenario: Mobile top bar exposes settings in the top-right slot

- **WHEN** the viewport width is below 800 px
- **THEN** the top bar shows the drawer menu affordance at the leading edge, the brand identifier centered, and the settings menu at the trailing edge
- **AND** the top bar does not render a standalone theme toggle button

#### Scenario: Mobile drawer open

- **WHEN** the viewport width is below 800 px
- **AND** the user activates the top-bar menu affordance
- **THEN** the sidebar slides in as an overlay
- **AND** a scrim covers the rest of the viewport
- **AND** the drawer header shows the branch picker and the changes badge

#### Scenario: Mobile drawer dismiss

- **WHEN** the sidebar is open as an overlay
- **AND** the user activates the scrim or the drawer's close affordance
- **THEN** the sidebar closes

#### Scenario: Locked viewport on long content

- **WHEN** the user opens a long markdown file at a viewport size at or above 800 px
- **THEN** the toolbar remains pinned at the top of the main pane
- **AND** scrolling occurs inside the content region rather than the page

## ADDED Requirements

### Requirement: Settings popover hosts all global preferences

The SPA SHALL expose a single Settings popover as the only entry point to user-adjustable global preferences. The popover SHALL be opened by activating the settings menu affordance (located in the desktop toolbar controls row and in the mobile top bar's trailing slot). The popover SHALL contain three sections, in this order: **Theme** (light / dark / system), **Density** (compact / regular / comfy), and **View** (list / grid). All three sections SHALL be visible whenever the popover is open, regardless of the current route, because each row controls a global preference that persists across navigations.

Selecting an option in any section SHALL immediately apply the selection and persist it under the existing storage keys (`explorer.theme`, `explorer.density`, `explorer.view`). The popover SHALL close on `Escape` and on a click or tap outside the popover.

The SPA SHALL NOT render any of these three preference controls as standalone toolbar or top-bar affordances; the popover is the single home for them.

#### Scenario: Popover lists Theme, Density, and View

- **WHEN** the user activates the settings menu affordance
- **THEN** the popover opens
- **AND** the popover contains three sections labelled "Theme", "Density", and "View" in that order

#### Scenario: View row visible on a file route

- **WHEN** the SPA is at a file URL (e.g. `/view/docs/api.md`)
- **AND** the user opens the settings popover
- **THEN** the View section is visible and interactive
- **AND** selecting "Grid" persists the choice so the next folder listing renders as a grid

#### Scenario: View row visible on a git route

- **WHEN** the SPA is at a git route (`/git` or `/git/*`)
- **AND** the user opens the settings popover
- **THEN** the View section is visible and interactive

#### Scenario: Selecting a theme persists across reloads

- **WHEN** the user opens the settings popover and selects "Dark" under Theme
- **THEN** the SPA applies the dark theme immediately
- **AND** subsequent reloads render in the dark theme until the user changes it

#### Scenario: No standalone view toggle in the toolbar

- **WHEN** the viewport width is at or above 800 px
- **AND** the SPA is at a folder URL
- **THEN** the desktop toolbar does NOT render a standalone view toggle outside the settings popover

#### Scenario: No standalone theme toggle in the mobile top bar

- **WHEN** the viewport width is below 800 px
- **THEN** the mobile top bar does NOT render a standalone theme toggle button

### Requirement: Settings popover does not overflow the viewport

The Settings popover SHALL be positioned so that its rendered box is fully contained within the viewport horizontally at every supported viewport width. The popover's right edge SHALL be anchored to (or inside) the right edge of its trigger button. The popover SHALL declare a `max-width` no greater than the viewport width minus a small gutter on each side, and SHALL declare a `min-width` that does not exceed that `max-width` on tiny viewports. The popover SHALL remain at least partially scrollable or shrinkable if its natural content would otherwise force it past the left edge of the viewport.

#### Scenario: Popover stays inside the viewport on a narrow phone

- **WHEN** the viewport width is 320 CSS pixels
- **AND** the user activates the settings menu affordance from the mobile top bar
- **THEN** the popover renders with its left edge at or inside the left edge of the viewport
- **AND** the popover renders with its right edge at or inside the right edge of the viewport

#### Scenario: Popover does not extend past the left edge on small screens

- **WHEN** the viewport width is below 800 px
- **AND** the user opens the settings popover
- **THEN** the entire popover, including all three preference sections, is reachable by tapping inside the visible viewport
- **AND** no part of the popover is clipped or rendered outside the visible viewport on the left side
