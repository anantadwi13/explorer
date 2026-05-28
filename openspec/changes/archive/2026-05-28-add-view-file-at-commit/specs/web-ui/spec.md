## MODIFIED Requirements

### Requirement: SPA file URL renders file viewer

A request to `GET /view/<path>` (file URL, no trailing slash) SHALL serve the SPA shell. The SPA SHALL determine via the API whether the path is a file and, if so, render the file viewer for the appropriate renderer.

The file viewer SHALL display a header containing:

- A back affordance that navigates to the file's parent folder.
- A kind-appropriate icon and the file name.
- A meta line showing the file's mime type, size, and modification time.
- A copy-link affordance that writes the current page URL to the clipboard and surfaces a transient confirmation toast.
- A download affordance that links to the file's `/raw/<path>` URL (or `/raw/<path>?ref=<sha>` when pinned) with a `download` attribute.

The file viewer header SHALL NOT show the pinned-commit short SHA — the indicator lives on the per-file last-commit strip below the header instead (see the `git-reader` capability's "Per-file last-commit strip in the file viewer" requirement for the pinned-variant placement). Keeping the head free of the indicator preserves the head as a stable place for the filename, meta line, and viewer-level actions.

No explicit "Back to working tree" UI affordance is provided. Users escape pinned mode by removing `?ref=` from the URL (address bar, browser back, or by following a link that doesn't carry `ref=`). The strip's pinned pill is purely informational.

When the file viewer's URL includes a `ref=<sha>` query parameter that does not resolve to a commit, the file viewer SHALL render the typed `unknown_ref` error state in the content area. The strip's pinned-state indicator SHALL still render with the user's typed `ref=` value as the displayed short-sha so the user can see what they asked for.

Breadcrumbs in the main toolbar SHALL show ancestor folders ending with a non-clickable segment for the file name. Breadcrumbs SHALL NOT show the pinned commit's SHA — the SHA appears only on the file-last-commit strip's pinned-state indicator.

#### Scenario: Open a file URL

- **WHEN** the browser navigates to `/view/docs/api.md`
- **AND** the file exists under the served root
- **THEN** the SPA renders the file viewer
- **AND** the viewer header shows the file's name with a kind icon, mime, size, and mtime
- **AND** no pinned-state indicator is rendered (because `ref=` is absent)

#### Scenario: File URL points to a folder

- **WHEN** the browser navigates to `/view/docs` (no trailing slash) but `docs` is a folder
- **THEN** the SPA renders the folder listing view (equivalent to navigating to `/view/docs/`)

#### Scenario: Copy link

- **WHEN** the user activates the copy-link affordance in the file viewer header
- **THEN** the SPA writes the current page URL (including any `view=` and `ref=` parameters) to the clipboard
- **AND** a transient toast confirming the copy appears and dismisses automatically

#### Scenario: Download (working tree)

- **WHEN** the user activates the download affordance with no `ref=` parameter present
- **THEN** the browser saves the file via the `/raw/<path>` URL

#### Scenario: Download (pinned)

- **WHEN** the user activates the download affordance with `ref=<full-sha>` present
- **THEN** the browser saves the file via the `/raw/<path>?ref=<full-sha>` URL
- **AND** the saved bytes are the commit-pinned bytes, not the working tree

#### Scenario: Back navigates to parent folder

- **WHEN** the user activates the back affordance in the file viewer header
- **THEN** the SPA navigates to the file's parent folder URL (drops `?view=` and `?ref=` as parent folders carry no such state)

#### Scenario: File head stays clean in pinned mode

- **WHEN** the browser navigates to `/view/docs/api.md?view=preview&ref=abc1234567890abcdef1234567890abcdef12345`
- **THEN** the file head shows the filename, meta line, and viewer-level actions exactly as in working-tree mode
- **AND** no `Viewing at <short-sha>` pill is rendered in the file head
- **AND** no "Back to working tree" button is rendered in the file head
- **AND** the pinned-state indicator + escape affordance instead appear on the per-file last-commit strip below the head
