## Context

The SPA renders code in three surfaces that share a CSS Grid + `position: sticky` pattern for line-number gutters:

| Surface | File | Sticky elements |
|---|---|---|
| FileViewer Code tab | `FileViewer.css` / `CodeBlock` | `.line-no` |
| Git diff hunks | `DiffHunk.css` | `.diff-gutter-old`, `.diff-gutter-new`, `.diff-line-marker` |
| Blame view | `BlameView.css` | `.blame-gutter` (+ metadata col on desktop) |

**Bug — mobile diff sticky mis-alignment**: In `DiffHunk.css`, the `@media (max-width: 767px)` rule sets `font-size: 0.75rem` on `.diff-gutter`. CSS custom properties containing relative units (`ch`) are resolved at the *point of use*, not the point of declaration. This means:

- `grid-template-columns: var(--gutter-old-w)` on `.diff-hunk-lines` (font: 0.85 rem) resolves `4ch` → ~32 px
- `left: var(--gutter-old-w)` on `.diff-gutter-new` (font: **0.75 rem**) resolves `4ch` → ~29 px

The sticky threshold is ~3 px short of the actual column width. On mobile the new-line-number gutter does not stay flush against the old-line-number gutter when scrolling horizontally in wrap-off mode, exposing raw scrolling code through the gap.

**Gap — no visual separator**: All three surfaces render line numbers directly adjacent to code text with no dividing line, making it harder to visually separate metadata from content, especially on small screens.

## Goals / Non-Goals

**Goals:**
- Eliminate the mobile sticky `ch`-unit mismatch in `DiffHunk.css` so the new-line-number gutter and +/− marker remain flush when scrolling.
- Add a consistent `1px var(--line-soft)` vertical divider between the gutter columns and code content across FileViewer code tab, diff hunk, and blame view.
- Keep changes CSS-only; zero TypeScript or Go modifications.

**Non-Goals:**
- Fixing sticky behaviour on surfaces other than diff hunks.
- Changing line-number font sizes on desktop.
- Adjusting diff column widths or the JavaScript `gutterWidthStyle` calculation.
- Adding a gutter divider to fenced code blocks inside `MarkdownRenderer`.

## Decisions

### D1 — Move font-size to `.diff-hunk-body`, not remove it

**Options considered:**
- A) Remove `font-size: 0.75rem` entirely → gutter stays at 0.85 rem on mobile (slightly coarser).
- B) Move `font-size: 0.75rem` to `.diff-hunk-body` → entire diff body (gutter + text) shares one font-size, keeping ch consistent.
- C) Change JS to emit `px` instead of `ch` → requires font measurement at runtime; invasive.

**Decision: B.** Moving the rule to `.diff-hunk-body` preserves the mobile density reduction (both gutter numbers and diff text become 0.75 rem, keeping long diffs readable on small screens), while making every `ch` reference in the hunk — `grid-template-columns`, `left:`, and `padding` — resolve from the same computed font-size. No JS changes required.

### D2 — Place divider border on `.diff-line-marker`, not `.diff-gutter-new`

The diff column order is `old# | new# | +/−marker | code`. The conceptual boundary is between *all metadata* (both gutter numbers plus the change-type indicator) and the *code content*.

- Border on `.diff-gutter-new` → splits the two gutter numbers from the marker+code, which reads oddly (the `+`/`−` sign is metadata, not content).
- Border on `.diff-line-marker` → cleanly divides all header columns from the code text. This matches common diff-viewer conventions (GitHub, GitLab, etc.).

**Decision: border-right on `.diff-line-marker`.** This also means the sticky background already applied to `.diff-line-marker` naturally carries the border as the element remains pinned.

### D3 — Use `var(--line)` for the divider colour

After visual testing, `var(--line-soft)` (L 95%) was too close to `var(--bg-panel)` (L 99%) — only 4% lightness difference, barely perceptible. `var(--line)` (L 92%) is used instead: it is clearly visible against the code area while still lighter than the outer structural borders (hunk frame, blame chunk separators). The internal-chrome rationale still holds; `--line` is the appropriate step up from `--line-soft` when the latter proves imperceptible.

### D4 — `padding-left` on the text cell, not `padding-right` on the gutter

Adding space on the text side (`padding-left: 0.75ch` on `.line-text` / `.blame-line-text`, `0.5ch` on `.diff-line-text`) keeps the border visually "breathing" without affecting the gutter width calculation. Adding padding-right to the gutter would widen the column and require re-validating the JS `gutterWidthStyle` computation (which already accounts for 0.5 ch of per-side padding).

### D5 — Gutter background: `var(--line-soft)` over `var(--bg-soft)` or `var(--bg-panel)`

To make the gutter lane visually distinct from the code area:

| Token | Lightness (light) | Verdict |
|---|---|---|
| `--bg-panel` (original) | L 99% | Gutter blends into code area — no distinction |
| `--bg-soft` | L 97% | Only ~2% difference from `--bg-panel` — imperceptible |
| `--line-soft` (chosen) | L 95% | Clear 4% step vs `--bg-panel`; stays subdued |

