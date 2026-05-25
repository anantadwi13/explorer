## Context

Two SPA surfaces render code: the file viewer (`web/src/components/CodeBlock.tsx`, used by `FileViewer` for `kind === 'text'`) and the diff renderer (`web/src/git/DiffHunk.tsx`, used by `FileDiffCard` on commit/staged/unstaged views). Neither shows line numbers today. Both share the wrap toggle (`useWrap`, `localStorage["explorer.wrap"]`) and the same `lowlight` highlighter (`web/src/components/syntax/grammars.ts`).

Current rendering shapes differ in an important way:
- `CodeBlock` highlights the **entire file as one hast tree**, then renders one `<pre><code>…</code></pre>` containing the whole tokenised stream. There is no per-line DOM structure.
- `DiffHunk` already renders **one `<span class="diff-line">` per line** with a marker span (`+`, `−`, ` `), and already highlights per-line (an acknowledged approximation called out in the file's own header comment).

This asymmetry shapes the design: the diff side needs only a gutter wired into an existing per-line structure; the file viewer side needs both a per-line structure *and* the gutter.

Constraints from the user:
- Always on (no toggle, no setting, no `localStorage` key).
- Two columns for the diff (old | new), single column for the file viewer.
- Visible on mobile.
- In wrap-off mode the gutter sticks to the left of the viewport while content scrolls horizontally.

Constraints from the codebase:
- CSS custom properties only, keyed on `[data-theme="..."]`. No Tailwind, no new colour primitives unless justified.
- Touch targets ≥ 44px, no hover-only affordances. Gutter is decorative so this mostly does not apply, but it must not break adjacent interactive elements.
- `git-reader` JSON contract is fixed and small; no API change is acceptable for line numbers since the data is derivable.

## Goals / Non-Goals

**Goals:**
- Show a single line-number column in the file viewer next to every logical line, regardless of wrap mode.
- Show two line-number columns (old, new) in the git diff hunk renderer next to every line.
- In wrap-off mode for both surfaces, keep the gutter pinned to the left edge while the content area scrolls horizontally beneath.
- Exclude gutter content from clipboard copies.
- Keep the gutter visible at every supported viewport width, including mobile.
- Make zero changes to the HTTP API, the `GitHunk` JSON schema, or the Go server.

**Non-Goals:**
- No user-facing toggle for line numbers (always on by user request).
- No per-line click handlers, no jump-to-line URL fragments, no line-anchored deep links. Future work, not this change.
- No virtualised rendering for very large files. The 5 MiB inline cap keeps row counts bounded; if it becomes a problem we revisit separately.
- No preservation of multi-line token highlighting context in the file viewer. The per-line approximation already used by `DiffHunk` is the documented baseline.
- No line-number gutter on rendered prose surfaces. Markdown files (`kind === 'markdown'`, rendered by `MarkdownRenderer`) do not gain a gutter — the rendered output is prose, headings, lists, tables, and embedded fenced code blocks, none of which would benefit from a left-side line gutter. Image previews (`kind === 'image'`) and the non-previewable fallback are likewise unaffected. The gutter applies only to `kind === 'text'` files routed through `CodeBlock`.
- No change to markdown fenced code blocks. Those render inside `MarkdownRenderer`, not `CodeBlock`, and stay as they are today.

## Decisions

### Decision 1: Per-row layout via CSS Grid, not absolute positioning

**Choice:** Each logical line is a CSS Grid row. Column templates:

- **File viewer (`CodeBlock`)**: `grid-template-columns: minmax(3ch, auto) minmax(0, 1fr)` — gutter column with a minimum 3ch floor so it does not collapse when the file is short; content column that fills the remaining width and can shrink to zero on narrow viewports (the `minmax(0, 1fr)` is the standard guard against grid items overflowing their column). In wrap-off mode the grid itself MUST also be `width: max-content; min-width: 100%` (mirrors the diff side below), otherwise long lines overflow the `1fr` cell into `pre`'s scroll area but the grid stays at viewport width — the sticky `.line-no` cell's containing block then ends before the right edge of the scroll area and the gutter scrolls off-screen past the original viewport.
- **Diff (`DiffHunk`)**: `grid-template-columns: var(--gutter-old-w, 3ch) var(--gutter-new-w, 3ch) 1.25ch minmax(0, max-content) 1fr` — old gutter, new gutter, marker (replacing the old `.diff-line-marker { width: 1.25ch }` rule, which has no effect on grid items), the text column, and a trailing `1fr` filler track. The gutter widths are sized by per-hunk CSS variables (see Decision 5). `max-content` on the text track (not `1fr`) is required because the wrap-off ancestor is `width: max-content` and `1fr` collapses to zero inside a `max-content` container (a known grid quirk). The trailing `1fr` filler exists so each row's tint reaches the right edge of the hunk body even when the widest line is shorter than the available width — without it, short add/del rows would tint only as far as the text column extends and the visible band would stop mid-row. The `.diff-line` spans `grid-column: 1 / -1` so the row background covers all five tracks; the filler track has no children.

Gutter columns get a 3ch minimum (via the `gutterWidthStyle` floor in `DiffHunk.tsx`) so an all-`del` hunk's empty new-column does not collapse the column to zero width and visually misalign vs neighbouring hunks.

**Why:** Grid solves the central layout problem — a wrapped line occupies multiple visual rows but must show the line number only once, top-aligned to the first row. Grid rows naturally size to the content cell's wrapped height while the gutter cell stays a single number at the top. `display: table` would also work but does not play well with `position: sticky` cells the way grid does.

**Implementation note:** The existing `.diff-line { padding-left: 0.5rem }` rule MUST be removed when migrating to grid. Otherwise the padding pushes the entire row (including the would-be sticky-left gutter) away from `left: 0`, breaking the sticky pinning. Breathing-room on the left edge moves into the marker column's `1.25ch` slot and/or row-internal padding on the text cell.

**Rejected:** CSS counters (`counter-increment`) on `<pre>`. They break with wrap because they emit one number per visual row, not per logical row. They are the obvious-looking solution and the wrong one for our wrap-on case.

**Rejected:** Absolute-positioned gutter overlay. Hard to keep aligned across font-size, line-height, and wrap changes; fragile under zoom.

### Decision 2: Sticky-left gutter for wrap-off

**Choice:** Gutter cells use `position: sticky; left: 0` with an opaque background. The scroll container is the existing wrap-off scrollable ancestor (`.code-block.wrap-off` for the file viewer, `.diff-hunk-body.wrap-off` for the diff).

**Why:** When content scrolls horizontally and numbers don't, readers stay oriented. `position: sticky` is the standard primitive for this and is well-supported.

**Trade-off:** Sticky cells need an opaque background or scrolled text bleeds through. For the file viewer the gutter cell background is `var(--bg-panel)` (matches the surrounding code block). For the diff this is more delicate — see Decision 4.

**Rejected:** `position: fixed` or a JS-driven scroll listener. Both fight the natural scroll container and break inside the existing flex/grid page layout.

### Decision 3: Per-line highlighting for the file viewer (matches DiffHunk)

**Choice:** In `CodeBlock`, split source by `\n`, then call `lowlight.highlight(language, line)` for each line and render the resulting hast tree inside a per-line `<span>`.

**Why:** Aligns with the existing `DiffHunk` approach (its own header comment names this approximation). It eliminates the "split a single hast tree on newline text nodes while re-opening every open span" surgery (Option B from exploration), which is non-trivial and easy to get wrong with nested grammar rules. The visible cost is that multi-line tokens (block comments, template literals) re-tokenise per line; in practice this is barely visible in our colour palette and is the same compromise GitHub-style renderers make.

**Trade-off:** A long unterminated block comment will re-colour each continuation line. Acceptable per user discussion in explore mode; called out in `proposal.md` and below in Risks.

**Rejected:** Whole-file highlight followed by hast-tree post-processing to split on `\n` while preserving open spans. More fidelity, much more code surface, more bug surface.

### Decision 4: Diff gutter cell inherits row tint via an opaque base + tint layer

**Choice:** Each gutter (and marker) cell on a tinted row gets two stacked backgrounds — an opaque `--bg-soft` base layer plus the translucent row tint composed via `background-image: linear-gradient(...)`. The full rule set:
- `.diff-line-context > .diff-gutter, .diff-line-context > .diff-line-marker` → `background: var(--bg-soft)` (opaque).
- `.diff-line-add > .diff-gutter, .diff-line-add > .diff-line-marker` → `background-color: var(--bg-soft); background-image: linear-gradient(var(--color-diff-add-bg), var(--color-diff-add-bg))`.
- `.diff-line-del > .diff-gutter, .diff-line-del > .diff-line-marker` → same shape with `--color-diff-del-bg`.

**Why:** The `--color-diff-*-bg` tokens are deliberately translucent (rgba alpha ~0.18–0.22) so they composite over `--bg-soft` on the normal scrolling row. A sticky-left cell in wrap-off has no `--bg-soft` ancestor *inside the sticky cell itself*, so a single translucent tint would let horizontally-scrolled diff text bleed through. Stacking the opaque base under the same translucent tint produces the identical visible colour as the non-sticky row while fully occluding scrolled content. Context-row gutters use the opaque `--bg-soft` directly because that *is* the hunk body background.

**Trade-off:** Each tinted row needs two background-related properties (`background-color` + `background-image`) instead of one. Worth it; the single-translucent-tint approach was broken under wrap-off scroll, as found in manual verification.

### Decision 5: Two sticky columns side-by-side for the diff gutter, sized by per-hunk CSS variables

**Choice:** Both old and new gutter cells use `position: sticky` with explicit `left` offsets — old at `left: 0`, new at `left: var(--gutter-old-w, 3ch)`, marker at `left: calc(var(--gutter-old-w, 3ch) + var(--gutter-new-w, 3ch))` (see Decision 8). The same `--gutter-old-w` / `--gutter-new-w` variables also drive the explicit column tracks on `.diff-hunk-lines` (see Decision 1), so the sticky offsets always equal the rendered column widths — no `ch` arithmetic drift when line numbers grow.

The variables are computed per hunk in `DiffHunk.tsx:gutterWidthStyle` from the largest old/new line number actually rendered, using `max(digits, 2) + 1ch` (the `.diff-gutter` rule applies 0.5ch padding on each side), floored at `3ch`. So a hunk with `old_start=100` gets `--gutter-old-w: 4ch`, a 4-digit hunk gets `5ch`, and an all-add hunk keeps `3ch` on the old side because the floor wins.

**Why:** Two independent sticky cells compose cleanly with the existing per-line `<span>` structure and avoids introducing a new wrapper element. A single sticky wrapper around both would also work but would force a layout refactor of `.diff-line` to nest the marker inside it. Deriving the offsets from the same CSS variables that size the columns is what keeps the marker pinned in the right place once line numbers cross 99 — hard-coded `ch` offsets break at that boundary because `minmax(3ch, max-content)` lets the column grow but a hard-coded `left: 3ch` does not follow.

**Alternative considered:** Wrap both gutter columns plus the marker into one sticky `<span>` per line. Slightly cleaner stacking context but requires moving the marker out of its current position, which has a settled palette in `DiffHunk.css`. Skipped to keep this change additive.

### Decision 6: Mobile keeps the gutter, with tighter typography on the diff

**Choice:** No responsive `display: none`. The file viewer gutter takes ~4ch and is fine. The diff gutter on mobile narrows by dropping gutter font-size to ~0.75rem and shrinking padding to fit two columns within a typical 360px viewport without crowding the diff text below 30ch.

**Why:** User explicitly asked for line numbers on mobile. Hiding them would silently violate that requirement; resizing makes them comfortably fit.

**Trade-off:** The diff gutter becomes slightly less readable at mobile font-size. Acceptable; numbers are still legible and the alternative (hiding) was rejected.

### Decision 7: Copy exclusion via `user-select: none` on gutter cells

**Choice:** `.line-no, .diff-gutter { user-select: none }`.

**Why:** Standard browser primitive. Keyboard selection (Shift+Arrow), mouse drag, and triple-click all respect it. The gutter becomes invisible to clipboard operations, so a user copying a Go function out of the viewer pastes clean code, not `1 package main\n2 \n3 …`.

**Also:** `aria-hidden="true"` on the gutter cell. The line content already conveys the position; the number is decorative for screen readers.

### Decision 8: Marker column is sticky-left alongside the gutter (diff)

**Choice:** In wrap-off mode, the diff's marker column (`+`, `−`, space) sticks to the left edge of the visible viewport along with both gutter columns. The pinned region is therefore "old number | new number | marker" as a single visual block.

**Why:** If only the gutter pinned, a horizontally scrolled long line would show numbers but not the line type — readers would have to scroll back to remember whether the line they are reading is an addition, deletion, or context. The marker is part of "where am I", not part of "what does this say", so it belongs with the gutter on the pinned side.

**How:** Same `position: sticky` primitive as the gutter cells, with `left: calc(var(--gutter-old-w, 3ch) + var(--gutter-new-w, 3ch))` (the same vars that size the gutter columns — see Decision 5) and the same opaque-base + tint composition as the gutter cells (see Decision 4) so the row tint stays continuous and scrolled diff text cannot bleed through.

### Decision 9: DOM shape — keep `<pre><code>` wrapper, make `<code>` the grid container

**Choice:** `CodeBlock` continues to emit `<pre class="code-block …"><code class="hljs language-X">…</code></pre>`. The `<code>` element becomes the CSS Grid container; per-line rows live inside as `<span class="code-line">` children, each holding the gutter cell and the highlighted text cell.

**Why:** Preserves the existing semantic affordances (`<pre>` for fixed-pitch + whitespace preservation, `<code>` carrying the `hljs language-X` class for screen readers and highlight-theme styling). The only structural change is "one stream of tokens" → "many rows of tokens", which the grid container absorbs.

**Rejected:** Dropping `<code>` and making `<pre>` the grid container directly. Smaller DOM but loses the `<code>` semantic and would require recreating `language-X` styling elsewhere. Net negative.

### Decision 10: Trailing-newline rule

**Choice:** When splitting source on `\n`, if the final element is an empty string, drop it. So `"a\nb\n"` becomes two logical lines (`"a"`, `"b"`), not three. `"a\nb"` (no trailing newline) also becomes two logical lines.

**Why:** Most files end in `\n`. A naïve split would produce a phantom blank row numbered `N+1`. Matches how `git`, editors, and `wc -l` count lines. The same rule applies to the file viewer (`CodeBlock`) — `DiffHunk` is unaffected because its input is already a `GitDiffLine[]` array from the Go side, not a raw string.

### Decision 11: Client-side derivation of diff line numbers

**Choice:** Walk `hunk.lines` once before render, computing `(oldNo | null, newNo | null)` per entry from `hunk.old_start`/`hunk.new_start`. Stash in a local array; render maps over it.

**Why:** Pure data transformation, no API change. The hunk header is the source of truth for both starting positions and is already in the client payload. Adding per-line numbers to the JSON would inflate the wire format and duplicate derivable data.

**Rejected:** Sending per-line numbers from the Go side. More bytes on the wire, more code in `internal/server/git/patch.go`, no benefit.

## Risks / Trade-offs

- **Per-line highlighting may visibly re-colour multi-line tokens in the file viewer.** A long unterminated block comment or template literal will show its continuation lines re-tokenised. → Documented in `proposal.md` and in `web-ui/spec.md` (delta). Same approximation already in production on the diff side; user accepted in explore mode.

- **Large files create proportionally more DOM nodes.** A 100,000-line file (just under the 5 MiB cap for typical UTF-8) becomes ~100k grid rows instead of one `<code>` block. → No mitigation planned. The cap bounds total work, and modern browsers handle this size of DOM for static content. Flagged as a future watch-item; if reports surface, virtualisation via `react-window` is the next step. Out of scope here.

- **Sticky gutter on diff rows must stay tinted across both columns.** A misconfigured gutter cell will show a panel-coloured rectangle bleeding into the add/del tint and look broken. → Mitigated by Decision 4 (explicit per-row backgrounds). Covered by a CSS rule for each line type and verified by the `DiffHunk.test.tsx` smoke test asserting the gutter inherits the line class.

- **Mobile diff gutter eats horizontal space.** Two columns + marker leaves less room for diff text on a 360px viewport. → Mitigated by Decision 6 (tighter typography on mobile). Acceptable per user requirement; if it proves too tight in practice we can revisit (single-column-merged mobile mode is one option, but not chosen here).

- **`position: sticky` requires an unbroken scroll container ancestor.** A future refactor that wraps the code block in a new `overflow: hidden` ancestor would silently break sticky-left. → Mitigated by keeping the sticky behaviour close to the existing `wrap-off` rules in the same CSS file, and by a DiffHunk test asserting a sticky-on-wrap-off computed style. The risk is real but localised.

- **The gutter must not be included in copies.** A keyboard user pressing Cmd+A then copying must get clean source. → Mitigated by `user-select: none` on the gutter, tested by a snapshot of selection bounds in `CodeBlock.test.tsx`.

- **Demo GIFs drift.** CLAUDE.md mandates re-recording when SPA UI changes. Skipping is a soft failure that ages the README. → Mitigated by an explicit task in `tasks.md` calling the `record-demo-gif` skill, gated on UI completion.
