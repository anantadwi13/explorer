## MODIFIED Requirements

### Requirement: Code and Blame tabs in the file viewer

For files whose preview kind is `text` (i.e. `kind === 'text'` in the `meta` response), the file viewer SHALL render a tablist above the content area with two tabs: "Code" and "Blame". For files whose preview kind is `markdown` (i.e. `kind === 'markdown'`), the file viewer SHALL render a tablist with three tabs: "Preview", "Code", and "Blame". For image and non-previewable files, the tablist SHALL NOT render.

The active tab SHALL be reflected in the URL via a `view` query parameter whose value SHALL be one of `preview`, `code`, or `blame`. The SPA SHALL **always emit an explicit `view=` parameter** whenever it writes the URL after a tab interaction (i.e. the SPA SHALL NOT delete the parameter when activating the kind's default tab). On read, the SPA SHALL **tolerate** an absent or unrecognised `view=` value and fall back to the kind's natural default:

- `markdown` → default tab is `preview`
- `text` → default tab is `code`
- `image` / non-previewable → no tablist; `view=` has no effect

When `view=` carries a value that is valid in the union but not available for the active file kind (e.g. `view=preview` on a `text` file, `view=code` on an `image` file, `view=blame` on an `image` file), the SPA SHALL fall back to the kind's natural default with no error. The URL parameter retains its written value; the SPA does not rewrite it.

Activating a tab SHALL update the URL via the SPA router (no page reload) using `replace: true` so tab toggles do not pile up browser history entries. Reloading the page with any valid `view=` value present SHALL restore the corresponding tab on first paint.

The tablist SHALL follow standard ARIA tab-pattern semantics: `role="tablist"` on the container, `role="tab"` on each button, `aria-selected` on the active tab, left/right arrow keys move the active tab, Home/End jump to first/last. Keyboard navigation SHALL work uniformly for both the two-tab and three-tab variants.

The content-area container's CSS class SHALL follow the **active renderer**, not the file kind, so the markdown Code and Blame tabs reuse the same panel chrome (background, border, rounded corners) the text Code and Blame tabs have always had. Specifically, when the active renderer is `<CodeBlock>` or `<BlameView>` (text Code/Blame OR markdown Code/Blame), the container SHALL carry the `vw-text` class. When the active renderer is `<MarkdownRenderer>` (markdown Preview), the container SHALL carry `vw-markdown` (markdown supplies its own `.md-body` chrome). When the renderer is the image preview, the container SHALL carry `vw-image`.

The `at` query parameter is RESERVED in this URL grammar for a future "view file at commit" capability and SHALL be ignored by the current implementation — the SPA SHALL NOT read it on parse and SHALL NOT emit it on tab activations. However, when an inbound URL already carries an `at=` value (e.g. a user typed it or pasted a forward-looking link), the SPA SHALL preserve the parameter unchanged on subsequent tab writes rather than stripping it. This matches the "tolerant parse, generation-explicit" posture used for `view=` itself, and means the URL stays forward-compatible with the future change without the SPA actively suppressing it.

#### Scenario: Tabs render for text files

- **WHEN** the file viewer renders `/view/internal/server/api.go` (`kind === 'text'`)
- **THEN** a tablist with Code and Blame tabs appears above the content area
- **AND** the Code tab is the default active tab

#### Scenario: Tabs render for markdown files

- **WHEN** the file viewer renders `/view/README.md` (`kind === 'markdown'`)
- **THEN** a tablist with Preview, Code, and Blame tabs appears above the content area
- **AND** the Preview tab is the default active tab
- **AND** the rendered markdown body appears inside the Preview tab

#### Scenario: Activating Blame on a text file writes an explicit URL

- **WHEN** the user activates the Blame tab on `/view/internal/server/api.go`
- **THEN** the URL becomes `/view/internal/server/api.go?view=blame`
- **AND** the Blame view renders in place of `<CodeBlock>`

#### Scenario: Activating Code on a markdown file writes an explicit URL

- **WHEN** the user activates the Code tab on `/view/README.md`
- **THEN** the URL becomes `/view/README.md?view=code`
- **AND** the file content renders inside `<CodeBlock>` with markdown syntax highlighting

#### Scenario: Activating Preview on a markdown file writes an explicit URL

- **WHEN** the user activates the Preview tab from another tab on `/view/README.md?view=blame`
- **THEN** the URL becomes `/view/README.md?view=preview` (the SPA does NOT delete the parameter)
- **AND** the rendered markdown renders via `MarkdownRenderer`

#### Scenario: Deep link restores Blame on a text file

- **WHEN** the SPA loads `/view/internal/server/api.go?view=blame`
- **THEN** the Blame tab is active on first paint
- **AND** the Blame view fetches its data

#### Scenario: Deep link restores Code on a markdown file

- **WHEN** the SPA loads `/view/README.md?view=code`
- **THEN** the Code tab is active on first paint
- **AND** the file renders inside `<CodeBlock>` with markdown syntax highlighting

#### Scenario: Legacy markdown URL without `view=` falls back to Preview

- **WHEN** the SPA loads `/view/README.md` with no `view=` query parameter
- **THEN** the Preview tab is active on first paint
- **AND** the rendered markdown renders via `MarkdownRenderer`

#### Scenario: Legacy text URL without `view=` falls back to Code

- **WHEN** the SPA loads `/view/internal/server/api.go` with no `view=` query parameter
- **THEN** the Code tab is active on first paint

#### Scenario: `view=preview` on a text file falls back to Code

- **WHEN** the SPA loads `/view/internal/server/api.go?view=preview`
- **THEN** the Code tab is active on first paint
- **AND** the URL parameter is left as `view=preview` (not rewritten by the SPA)
- **AND** no error is shown

#### Scenario: `view=blame` on a non-text, non-markdown file is inert

- **WHEN** the file viewer renders `/view/logo.png?view=blame`
- **THEN** no tablist is rendered
- **AND** the image preview renders as if the parameter were absent
- **AND** no error message appears

#### Scenario: `at=` parameter is ignored on parse, preserved on emit

- **WHEN** the SPA loads `/view/README.md?view=preview&at=abc1234`
- **THEN** the Preview tab is active on first paint
- **AND** the `at=` value is ignored by the current implementation
- **AND** the rendering uses working-tree bytes (not commit-pinned bytes)
- **AND** activating the Code tab writes `/view/README.md?view=code&at=abc1234` (the `at=` value is preserved, not stripped)

#### Scenario: Keyboard navigation across three markdown tabs

- **WHEN** the user focuses any tab in the markdown tablist
- **AND** presses Right arrow repeatedly
- **THEN** focus and activation cycle through Preview → Code → Blame → Preview
- **AND** the corresponding view is rendered for each step
- **AND** Home jumps to Preview and End jumps to Blame

#### Scenario: Code tab on markdown applies markdown grammar

- **WHEN** the Code tab is active on a `.md` file
- **THEN** the rendered code block contains `hljs-*` token spans driven by the markdown grammar registered in `web/src/components/syntax/grammars.ts`
- **AND** the markdown source's headings, fenced code fences, and emphasis markers render as visually distinct tokens

#### Scenario: Blame tab on markdown renders BlameView

- **WHEN** the SPA loads `/view/README.md?view=blame`
- **THEN** the Blame tab is active on first paint
- **AND** `BlameView` renders the markdown file's lines with the standard committed-chunk metadata (short_sha · subject · author · time) and per-line gutter
- **AND** the wrap toggle is visible in the file head (because the active tab is Blame)

#### Scenario: Markdown Code/Blame container reuses the text panel chrome

- **WHEN** the SPA renders the Code or Blame tab on a markdown file
- **THEN** the content-area container's class list includes `vw-text` (the same class text-file Code/Blame uses)
- **AND** the panel background, border, and rounded corners are visually identical to a text file's Code or Blame tab
- **AND** the markdown Preview tab's container does NOT carry `vw-text` (it carries `vw-markdown` and relies on `.md-body` for chrome)
