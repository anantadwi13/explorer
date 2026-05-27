## Why

Two CSS styling defects affect the file viewer and git diff surfaces. On mobile, the new-line-number gutter in diff view becomes unanchored when scrolling horizontally, leaving a transparent strip of raw code showing through where the gutter should be. Across all code-viewing surfaces (FileViewer code tab, diff, blame) there is no visual separator between line numbers and file content, making it harder to scan at a glance where metadata ends and code begins.

## What Changes

- **Mobile diff gutter fix**: move `font-size: 0.75rem` from `.diff-gutter` to `.diff-hunk-body` in the `max-width: 767px` media query so that `ch` units resolve from a single font-size context for both `grid-template-columns` and `position: sticky; left:` values.
- **Gutter divider — FileViewer**: add `border-right: 1px solid var(--line)` and `background: var(--line-soft)` to `.line-no`; `padding-left: 0.75ch` to `.line-text` in `FileViewer.css`. Top/bottom padding moved from the `<pre>` container to first/last cells so the gutter background fills the full panel height.
- **Gutter divider — DiffHunk**: add `border-right: 1px solid var(--line)` and `padding-right: 0.25ch` to `.diff-line-marker`; widen marker column to `1.75ch`; add `.diff-line-text { padding-left: 0.5ch }`; apply `var(--line-soft)` background to gutter/marker cells; use −1 px sticky overlap to eliminate subpixel gaps between adjacent sticky columns in `DiffHunk.css`.
- **Gutter divider — BlameView**: add `border-right: 1px solid var(--line)` and `background: var(--line-soft)` to `.blame-gutter`; `padding-left: 0.75ch` to `.blame-line-text`; move chunk padding to first/last line cells in `BlameView.css`.
- **Uncommitted chunk contrast**: raise `--blame-uncommitted-bg` opacity from `0.12` to `0.25` (light) and `0.18` to `0.22` (dark) in `syntax.css` so the amber tint is clearly visible in light mode.
- **File last-commit strip**: constrain author name to `max-width: 20ch` with ellipsis and `font-size: 0.9em`; give commit subject `font-weight: 500` so the description is visually dominant over the author name in `FileLastCommitStrip.css`.

All changes are CSS-only; no TypeScript, Go, or HTML structure changes required.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-ui`: visual presentation of line-number gutters changes across the code, diff, and blame views (divider line added; mobile diff sticky fix changes rendered layout at ≤767px).

## Impact

- **`web/src/git/DiffHunk.css`** — mobile media query, marker border/width/padding, gutter background, sticky overlap
- **`web/src/components/FileViewer.css`** — `.line-no` border/background, `.line-text` padding, first/last-child padding distribution
- **`web/src/git/BlameView.css`** — `.blame-gutter` border/background, `.blame-line-text` padding, first/last-child padding distribution, uncommitted fallback opacity
- **`web/src/styles/syntax.css`** — `--blame-uncommitted-bg` opacity values (light + dark themes)
- **`web/src/git/FileLastCommitStrip.css`** — author name constraints, subject font-weight
- No API, Go server, or test changes needed
- `make web` rebuild required; `make web-commit` to sync `internal/server/ui/dist/`
