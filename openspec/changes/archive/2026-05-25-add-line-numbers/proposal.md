## Why

Reading code without line numbers makes it hard to refer to specific lines in conversation, hard to cross-reference compiler/test output, and hard to orient inside a long file. Reviewing diffs without line numbers is worse — you cannot tell where a hunk lands in the new (or old) file without doing arithmetic from the `@@` header. Both surfaces already have all the information needed; they just don't display it.

## What Changes

- File viewer (`CodeBlock`, used only when `kind === 'text'`): add a single, always-on line-number gutter next to the code. One number per logical line, anchored to the first wrapped row so wrap-on output still aligns. In wrap-off mode the gutter sticks to the left of the viewport while the code scrolls horizontally. The gutter is excluded from clipboard copies.
- Explicitly NOT changed: rendered prose surfaces. Markdown files (`kind === 'markdown'`, rendered by `MarkdownRenderer`) do not get a line-number gutter — the rendered output is prose, headings, lists, tables, and embedded fenced code blocks, none of which would benefit from a left-side line gutter. Image previews and the non-previewable fallback are likewise unaffected (different components). Markdown fenced code blocks (rendered inside `MarkdownRenderer`) also do not gain line numbers in this change.
- Git diff hunks (`DiffHunk`): add an always-on two-column gutter (old number, new number) next to each diff line. Numbers are derived client-side from each hunk's `old_start` / `new_start` by walking the lines (context: both shown; add: only new; del: only old). In wrap-off mode both gutter columns stick to the left of the viewport while the diff body scrolls. Gutter cells inherit the row tint on `add`/`del` lines so the row colour appears continuous. Numbers are excluded from clipboard copies.
- Gutter remains visible on mobile for both surfaces (no responsive hide); diff gutter tightens typography on narrow viewports to fit two columns.
- No new toggle, no new setting, no new `localStorage` key, no settings-menu entry.
- No API/Go changes. `GitHunk` JSON schema and the `/api/meta`, `/api/tree`, `/raw/*`, `/api/git/*` endpoints are untouched. Line numbers are a pure SPA concern.
- Regenerate `docs/desktop.gif` and `docs/mobile.gif` in the same change (visible UI change; CLAUDE.md requires GIFs stay in sync).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `web-ui`: adds a "Text-like file line numbers" requirement under the existing file-viewer rendering rules, defining the always-on gutter, the wrap-on/wrap-off behaviour, sticky-left in wrap-off, copy-exclusion, and mobile visibility.
- `git-reader`: adds a "Diff hunk line numbers" requirement under the existing diff rendering rules, defining the two-column old/new gutter, the per-line-type number visibility, the sticky-left behaviour in wrap-off, row-tint inheritance on `add`/`del` rows, copy-exclusion, and mobile visibility.

## Impact

- **SPA code** — `web/src/components/CodeBlock.tsx` (splits source by `\n`, highlights per line, emits gutter cells); `web/src/components/FileViewer.css` (gutter layout, sticky behaviour, copy-exclusion); `web/src/git/DiffHunk.tsx` (computes per-line old/new numbers from `hunk.old_start`/`hunk.new_start` and lines); `web/src/git/DiffHunk.css` (two-column gutter, sticky behaviour, row-tint inheritance, mobile density). Possibly a tiny shared helper for the line-row grid pattern.
- **Tests** — `CodeBlock.test.tsx` adds cases for gutter presence, logical-line alignment, copy exclusion. `DiffHunk.test.tsx` adds cases for the old/new column derivation across context/add/del lines and for empty cells on add/del rows. `FileViewer.test.tsx` continues to pass unchanged (asserts on header/actions, not code-block internals).
- **APIs / Go** — none.
- **Dependencies** — none added.
- **Docs / assets** — regenerate `docs/desktop.gif` and `docs/mobile.gif` via the `record-demo-gif` skill.
- **Performance** — file viewer renders one DOM row per logical line (today: one block per file). Within the existing 5 MiB inline cap this stays comfortably below virtualisation territory; flagged as a watch-item for very large files but no mitigation planned in this change.
- **Accessibility** — gutter is `aria-hidden="true"` (decorative; the screen reader already reads the line content). `user-select: none` on the gutter keeps copy-paste clean for keyboard users too.
