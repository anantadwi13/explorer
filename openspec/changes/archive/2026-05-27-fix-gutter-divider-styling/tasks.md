## 1. DiffHunk.css — mobile sticky fix

- [x] 1.1 In `web/src/git/DiffHunk.css`, move `font-size: 0.75rem` from the `.diff-gutter` rule inside `@media (max-width: 767px)` to a new `.diff-hunk-body` rule in the same media query, so the entire diff body shares one font-size context for `ch` unit resolution
- [x] 1.2 Verify the `.diff-gutter` mobile rule retains only `padding: 0 0.25ch` after the font-size move

## 2. DiffHunk.css — marker divider

- [x] 2.1 Add `border-right: 1px solid var(--line)` to the `.diff-line-marker` rule in `DiffHunk.css`
- [x] 2.2 Add a new `.diff-line-text { padding-left: 0.5ch; }` rule in `DiffHunk.css`
- [x] 2.3 Widen marker column from `1.25ch` to `1.75ch` in `.diff-hunk-lines` `grid-template-columns`
- [x] 2.4 Add `padding-right: 0.25ch` to `.diff-line-marker` so the glyph has breathing room before the border

## 3. FileViewer.css — gutter divider

- [x] 3.1 Add `border-right: 1px solid var(--line)` to the `.line-no` rule in `FileViewer.css`
- [x] 3.1b In `FileViewer.css`, change `.line-no` padding from `padding: 0 1ch` to `padding: 0 0.5ch 0 1ch` (reduce right side from 1ch to 0.5ch) so the visual gap to code matches the blame-gutter gap (~1.25ch total)
- [x] 3.2 Add `padding-left: 0.75ch` to the `.line-text` rule in `FileViewer.css`
- [x] 3.3 Set `.line-no` background to `var(--line-soft)` for clear visual distinction from the code area
- [x] 3.4 Remove top/bottom padding from `.code-block` (`padding: 24px 28px 24px 0` → `padding: 0 28px 0 0`) and distribute via `.code-line:first-child` / `.code-line:last-child` selectors (`padding-top/bottom: 24px` on both `.line-no` and `.line-text`) so the gutter background fills the full panel height

## 4. BlameView.css — gutter divider

- [x] 4.1 Add `border-right: 1px solid var(--line)` to the `.blame-gutter` rule in `BlameView.css`
- [x] 4.2 Update `.blame-line-text` padding in `BlameView.css` from `padding: 0 0.5ch 0 0` to `padding: 0 0.5ch 0 0.75ch`
- [x] 4.3 Set `.blame-gutter` background to `var(--line-soft)`; update `.blame-chunk-uncommitted .blame-gutter` base `background-color` to match
- [x] 4.4 Remove top/bottom padding from `.blame-chunk-body` (`padding: 6px 0` → `padding: 0`) and distribute via `.blame-line:first-child` / `.blame-line:last-child` selectors (`padding-top/bottom: 6px` on both `.blame-gutter` and `.blame-line-text`) so the gutter background fills the full chunk height

## 5. DiffHunk.css — sticky subpixel gap fix

- [x] 5.1 Change `.diff-hunk-body.wrap-off .diff-gutter-new` sticky `left` to `calc(var(--gutter-old-w, 3ch) - 1px)` (1 px overlap with old gutter to eliminate subpixel gap)
- [x] 5.2 Change `.diff-hunk-body.wrap-off .diff-line-marker` sticky `left` to `calc(var(--gutter-old-w, 3ch) + var(--gutter-new-w, 3ch) - 1px)`

## 6. FileLastCommitStrip — subject/author hierarchy

- [x] 6.1 In `web/src/git/FileLastCommitStrip.css`, split the combined `.file-last-commit-author, .file-last-commit-time` rule into two separate rules
- [x] 6.2 Give `.file-last-commit-subject` `font-weight: 500` so the commit description is visually prominent
- [x] 6.3 Change `.file-last-commit-author` to `flex: 0 1 auto; min-width: 0; max-width: 20ch; overflow: hidden; text-overflow: ellipsis; font-size: 0.9em` — allows the author name to shrink and truncate rather than crowd out the subject
- [x] 6.4 Keep `.file-last-commit-time` as `flex-shrink: 0; white-space: nowrap` — time strings are always short

## 7. BlameView — uncommitted chunk contrast

- [x] 7.1 In `web/src/styles/syntax.css`, update `:root` `--blame-uncommitted-bg` from `rgba(245, 158, 11, 0.12)` to `rgba(245, 158, 11, 0.25)`
- [x] 7.2 Update `[data-theme="light"]` block to the same value `rgba(245, 158, 11, 0.25)`
- [x] 7.3 Update `[data-theme="dark"]` block from `rgba(251, 191, 36, 0.18)` to `rgba(251, 191, 36, 0.22)`
- [x] 7.4 Update the `color-mix` fallback in `BlameView.css` `.blame-chunk-uncommitted` from `8%` to `25%`

## 8. Build and verify

- [x] 8.1 Run `make web` to rebuild the SPA and confirm no build errors
- [x] 8.2 Open a text file in the file viewer (Code tab) and confirm the vertical divider line appears between line numbers and code, gutter background is visually distinct, and gutter fills the full panel height (no gap at top or bottom)
- [x] 8.3 Open the Blame tab and confirm the divider appears between line numbers and code, gutter background is visible, no gap at top/bottom of chunks, and uncommitted chunks are clearly distinguishable (amber tint visible in light mode)
- [x] 8.4 Open a commit diff and confirm the divider appears between the +/− marker and code text, marker column is wide enough, gutter background is distinct
- [x] 8.5 Enable wrap-off and scroll horizontally in a diff hunk on a narrow viewport (≤767px); confirm no transparent gap appears between the old-line-number gutter, new-line-number gutter, and the +/− marker
- [x] 8.6 Run `make web-commit` to sync `internal/server/ui/dist/` and stage the updated dist files
