## Why

Markdown files in the FileViewer only show the rendered preview today. Text files already get a `[Code | Blame]` tablist; markdown gets nothing equivalent, so there is no way to view the raw source with syntax highlighting or attribute lines to commits without leaving the viewer. Folding markdown into the same tab model makes the FileViewer's behaviour uniform across previewable kinds and unblocks a follow-up change that will let users view any file at a specific commit (`?at=<sha>`).

## What Changes

- Markdown files (`kind === 'markdown'`) gain a `[Preview | Code | Blame]` tablist above the content area. Preview is the default and renders the existing `MarkdownRenderer`; Code shows the raw source via `CodeBlock` with markdown syntax highlighting; Blame shows the existing `BlameView`.
- Text files keep their `[Code | Blame]` tabs unchanged. Image and non-previewable files remain tabless.
- The `?view=` URL parameter is generalized to `preview | code | blame`. The SPA **always emits** an explicit `?view=` when writing tab state to the URL. Absent or unknown values are still **tolerated** on read and fall back to the kind's natural default (preview for markdown, code for text, image for image), preserving every existing bookmark.
- The wrap-toggle button in the file header is shown/hidden based on the **active tab** (Code or Blame → shown; Preview, Image, error → hidden). Today it keys off `kind === 'text'`, which would hide it on a markdown Code tab.
- `FileViewerTabs` accepts a `tabs: FileViewerTab[]` prop so callers pick the tab set per kind (`['code','blame']` for text, `['preview','code','blame']` for markdown). The `FileViewerTab` union gains `'preview'`.
- Markdown grammar is already registered in `web/src/components/syntax/grammars.ts` (the `lowlight` instance has `markdown` registered and `extToLanguage('.md')` returns `'markdown'`). This change confirms that registration is sufficient for the new Code tab path and adds a test asserting it; no new grammar import is required.
- The `git-reader` spec **reserves** `?at=<sha>` syntax in the URL grammar (alongside `?view=`) with a "reserved for future use; ignored by current implementation" note, so the follow-up file-at-commit proposal only adds semantics, not syntax.

## Capabilities

### New Capabilities
<!-- None — this change extends two existing capabilities. -->

### Modified Capabilities
- `git-reader`: the "Code and Blame tabs in the file viewer" requirement is extended to cover three-tab markdown variant, the `?view=preview|code|blame` URL grammar with always-explicit emission rules + tolerant parse, and the reserved `?at=<sha>` syntax placeholder.
- `web-ui`: the "File reader wrap toggle" requirement's visibility rule is changed from "kind === text" to active-tab-based (Code or Blame → shown; Preview / Image / error → hidden).

## Impact

- **SPA code**: `web/src/components/FileViewer.tsx` (tab set per kind, URL parse/emit, wrap-toggle visibility), `web/src/components/FileViewerTabs.tsx` (tabs prop, `'preview'` member). `web/src/components/syntax/grammars.ts` is read-only here (markdown grammar already registered).
- **SPA tests**: `FileViewer.test.tsx` (markdown tab cases, URL emit, wrap-toggle visibility per tab), `FileViewerTabs.test.tsx` (3-tab keyboard nav and ARIA), `grammars.test.ts` (assert `extToLanguage('.md')` returns `'markdown'` and the grammar is registered).
- **Embedded SPA bundle**: `internal/server/ui/dist/*` regenerated via `make web-commit` and committed in the same change (per CLAUDE.md, the dist is checked in so `go install` works without Node).
- **Specs**: deltas in `openspec/specs/git-reader/spec.md` and `openspec/specs/web-ui/spec.md`.
- **Documentation**: `docs/desktop.gif` and `docs/mobile.gif` regenerated via the `record-demo-gif` skill, since this is a visible SPA UI change (per CLAUDE.md, demo GIFs must be refreshed in the same change as visible UI updates).
- **No server-side changes.** No new Go or npm dependencies. No new HTTP endpoints. No change to `/api/meta`, `/raw/`, or `/api/git/blame`.
- **Out of scope**: `?at=<sha>` semantics (separate proposal), tabs for image files, a "Preview" tab for text files.
