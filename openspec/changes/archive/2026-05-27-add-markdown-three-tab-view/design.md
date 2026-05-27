## Context

`FileViewer.tsx` is the single component that renders previewable files in the SPA. It already handles three kinds (markdown, text, image), drives the `[Code | Blame]` ARIA tablist via the `FileViewerTabs` component for text files, and reflects the active tab to `?view=blame` on the URL. The Code↔Blame tab swap was introduced in the per-file history/blame change (commit `81020b4`, capability `web-ui`).

Markdown files currently bypass the tablist entirely: `FileViewer` only renders `<MarkdownRenderer>` and never touches `?view=`. Adding three tabs to markdown introduces three things that need to be designed coherently:

1. **A variable tab set per kind** — text keeps two tabs, markdown gets three, image stays tabless.
2. **A generalized `?view=` URL grammar** that covers `preview | code | blame` and remains compatible with existing bookmarks (which never carried `?view=` for markdown and may carry `?view=blame` for text).
3. **A wrap-toggle visibility rule** that follows the active tab rather than the file kind, so the toggle disappears when a markdown user is on Preview and reappears on Code/Blame.

The follow-up file-at-commit proposal (drafted next, implemented later) will add `?at=<sha>` to the same URL grammar. This design pre-emptively reserves that syntax so the future change adds only semantics.

Constraint: no server-side changes. Markdown blame already works because `BlameView` is path-driven and the git blame endpoint treats any path identically.

## Goals / Non-Goals

**Goals:**

- Markdown files render `[Preview | Code | Blame]` with the same look-and-feel as the existing text tablist (`FileViewerTabs.css`, ARIA tablist, keyboard nav, `aria-selected` styling).
- Preview is the default tab for markdown; Code is the default for text. Defaults are derived deterministically from `kind`.
- URLs that the SPA writes always include an explicit `?view=`. URLs without `?view=` (legacy bookmarks) parse identically to the kind's default.
- Wrap-toggle visibility is governed by the active tab (`code` or `blame` → visible), not by the file kind.
- `FileViewerTabs` becomes reusable: it accepts the tab set as a prop and works with any subset/length.
- Markdown Code view is syntax-highlighted (via the same `lowlight` instance used by `CodeBlock`).
- Web-ui spec reserves `?at=<sha>` syntax now so the follow-up change is purely additive.

**Non-Goals:**

- Implementing `?at=<sha>` semantics (separate proposal).
- Adding any tablist UI to image files or non-previewable files.
- Adding a "Preview" tab to text files — there is no separate rendered view for plain text; Code already *is* the preview.
- Server-side endpoint changes. No new routes, no new query parameters honored by the server.
- Restyling the existing tablist; reuse `FileViewerTabs.css` as-is.

## Decisions

### Tab set per kind

Compute the available tab set from `meta.kind` in `FileViewer.tsx`:

```ts
function tabsForKind(kind: FileKind): FileViewerTab[] {
  if (kind === 'markdown') return ['preview', 'code', 'blame']
  if (kind === 'text')     return ['code', 'blame']
  return []  // image, non-previewable → no tablist
}
```

Pass the resulting array as a `tabs` prop into `FileViewerTabs`. The component no longer hardcodes `TABS = ['code','blame']`; it iterates over the prop. The `FileViewerTab` type gains a `'preview'` member.

**Alternative considered:** keep two separate tablist components (`MarkdownTabs` and `TextTabs`). Rejected because the keyboard navigation, ARIA wiring, and styling are identical — duplicating them would invite divergence over time. A single component parametrized on the tab set is one focused change.

### URL grammar

```
/view/<path>?view=<preview|code|blame>[&at=<sha>]
```

- **Generation rule (strict):** whenever the SPA writes the URL after a tab interaction, it always sets `?view=<active-tab>`. The current code path that *deletes* `?view=` when active === 'code' is removed; tab state is always explicit on outbound writes.
- **Parsing rule (tolerant):** on inbound reads, the active tab is:
  1. The value of `?view=` if it equals `preview`, `code`, or `blame` AND is available in `tabsForKind(meta.kind)`;
  2. Otherwise the first entry of `tabsForKind(meta.kind)` — which is the kind's natural default (preview for markdown, code for text).
- **Defensive fallback for cross-kind URLs:** `?view=preview` on a text file collapses to `code`; `?view=code` on an image file is ignored (image has no tabs).
- **`?at=<sha>` reservation:** the web-ui spec includes the parameter in the grammar with a note that current implementation ignores it. The SPA does not parse or emit `at=` in this change.

**Alternative considered:** strict parsing — reject URLs without `?view=` or redirect to a canonical form. Rejected because (a) it breaks every existing markdown bookmark and (b) "permissive on read, strict on write" is the same posture used elsewhere in the SPA (e.g. the trailing-slash folder convention). Documented as a design decision so future contributors understand why parsing is lenient.

