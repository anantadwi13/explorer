## Context

Today the file viewer (`web/src/components/FileViewer.tsx`, used by `ViewPage` for any non-folder route) renders a header strip with file metadata and either `<CodeBlock>` / `<MarkdownRenderer>` / `<img>` below it. It has no git awareness — nothing about whether the file is tracked, modified, or who wrote it. The `git-reader` capability exists in parallel at `/git/*` but those routes are reached only by the branch picker, the changes badge, and direct deep links; the file viewer never crosses over.

The git surface already covers the heavy lifting we need to reuse:
- `/api/git/info` is cached per session and tells the SPA whether to render any git affordance at all.
- `/api/git/status` is fetched for the changes-badge; its `staged`, `unstaged`, and `untracked` arrays already classify every dirty file by path.
- `/api/git/commits` walks history from a ref with cursor pagination.
- `internal/server/git/patch.go` has a working go-git diff pipeline (used for `/api/git/patch`).

What's missing is (a) a per-file filter on commits, (b) a blame endpoint, and (c) UI in the file viewer to surface both.

The blame side carries the most design weight because it has a wrong default to avoid. go-git's `Blame(commit, path)` returns line attribution against the commit's tree. If we naïvely point that at HEAD and pair it with the SPA's `/raw/<path>` content (which serves working-tree bytes), the line numbers don't align whenever the file has uncommitted changes. The user has explicitly chosen the more ambitious "working-tree content with per-line overlay" approach over the simpler "show HEAD content only" alternative; that choice shapes most of this design.

## Goals / Non-Goals

**Goals:**
- File viewer shows a one-line "last commit" strip for every file when the served root is a git repository, with three visual states (clean tracked / modified locally / untracked).
- "History" button on the strip navigates to the existing commits list, scoped to the file via a `?path=` filter.
- "Code | Blame" tabs are visible on the file viewer for text files only, deep-linkable via `?view=blame`, and survive page reload.
- Blame view aligns with the working-tree content: unchanged lines carry their HEAD-blame attribution, locally-modified lines render as "uncommitted" chunks with distinct treatment.
- Blame view is usable on a 360 px viewport — chunk metadata stacks above its line range below the existing `768px` SPA breakpoint.
- Untracked files show the strip in its "no commits" state and a disabled Blame surface that explains why.
- All new server endpoints respect the existing path-traversal rule (repo-relative pathspecs, not filesystem paths).

