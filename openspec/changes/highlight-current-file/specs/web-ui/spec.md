## ADDED Requirements

### Requirement: Tree highlights the active path

In the desktop tree sidebar, when the SPA is at a file or folder URL `/view/<path>`, the tree SHALL reveal the active entry by auto-expanding every ancestor folder of `<path>` and highlighting the active entry itself. The active entry is the leaf at the end of `<path>` when `<path>` is a file, or the folder entry itself when `<path>` is a folder (trailing-slash form).

The auto-expansion SHALL cause the tree to render and load each ancestor level of the active path's folder chain so that the active entry's row is actually present in the tree; ancestor folders that are not yet loaded SHALL be fetched on demand (one folder level per request, as today). The active entry's row SHALL use the tree's active-entry visual treatment (the existing `is-active` styles).

After the active entry's row is rendered, the tree SHALL scroll the active entry into view within the sidebar tree container, so that a deep link brings the active entry to or near the top of the visible panel rather than leaving it off-screen.

Auto-expansion SHALL be reactive across navigation within a session: navigating to a different `/view/<path>` SHALL expand the new path's ancestor chain **without** removing any folder the user has manually expanded, and SHALL expand the new path's ancestors even if a prior navigation (or a manual action) had collapsed one of them. A navigation to a deep link is an explicit "take me here" signal. The user MAY still collapse any ancestor manually; a subsequent navigation that requires that ancestor to be visible SHALL re-expand it. Manually expanded folders that are not on the active path SHALL NOT be collapsed by auto-expansion.

On viewports below 800 CSS pixels, the tree SHALL perform the same auto-expansion, but the mobile drawer SHALL NOT open automatically as a result; the expansion is present when the user opens the drawer.

The auto-expansion SHALL NOT alter the GitHub-style chevron-vs-name affordances: a chevron still toggles a folder inline without navigating, and a folder name still navigates to its listing URL.

#### Scenario: Deep link reveals the file

- **WHEN** the browser navigates directly to `/view/notes/2026/report.md`
- AND `report.md` exists under `notes/2026/`
- **THEN** the tree auto-expands `notes` and `notes/2026`
- AND the `report.md` row is rendered and highlighted with the active-entry treatment
- AND the tree scrolls so the `report.md` row is visible in the sidebar

#### Scenario: Deep link reveals the folder

- **WHEN** the browser navigates directly to `/view/notes/2026/`
- **THEN** the tree auto-expands `notes`
- AND the `2026` folder row is rendered and highlighted

#### Scenario: Navigate between deep files preserves manual expansion

- **WHEN** the user is at `/view/a/b/c.md` and the tree has `a/b` expanded to show `c.md`
- AND the user manually expands a sibling folder `x` that is not on the active path
- AND the user then navigates to `/view/a/b/d.md`
- **THEN** `a/b` is expanded and `d.md` is highlighted and scrolled into view
- AND the manually expanded `x` folder remains expanded

#### Scenario: Navigation re-expands a previously collapsed ancestor

- **WHEN** the user is at `/view/a/b/c.md` with `a/b` expanded
- AND the user manually collapses `a`
- AND the user then navigates to `/view/a/b/e.md`
- **THEN** `a` and `a/b` are expanded again and `e.md` is highlighted

#### Scenario: Mobile reveals without opening the drawer

- **WHEN** the viewport width is below 800 px
- AND the browser navigates directly to `/view/notes/2026/report.md`
- **THEN** the tree has auto-expanded `notes/2026` with `report.md` highlighted
- AND the mobile drawer remains closed

#### Scenario: Auto-expand does not disturb chevron behavior

- **WHEN** the tree has auto-expanded the active path's ancestors
- AND the user clicks the chevron next to an expanded ancestor folder
- **THEN** the folder collapses inline without changing the URL
- AND the active leaf remains highlighted