Applied to `.line-no` (FileViewer), `.blame-gutter` (BlameView), and the opaque base on all diff gutter/marker cells (`.diff-line-context > .diff-gutter`, `.diff-line-add > .diff-gutter`, etc.).

### D6 — Widen marker column and add right-side padding

The `+`/`−` glyph was too close to the divider border in the 1.25ch marker track. Two complementary fixes:

1. Column widened `1.25ch → 1.75ch` so the glyph has space on both sides.
2. `padding-right: 0.25ch` added to `.diff-line-marker` so the glyph visually floats away from the border edge.

This is a small extra width for the marker column; the JS `gutterWidthStyle` calculation is not affected (it only sizes the gutter-old and gutter-new tracks).

### D7 — Sticky `-1px` overlap to eliminate subpixel gap

At certain device pixel ratios, adjacent `position: sticky` columns can show a 1 px transparent gap where the browser's subpixel rounding rounds each element's painted edge inward. Applied to:

- `.diff-gutter-new`: `left: calc(var(--gutter-old-w, 3ch) - 1px)` (overlaps old gutter by 1 px)
- `.diff-line-marker`: `left: calc(var(--gutter-old-w, 3ch) + var(--gutter-new-w, 3ch) - 1px)`

The 1 px overlap is occluded by the higher z-index of the rightward element and produces no visible doubling.

### D8 — Move container top/bottom padding to first/last grid cells

**Problem**: `FileViewer.css` `.code-block` had `padding: 24px 28px 24px 0` and `BlameView.css` `.blame-chunk-body` had `padding: 6px 0`. These paddings sit *outside* the grid, so the `--line-soft` gutter background on `.line-no` / `.blame-gutter` cells stopped before reaching the top and bottom edges of the panel, leaving a visible uncoloured band.

**Fix**: Remove top/bottom padding from the container; distribute it to the first and last grid-row cells via `:first-child` / `:last-child` selectors. This way the gutter background is part of the first and last cells and extends flush to the panel edges. Right-side padding on `.code-block` is retained as-is (it spaces the text column only).

### D10 — FileLastCommitStrip: subject takes priority over author name

The strip renders `sha · subject · author · time` in a single flex row. Before this fix, `.file-last-commit-author` had `flex-shrink: 0` + `white-space: nowrap`, which locked the author to its full natural width and forced `.file-last-commit-subject` (the only `flex: 1 1 auto` field) to be ellipsized to near-zero when the author name is long.

**Changes:**
1. **Subject** gets `font-weight: 500` — semi-bold provides visual hierarchy without relying solely on truncation order.
2. **Author** changes from `flex-shrink: 0` to `flex: 0 1 auto; min-width: 0; max-width: 20ch` with overflow ellipsis — it shrinks when space is tight and never exceeds 20 character widths. `min-width: 0` removes the flex item's implicit minimum-size floor so it can actually shrink below its content width.
3. **Time** retains `flex-shrink: 0` — relative times (`3 days ago`) are short and always informative; truncating them would be confusing.
4. Author font-size set to `0.9em` to visually de-emphasise it relative to the subject.

**Design rationale**: The commit subject is the primary piece of information a user needs to identify a commit at a glance. The author name is secondary context. A long author name should never be allowed to crowd out the subject.

### D9 — Raise uncommitted chunk opacity in light mode

The original `--blame-uncommitted-bg` was `rgba(245, 158, 11, 0.12)` in light mode. Amber (hue ~38°) has significantly lower perceptual contrast against near-white `--bg-panel` than the green/red used for diff add/del tints. At 12% opacity it is essentially invisible in light mode.

| Theme | Old opacity | New opacity | Rationale |
|---|---|---|---|
| Light / `:root` | 0.12 | 0.25 | Amber needs ~2× the opacity of green/red to reach similar visual weight |
| Dark | 0.18 | 0.22 | Minor bump for consistency; dark backgrounds already give amber more contrast |

The hue (amber `f59e0b` / `fbbf24`) is intentionally distinct from diff green/red to avoid implying "this is an addition". The opacity increase preserves that semantic distinction while making the uncommitted state legible at a glance. The fallback `color-mix` in `BlameView.css` is updated from 8% to 25% to stay in sync.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Moving font-size to `.diff-hunk-body` makes diff text slightly smaller on mobile (0.85 → 0.75 rem) | Intended: this matches the original motivation for the per-gutter override and now applies uniformly |
| `border-right` on sticky `.diff-line-marker` may visually "cut through" add/del background tints | The marker has an opaque `background-color: var(--line-soft)` + gradient overlay, so the border renders against a solid base — no artefact |
| `.diff-line-text` has no existing CSS rule; adding one is additive | No existing rule to conflict with; safe to add |
| The `padding-left` on `.blame-line-text` is additive to existing right-only padding | Explicit: change `padding: 0 0.5ch 0 0` to `padding: 0 0.5ch 0 0.75ch` |
| `-1px` sticky overlap could reveal the wrong cell's background on the 1 px overlap band | The rightward cell's `z-index: 1` paints over the overlap; colours match so no visible artefact |
| Moving padding to `:first-child`/`:last-child` breaks if JS renders zero lines | No content rendered → no grid rows → no gap to worry about; safe |