**Alternative considered:** put tab in the path segment (`/view/<path>/preview`). Rejected because `/view/<path>` already uses a trailing-slash convention to distinguish folder vs file; layering a third path segment would muddy that.

### Wrap-toggle visibility

Replace the current `showWrapToggle = meta.kind === 'text'` with:

```ts
const showWrapToggle = activeTab === 'code' || activeTab === 'blame'
```

`activeTab` is undefined for image and non-previewable kinds, so this condition is false for them — preserving today's "no wrap toggle for images" behaviour. The wrap-toggle state itself (the `useWrap` hook) is unchanged; only visibility moves to the active-tab signal.

### Markdown grammar registration

`web/src/components/syntax/grammars.ts` registers a curated set of languages with the shared `lowlight` instance. The Code tab for `.md` calls `extToLanguage('foo.md')`; if that returns `null`, `CodeBlock` falls back to plain monospace. We register the `markdown` grammar from `highlight.js/lib/languages/markdown` so `.md` Code view gets headings, fences, and emphasis highlighted.

Per the CLAUDE.md alignment invariant, the Go `extTable` must also return `text/...` for any extension that maps to a non-null grammar. The Go side already classifies `.md` as `markdown` kind (which is text-shaped on disk), so no Go change is required — the alignment test (`TestExtensionsWithTextKindAreTextMIME`) checks `text/...` MIMEs and treats `markdown` kind via its own path. We will run the existing test to confirm; if alignment breaks, a small Go fix lands in the same change.

**Alternative considered:** lazy-load the markdown grammar only when the Code tab is opened. Rejected — the grammar payload is small (< 10 KB minified) and the static registration keeps `grammars.ts` as the single source of truth that `grammars.test.ts` validates.

### Default tab is the first entry of `tabsForKind`

Defining default-by-position keeps the precedence rule in one place. The arrays in `tabsForKind` are ordered intentionally: `['preview','code','blame']` for markdown means Preview is default; `['code','blame']` for text means Code is default. Reorder there if defaults ever need to change.

### URL writeback uses `replace: true`

Already true for the Code↔Blame swap on text files; extend the same posture to all three markdown tabs. Pressing Back from a markdown file should return to the folder or referrer, not cycle through tab states.

## Risks / Trade-offs

- **Risk**: Existing markdown bookmarks that included a meaningless `?view=blame` (from URL-bar typing or external sharing pre-change) would have shown the preview today (silently ignored) and would now show blame. → **Mitigation:** acceptable behaviour change — `?view=blame` on a markdown file genuinely means "show blame" under the new grammar; this is more correct than the old silent ignore. No data loss; users can switch back via the tab.
- **Risk**: Markdown Code tab highlighting may visually clash with the existing Preview rendering — e.g. both could be in the same scroll position when a user swaps tabs and lose context. → **Mitigation:** tabs swap content in place, same content area. Scroll position is component-local React state; not preserved across tabs. Acceptable for v1; users browsing both views switch tabs deliberately. If feedback says otherwise, a follow-up can store per-tab scroll in `useRef`.
- **Risk**: `FileViewerTabs` keyboard nav with 3 tabs may reveal latent bugs in the existing 2-tab implementation (off-by-one on `Home`/`End`). → **Mitigation:** the existing impl uses `TABS.length - 1` for `End` and modular arithmetic for arrows, which generalize cleanly. Tests in `FileViewerTabs.test.tsx` will cover all four arrow/home/end keys against the 3-tab case.
- **Trade-off**: Reserving `?at=<sha>` in the spec without implementing it documents intent but creates a brief window where the spec mentions a parameter the code ignores. → **Mitigation:** the spec entry explicitly notes "reserved; current implementation ignores". The follow-up proposal flips the note to "honored".
- **Risk**: Demo GIF regeneration via the `record-demo-gif` skill must succeed; if it doesn't, CLAUDE.md says the change is incomplete (UI drifts ahead of docs). → **Mitigation:** the implementation tasks call out the GIF regen step explicitly so it isn't deferred. If the recording rig is unavailable at implementation time, that's a blocker on the change, not a follow-up.

## Migration Plan

Single-shot deployment, no migration. The change is committed as one PR including:

1. SPA source edits in `web/src/`.
2. Regenerated `internal/server/ui/dist/` via `make web-commit`.
3. Spec delta in `openspec/specs/web-ui/spec.md`.
4. Regenerated `docs/desktop.gif` and `docs/mobile.gif`.

No rollback strategy beyond `git revert` — the change is internal to one component and doesn't touch the server, persistent storage, or external interfaces.

## Open Questions

- None. The URL grammar, tab set, wrap-toggle rule, and `?at=` reservation were ratified during the exploration phase.
