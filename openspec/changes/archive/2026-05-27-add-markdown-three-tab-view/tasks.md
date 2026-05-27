## 1. SPA component changes

- [x] 1.1 Extend `FileViewerTab` union in `web/src/components/FileViewerTabs.tsx` to include `'preview'`.
- [x] 1.2 Change `FileViewerTabs` to accept a `tabs: FileViewerTab[]` prop and iterate over it (remove the hardcoded `const TABS`). Update keyboard navigation and ARIA wiring to derive length from the prop. Render the label as `Preview`/`Code`/`Blame` based on the tab value.
- [x] 1.3 In `web/src/components/FileViewer.tsx`, add a `tabsForKind(kind)` helper returning `['preview','code','blame']` for markdown, `['code','blame']` for text, `[]` otherwise. The first entry is the kind's default tab.
- [x] 1.4 Update the URL parse logic: read `?view=` and resolve to the first available tab if value is missing, unrecognised, or not in `tabsForKind(kind)`.
- [x] 1.5 Update the URL emit logic so every tab activation writes `?view=<active>` explicitly (no longer deletes the parameter when the active tab equals the legacy default). Keep `replace: true` on `setSearchParams`.
- [x] 1.6 Replace the existing `showWrapToggle = meta.kind === 'text'` check with `activeTab === 'code' || activeTab === 'blame'`.
- [x] 1.7 In the render switch, add the markdown Code branch (`<CodeBlock code={content!} language={extToLanguage(path)} wrap={wrap} />`) and the markdown Blame branch (`<BlameView path={path} wrap={wrap} />`) so all three tabs render correctly. Markdown Preview branch stays as-is.
- [x] 1.8 Render `<FileViewerTabs tabs={tabsForKind(meta.kind)} ... />` for both `kind === 'text'` and `kind === 'markdown'` (today it's text-only).

## 2. Syntax-highlighting verification

- [x] 2.1 Verify the markdown grammar is already registered in `web/src/components/syntax/grammars.ts` (it is at the time of writing: the file imports `markdown` from `highlight.js/lib/languages/markdown`, registers it on the shared `lowlight` instance, and `extToLanguage('.md')` returns `'markdown'`). Add a focused unit test in `grammars.test.ts` asserting `extToLanguage('foo.md')` and `extToLanguage('foo.markdown')` both return `'markdown'` and that the registered grammar list contains `'markdown'` — so a future contributor who removes the registration sees a test fail.
- [x] 2.2 Run `cd web && npm test` and `make test` to confirm the existing grammar/MIME alignment tests still pass after the Code tab path starts using `extToLanguage` for `.md` files.

## 3. Tests

- [x] 3.1 In `web/src/components/FileViewerTabs.test.tsx`, add tests for the three-tab markdown case: render order (Preview / Code / Blame), keyboard nav cycle (arrows, Home, End), `aria-selected` correctness.
- [x] 3.2 In `web/src/components/FileViewer.test.tsx`, add tests covering:
  - Markdown file with no `?view=` → Preview tab active by default.
  - Markdown file with `?view=blame` → Blame tab active on first paint.
  - Markdown file with `?view=code` → Code tab renders the source via `<CodeBlock>` with markdown highlighting.
  - Markdown file with `?view=preview` after activating from another tab → URL writes `?view=preview` explicitly (does NOT delete parameter).
  - Text file with `?view=preview` → Code tab active (defensive fallback).
  - Wrap toggle hidden on markdown Preview tab; visible on markdown Code and markdown Blame tabs; visible on text Code and Blame tabs.
  - `?at=<sha>` value on URL is ignored in current implementation (Preview tab renders working-tree bytes).

## 4. Build artifacts and demo GIFs

- [x] 4.1 Run `make web-commit` to regenerate `internal/server/ui/dist/*` and stage the regenerated dist in the same commit as the source changes (per CLAUDE.md).
- [x] 4.2 Regenerate `docs/desktop.gif` and `docs/mobile.gif` via the `record-demo-gif` skill so the README's demo reflects the new markdown tablist (per CLAUDE.md: visible SPA UI changes MUST regenerate the GIFs in the same change). If the skill cannot run in the current environment, surface this as a blocker — do not defer.

## 5. Verify and validate

- [x] 5.1 Run `make test` and `cd web && npm test` — confirm all suites pass.
- [x] 5.2 Run `make build` and exercise the new tabs manually against `./testdata`: open a markdown file, switch through Preview / Code / Blame, copy the link from each, paste in a fresh tab, confirm correct restoration. Try a legacy URL without `?view=`. Try `?view=preview` on a text file. (Interactive browser flow exercised by the regenerated demo GIFs which click through Preview → Code → Blame → Preview on `README.md`; URL routing for `?view=preview`, `?view=code&at=<sha>`, and the legacy no-`view=` form was smoke-checked against the built binary; SPA-level tab/URL behaviour is covered by the unit tests added in §3.)
- [x] 5.3 Run `openspec validate add-markdown-three-tab-view --strict` and confirm the change is valid.
