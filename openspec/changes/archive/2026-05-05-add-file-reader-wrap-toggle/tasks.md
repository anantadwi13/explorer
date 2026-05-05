## 1. State + persistence

- [x] 1.1 Add `useWrap` hook at `web/src/hooks/useWrap.ts` built on the project's `useLocalStorageSetting` primitive (same pattern as `useDensity` / `useViewMode`): reads `localStorage["explorer.wrap"]`, returns `[wrap: boolean, setWrap: (b: boolean) => void]`, defaults to `true` (wrap on) when key is missing or unrecognized.
- [x] 1.2 Unit test the hook: defaults to `true` with no key, reads `"off"` → `false`, write toggles and persists, ignores unknown values.

## 2. Icon + button styling

- [x] 2.1 Add a `WrapIcon` SVG to `web/src/components/icons.tsx` (single glyph, same icon used for both states).
- [x] 2.2 In `web/src/components/Layout.css` (alongside the existing shared `.icon-btn` rules), add `.icon-btn[aria-pressed="true"]` styling using `var(--bg-soft)` background and `var(--accent)` foreground so the engaged state is visible in both themes.

## 3. Wire toggle into FileViewer

- [x] 3.1 In `web/src/components/FileViewer.tsx`, call `useWrap()` and render a new `.icon-btn` in `.file-head-actions` only when `meta.kind === 'text'`. Set `aria-pressed={wrap}` (button is engaged while wrap is enabled — conventional toggle semantic), `aria-label`/`title` to "Wrap lines: on" or "Wrap lines: off" depending on state, and an `onClick` that flips state.
- [x] 3.2 Pass `wrap` as a prop to `<CodeBlock>`.
- [x] 3.3 Confirm the toggle is NOT rendered for `markdown`, `image`, error, and not_regular states.

## 4. CodeBlock wrap mode

- [x] 4.1 Update `web/src/components/CodeBlock.tsx` to accept a `wrap?: boolean` prop (default `true`) and apply `wrap-on` or `wrap-off` class to the `<pre>`.
- [x] 4.2 In `web/src/components/FileViewer.css`, split the existing `.code-block` rules: keep shared font/padding/color, move wrapping rules into `.code-block.wrap-on` (current behavior) and add `.code-block.wrap-off { white-space: pre; word-break: normal; overflow-wrap: normal; overflow-x: auto; }`.
- [x] 4.3 Verify the page itself does not gain a horizontal scrollbar when wrap is off — overflow stays inside the `.code-block`.

## 5. Mobile compactness

- [x] 5.1 Confirm visually at viewport 375 px wide that the wrap toggle occupies the same 32×32 footprint as the Copy-link icon button and no text label is shown.
- [x] 5.2 Confirm the actions row does not wrap or push the filename out of view on mobile.

## 6. Tests

- [x] 6.1 Update or add `FileViewer` tests (Vitest + React Testing Library, matching existing patterns under `web/src/components/`) covering: toggle hidden for markdown/image/error, toggle visible and clickable for text, click flips `aria-pressed` and updates `localStorage`, persisted `"off"` is honored on mount.
- [x] 6.2 Update `CodeBlock` tests to assert the `<pre>` carries `wrap-on` by default and `wrap-off` when prop is `false`.
- [x] 6.3 Run `cd web && npm run lint && npm test`; fix any lint/test fallout.

## 7. Build, embed, document

- [x] 7.1 Run `make web` to rebuild `internal/server/ui/dist/`; commit the dist update alongside source changes (or use `make web-commit` if available) so module-proxy installs ship the toggle. Note: the over-broad `dist/` rule in `.gitignore` was anchored to `/dist/` so the SPA build output is no longer accidentally ignored — `make web-commit` (`git add internal/server/ui/dist`) now stages the new hashed assets correctly.
- [x] 7.2 Run `make test` (Go) to confirm no regressions.
- [x] 7.3 Smoke-test manually with `make dev-server` + `make dev-web`: open a long-lined source file, toggle off → horizontal scroll appears; reload → state persists; navigate to markdown → toggle disappears.
- [x] 7.4 Update `CLAUDE.md` (SPA conventions section) with a one-liner noting `localStorage["explorer.wrap"]` and the FileViewer toggle, mirroring the existing theme-key note.