**Non-Goals:**
- No follow-rename in blame. go-git supports it, but the line-diff overlay we need for dirty files becomes very hard to reconcile once the file's identity changes across history. v1 stops at the first rename boundary. Future work.
- No ref selector in the Blame tab. Blame is always against the active ref (defaults to HEAD; the branch picker's selection is honoured if the user navigated through a non-HEAD ref). Future work; mobile UI for a second selector inside the file viewer is its own problem.
- No "blame by selecting a line range" sub-view. The whole-file response is the only shape v1 ships. A range-blame query is straightforward to add later if needed; not adding it keeps the wire format flat.
- No commit-message or content search on `/api/git/commits`. The existing "Non-goals declared" requirement narrows to keep message/content search out; only the path filter is in scope.
- No virtualised rendering for very long blame results. The 5 MB cap already bounds line count; if a 5 MB code file shows up in practice we revisit.
- No caching of blame or per-file commit lookups. Matches the existing "Caching of any kind" non-goal in `git-reader`.

## Decisions

### Decision 1: Extend `/api/git/commits` with `?path=<file>` rather than introducing a new endpoint

**Choice:** Add an optional `path` query parameter to `/api/git/commits`. When present, the server walks the same commit DAG and emits only commits whose first-parent diff touches the path. Pagination cursor semantics are unchanged (the cursor still references a commit sha; the next page filters with the same path).

**Why:** Two callers need the same shape — the file viewer's strip wants `path=<file>&limit=1`, the commits list wants `path=<file>` with full pagination. A second endpoint would duplicate cursor handling, ref validation, and error mapping. The semantics are also what `git log -- <path>` does, which keeps the mental model aligned with command-line muscle memory.

**Trade-off:** Filtering happens after diffing each candidate against its parent, so deep histories where the file is rarely touched do more work than the unfiltered walk. Bounded by the existing `limit` clamp (≤100); acceptable for v1. Documented in proposal.md under Performance.

**Rejected:** A dedicated `/api/git/file/log?path=…` endpoint. Cleaner separation but doubles the surface for no behaviour difference.

### Decision 2: Blame is a new endpoint, not a flag on `/api/git/commits`

**Choice:** `/api/git/blame?path=<file>&ref=<ref>` is a separate endpoint with its own response shape.

**Why:** Blame's response is fundamentally different — per-line attribution, not per-commit summaries. Folding it into `commits` would force the response into a union type, which fights both the typed-errors contract and the SPA's `ApiError` union. The split also matches how go-git exposes the two operations.

### Decision 3: Blame chunks instead of per-line records

**Choice:** Blame returns an array of chunks where each chunk groups consecutive lines attributed to the same commit (or marked `uncommitted`). Each chunk carries `start_line`, `line_count`, and either a `commit` summary or `uncommitted: true`.

```json
{
  "path": "internal/server/api.go",
  "ref": "main",
  "sha": "abc1234...",
  "total_lines": 240,
  "dirty": false,
  "chunks": [
    { "start_line": 1, "line_count": 5, "commit": { "sha": "...", "short_sha": "...", "author_name": "...", "author_time": "...", "subject": "..." } },
    { "start_line": 6, "line_count": 3, "commit": { ... } }
  ]
}
```

**Why:** Per-line records on a long file produce a fat payload with a lot of repetition (most files have long runs of single-author lines). Chunks match the visual grouping the SPA wants to render — one metadata block above a span of lines — so the wire format and the UI carry the same shape. GitHub's blame view also groups this way.

**Trade-off:** A pathological "every line attributed to a different commit" file becomes one chunk per line. That's the upper bound of the per-line approach, so no worse than the alternative; chunks just compress the common case.

### Decision 4: Dirty-file blame is server-side, with a working-tree overlay

**Choice:** When `path` is dirty in the working tree and `ref` is omitted (or equals HEAD), the blame endpoint:
1. Reads HEAD's blob bytes for the path.
2. Reads working-tree bytes (via the path-resolver, since this is a filesystem read).
3. Runs the existing `diff.Do` pipeline (already used in `internal/server/git/patch.go`) to produce a line-level diff between (1) and (2).
4. Runs go-git `Blame(HEAD, path)` to produce per-line attribution aligned with HEAD's lines.
5. Walks the working-tree lines, applying the diff:
   - Lines that came through unchanged → look up the HEAD blame entry by HEAD-line index.
   - Lines that the diff marks as inserted/modified in the working tree → emit as `uncommitted: true`.
6. Re-coalesces consecutive same-commit (and consecutive uncommitted) lines into chunks.
7. Sets `dirty: true` in the response.

**Why:** Doing this client-side would require shipping the entire HEAD blob plus the working-tree blob plus the blame array, then re-doing the diff in JS. Server-side keeps the wire format identical for clean and dirty cases (just one extra `dirty: true` flag and some `uncommitted: true` chunks) and avoids putting a diff implementation in the SPA.

**Trade-off:** The endpoint does more work for dirty files. The work is bounded by the same 5 MB cap and ~10 s deadline that the clean path uses; effectively the cost of one `git blame` plus one `git diff` of a single file. Acceptable.

**Constraint:** The working-tree read happens through `resolver.Resolve` — this is the one path inside `/api/git/*` where a filesystem path *does* flow through the path-resolver, because the working-tree bytes live on the filesystem outside the git object store. Documented inside this requirement so the existing "Path semantics declaration" rule isn't read as a blanket prohibition.

### Decision 5: Historical-ref blame skips the overlay

**Choice:** When `ref` is an explicit branch / tag / sha that's not HEAD, blame is computed directly against that commit's tree with no working-tree comparison. `dirty` in the response is always `false`.

**Why:** The overlay only makes sense when the rendered content is the working-tree content. For a historical ref the SPA wants the committed content — and we don't return the bytes anyway; the SPA isn't going to display historical content next to a working-tree blame. The simpler path is the right one here.

### Decision 6: Status data is lifted to a context, fed by the existing changes-badge fetch

**Choice:** Add a `GitStatusContext` (or similar) at the SPA layout level that owns the `/api/git/status` fetch and exposes:
- the raw response (used by the existing changes badge)
- a `pathStatus(path)` helper returning `clean | staged | unstaged | untracked`

The changes badge migrates from doing its own fetch to reading from the context. The file viewer reads `pathStatus(currentPath)` to decide which strip state to render and whether to put a "Modified locally" banner on the Blame tab.

**Why:** Two consumers of `/api/git/status` shouldn't double-fetch. Centralising the fetch also gives one place to invalidate later if we ever add a refresh trigger.

**Trade-off:** Adds a new context, which is a small refactor of the existing changes-badge component. Worth it; the per-file lookup is a hot path (called from every file open) and inflating one HTTP call per open would matter on mobile.

**Rejected:** A per-file `/api/git/file-status?path=` endpoint. More HTTP traffic, more surface, no gain over reading from the array we already fetch.

### Decision 7: Deep-link blame via `?view=blame` on the existing route, not a new path

**Choice:** The Code / Blame tabs read and write `?view=blame` on the existing file route (`/view/<path>`). Absent or any other value renders Code.

**Why:** Adding `/blame/<path>` would force routing changes and a new component tree that duplicates almost all the file viewer (header strip, file head, tabs). A query param is the smallest delta that survives reload and copy-paste, and the SPA already has `useSearchParams` available.

**Trade-off:** URLs are slightly longer. Acceptable.

**Rejected:** Tabs without URL state. The user explicitly required deep-linkability.

### Decision 8: Blame view layout — three-column desktop, stacked mobile

**Choice:** At ≥768px, each chunk renders as a row containing three columns: chunk metadata (~200–280 px), line-number gutter, code. Below 768px the metadata stacks above the lines as a compact header strip per chunk.

```
≥768px:
┌──────────────────────────┬─────┬──────────────────────────┐
│ abc1234 · refactor parse │  1  │ package server           │
│ anantadwi13 · 3d ago     │  2  │                          │
│                          │  3  │ import (                 │
├──────────────────────────┼─────┼──────────────────────────┤
│ def5678 · initial impl   │  4  │     "fmt"                │
│ anantadwi13 · 2w ago     │  5  │     "io"                 │
└──────────────────────────┴─────┴──────────────────────────┘

<768px:
┌─[abc1234 · refactor parse]──────────────────────────┐
│ anantadwi13 · 3d ago                                │
├──┬──────────────────────────────────────────────────┤
│ 1│ package server                                   │
│ 2│                                                  │
│ 3│ import (                                         │
├─[def5678 · initial impl]────────────────────────────┤
│ anantadwi13 · 2w ago                                │
├──┬──────────────────────────────────────────────────┤
│ 4│     "fmt"                                        │
└──┴──────────────────────────────────────────────────┘
```

**Why:** The desktop pattern matches GitHub's blame layout closely enough to feel familiar; the mobile pattern collapses the column to a strip because there's no room for it. The same `768px` breakpoint the rest of the SPA uses for layout switching keeps the design consistent.

**Implementation:** CSS Grid with a per-chunk template that flips at the breakpoint via a media query. The line-number gutter follows the existing diff-hunk gutter approach (sticky-left in wrap-off mode, never hidden).

### Decision 9: Per-line syntax highlighting in the blame view, same as the diff view

**Choice:** Each blame line is highlighted independently via the shared `lowlight` instance, language derived from the file path via `extToLanguage`.

**Why:** Reuses the documented "per-line approximation" baseline already in production on the diff renderer. Whole-file context (the alternative) would require coalescing the file content first and then re-splitting after highlight — the same problem the diff renderer rejected.

**Trade-off:** Multi-line constructs (block comments, template literals) re-tokenise per line. Already-accepted approximation in this codebase.

### Decision 10: Uncommitted chunks render distinctly, without a commit summary

**Choice:** A chunk with `uncommitted: true` renders with:
- A muted background (CSS custom property `--blame-uncommitted-bg`, themed)
- The label `Working tree` (or `Uncommitted`) in place of the commit subject
- No author, no timestamp, no link to a commit detail page

**Why:** There is no commit object to link to. The visual treatment needs to be different enough that a glance distinguishes "your local edit" from "actually committed" without requiring the user to read the metadata closely.

### Decision 11: `blame_timeout` is a new typed error, not folded into `internal_error`

**Choice:** Extend the typed-errors union with `blame_timeout` (HTTP 503). The SPA renders it with a "Blame took too long for this file — try again or use the history view" empty state, distinct from the generic `internal_error` rendering.

**Why:** The two failure modes are genuinely different. A 5xx generic error is "something broke, retry probably won't help"; a timeout is "this file is too gnarly for blame within the budget — the data is still there, you can use a different surface". Different recovery paths deserve different surfaces.

**Trade-off:** Widens the `ApiError` union by one. Acceptable.

### Decision 12: Strip uses a two-row layout — summary on top, action row [pill] [History] on the bottom

**Choice:** The strip lays out as two rows: a summary row carrying `<short_sha> · <subject> · <author> · <relative-time>` (or an "Untracked / No commits yet" placeholder), and a single action row carrying an optional status pill on its leading edge and the History affordance on its trailing edge. The same layout runs on both desktop (≥768px) and mobile (<768px). On viewports where the summary row doesn't fit, the subject ellipses (CSS `text-overflow: ellipsis`); the rest of the metadata stays.

**Why:** Predictable target for the History pill across viewports — it always lives in the same relative position regardless of whether a status pill is rendered. The earlier "pill above summary" / "pill on its own row on mobile, summary on its own row on desktop" shape made the History affordance move between viewports, which fought muscle memory once users started tapping it from the same file across screen widths. Grouping pill and History on the same row also reads as "what's the status of this file, and where do I go to see more" — they're conceptually one band.

**Rejected:** the original one-row "summary + History" shape with the pill floating above. Looked clean on desktop, but the pill stacked under the action row on mobile (per the original `MAY wrap to two rows` allowance), so the layout was already two-row in practice — just inconsistent.

### Decision 13: Path-filter banner is sticky and offers an explicit clear

**Choice:** When `/git/commits?path=<file>` is rendered, the page emits a sticky header row reading `Commits affecting <path>` with a `[× clear]` link that navigates to `/git/commits` (preserving the active `ref`). For untracked / modified-locally files, a single status row appears below the banner — the same pill the file viewer's strip would render.

**Why:** Without the banner, the filtered list looks identical to the global list and users misread it as "no commits in the repo". The `[× clear]` affordance is the established escape hatch on filtered list views across the web.

### Decision 14: Renames stop blame; no transparent follow

**Choice:** When the blame walk reaches the commit where the path was created via rename, the walk stops. Earlier history of the file under its old path is *not* included.

**Why:** Following renames in blame is delicate to begin with (heuristic-based, can be wrong); combining it with the working-tree overlay multiplies the edge cases (rename + local edit + the renamed predecessor's blame). v1 ships the simpler shape and documents the limitation. Future work can extend the response with an optional "history continues at `<old_path>` before `<sha>`" pointer.

### Decision 15: Blame loads progressively — file content first, attribution second

**Choice:** The Blame view fires the `/raw/<path>` and `/api/git/blame` requests in parallel but renders independently. The moment `/raw/` resolves (~milliseconds), the file content + line-number gutter paint, with a single placeholder chunk spanning the entire file whose metadata cell reads `Computing blame…`. When the blame response lands, the placeholder is replaced with real chunks in place.

**Why:** go-git's `Blame()` walks the commit DAG line-by-line and routinely takes several seconds on moderately-aged files. The original "wait for both then render" pattern made the Blame tab feel broken on first open. Splitting the two tracks gives the user something to read immediately — they can scroll, copy text, even navigate — while attribution computes in the background.

**Trade-off:** the placeholder is a new visual state to maintain. Acceptable: it's the same chunk-row layout as a normal chunk, just with a different metadata cell, so the grid/gutter/code-cell wiring is reused.

### Decision 16: Client-side stale-while-revalidate cache for blame, with request dedup

**Choice:** The SPA maintains a module-level `(path, ref) → BlameResponse` cache + an `inFlight` map of pending Promises. On every Blame mount:

1. Read the cache synchronously. If hit, render the cached chunks immediately (no "Computing blame…" placeholder).
2. Always fire a background fetch via a deduping `fetchBlame()` wrapper that returns the in-flight Promise if one already exists for the same key.
3. While the background fetch is in flight AND cached chunks are visible, render a `Refetching blame…` status pill above the chunk list.
4. On fetch settlement, update the cache + state. The pill goes away.

The cache is per-tab, never persisted; a full page reload re-initialises it to empty.

**Why:** Rapid Code ↔ Blame ↔ Code swaps were the worst-case UX — each Blame open re-paid the multi-second blame walk. With SWR, the second open feels instant. Dedup matters when the user opens Blame, unmounts before the request resolves, and re-opens shortly after: the original request keeps running, populates the cache on completion, and the remount joins the same Promise rather than starting a duplicate.

The `Refetching blame…` pill is the answer to "how does the user know the cached chunks might be stale?" It's a small visual surface for the otherwise-invisible background work — important when the cached attribution genuinely could be out of date (the working tree was edited, a new commit landed, etc).

**Why this doesn't violate the spec's "no caching" non-goal:** that non-goal targets the **server**. Every `/api/git/blame` HTTP request that does reach the server still invokes go-git fresh. The cache is purely a SPA optimization between request-issuing components.

**Trade-off:** stale data can be visible for a few seconds after the file changes externally. Bounded by the background fetch latency. Documented as a deliberate UX choice.

**Rejected:** persisting the cache to `localStorage`. Storage would survive reloads but the spec's "no live updates" non-goal explicitly says a page reload is the user's signal to re-fetch — persisting would silently bypass that.

## Risks / Trade-offs

- **Per-file commit walk on deep histories.** Each commit needs a parent diff to decide whether the file was touched. On a 50k-commit repo where the file is touched twice, we still walk the chain — bounded by the page `limit` (≤100). → No mitigation in v1. If reports surface, two options exist: a server-side bounded walk (stop after N commits scanned, return a partial page with a "scanned, no more in last N" marker), or wiring up go-git's `LogOptions.PathFilter`. Flagged as a future watch-item, not a blocker for v1.

- **Working-tree overlay correctness.** The diff between HEAD's blob and working-tree bytes drives the line mapping. A subtle bug (off-by-one in line counting, mis-handling of the no-trailing-newline case, line-ending mismatches) produces visibly wrong attribution. → Mitigated by unit tests in `blame_test.go` for: file ending with `\n`, file with no trailing newline, CRLF normalisation parity with the patch endpoint, all-deletion case, all-insertion case, interleaved unchanged/changed runs. The existing `patch.go` already handles most of these for the diff endpoint; the blame test suite mirrors them.

- **Blame timeout is a real possibility.** A 5000-line file with deep history can push go-git's blame past 10 s. → Mitigated by Decision 11 (typed error with a distinct SPA empty state). The user can fall back to the History view which doesn't hit the blame path. Future work could explore a streaming blame response.

- **Status context invalidation.** If the user makes a commit (somehow — only externally; we have no write surface) while the page is open, the status context goes stale and the strip lies until reload. → Same as the existing "no live updates" non-goal. Documented; no new mitigation.

- **Deep-link via query param means a stale `?view=blame` on a non-text file resolves to the Code tab silently.** A copy-pasted URL pointing at a binary file with `?view=blame` will land on the Download fallback rather than render blame. → Mitigated by the Blame tab only being eligible for `kind === 'text'`; the URL still works, it just renders the same as `/view/<path>` would. Acceptable.

- **Demo GIFs drift.** CLAUDE.md mandates re-recording when SPA UI changes. → Mitigated by an explicit task in `tasks.md` calling the `record-demo-gif` skill, gated on UI completion.
