## MODIFIED Requirements

### Requirement: Keyboard shortcuts for navigation and search

The SPA SHALL provide keyboard shortcuts to focus the toolbar search, dismiss the search or return from a file viewer to its folder, and navigate to the parent folder. Shortcuts SHALL NOT activate while the user is typing in an input, textarea, or content-editable element.

These shortcuts apply on directory-browser routes only — `/` and `/view/*` (folder and file URLs). On `/git/*` routes, the keyboard shortcuts defined by the git-reader capability apply instead and the rules below SHALL NOT fire. The "inert when typing in an input/textarea/content-editable" rule is shared across both capabilities.

- Pressing `/` on a directory-browser route SHALL move keyboard focus to the toolbar search input.
- Pressing `Escape` on a directory-browser route SHALL clear the search input if it has a value; otherwise, if the user is viewing a file, it SHALL navigate to the file's parent folder.
- Pressing `Backspace` on a directory-browser route (when no field is focused and the SPA is not viewing a file) SHALL navigate to the parent folder of the current path. The SPA SHALL prevent the browser default of navigating back in history when this shortcut applies.

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

- **WHEN** the user is on a directory-browser route
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
- **THEN** the directory-browser shortcut handlers above do NOT fire
- **AND** the git-reader capability's keyboard rules govern the behaviour instead
