## 1. Pre-flight (decisions locked, screenshot still open)

- [x] 1.1 License: MIT, copyright `anantadwi13`, current year. (Confirmed.)
- [x] 1.2 Commit `internal/server/ui/dist/`: yes. (Confirmed.)
- [x] 1.3 Decide screenshot now vs. placeholder + `<!-- TODO -->`. Default: placeholder.
- [x] 1.4 Badges: Go-version + MIT license shield via shields.io. (No CI badge yet.)

## 2. Add LICENSE

- [x] 2.1 Create `LICENSE` at repo root with the MIT license text, copyright `anantadwi13` + current year.
- [x] 2.2 Reference the license file from the README "License" section.

## 3. Stop ignoring the embedded SPA dist

- [x] 3.1 Edit `.gitignore`: remove the `internal/server/ui/dist/` line.
- [x] 3.2 Run `make web` to produce a fresh `internal/server/ui/dist/`.
- [x] 3.3 `git add internal/server/ui/dist` so the built assets are staged.
- [x] 3.4 Verify by running `go build ./cmd/explorer` against a clean Go module cache (no `make` step) and confirming the binary serves a non-empty SPA at `/`.

## 4. Document the "regenerate dist when SPA changes" rule in three places

- [x] 4.1 Add a `web-commit` target to `Makefile` that runs `cd web && npm run build && cd .. && git add internal/server/ui/dist`. Above the target, add a short comment: `# Rebuild the embedded SPA and stage it. Run this before committing any change under web/src/.`
- [x] 4.2 Add `internal/server/ui/dist/** linguist-generated=true` to `.gitattributes` so GitHub collapses the generated diff in PR review (create the file if absent).
- [x] 4.3 Update `CLAUDE.md` (the project one in `/Users/anantadwi13/Documents/Projects/exploration/llm/explorer/CLAUDE.md`) under the "Architecture → Single-binary embed" subsection: add a sentence stating that `internal/server/ui/dist/` is committed to source control and that **any change under `web/src/` requires running `make web-commit` (or `make web` + `git add internal/server/ui/dist`) in the same commit** so module-proxy installs (`go install`/`go run`) pick up the new SPA.
- [x] 4.4 In README's Development section, list `make web-commit` alongside the existing dev targets with a one-line description.
- [x] 4.5 In README's Contributing section, restate the rule explicitly: "If your PR touches `web/src/`, run `make web-commit` and include the regenerated `internal/server/ui/dist/` in the same commit."

## 5. Rewrite README

- [x] 5.1 Replace the existing top section with: project name, one-sentence pitch, badges (Go version, license).
- [x] 5.2 Add a screenshot reference (`docs/screenshot.png` or similar) — drop in real image if available, otherwise leave the reference and a `<!-- TODO: capture -->` HTML comment.
- [x] 5.3 Add a "Why explorer?" subsection (2–4 sentences: read markdown/text/images on a phone over LAN, single static binary, no auth/no write).
- [x] 5.4 Restructure the install section into three subsections:
  - [x] 5.4.1 **With Go (recommended for users)**: `go install github.com/anantadwi13/explorer/cmd/explorer@latest` and `go run github.com/anantadwi13/explorer/cmd/explorer@latest <dir>`. Note Go 1.24+ requirement and `$GOBIN` PATH expectation. Mention that pinning to a tag (e.g. `@v0.1.0`) is recommended once tags exist.
  - [x] 5.4.2 **From source (for contributors)**: `git clone … && make build`. Note Node 18+ (or whatever Vite requires) requirement.
  - [x] 5.4.3 **Docker / Docker Compose**: keep existing content; clarify that `--host 0.0.0.0` is mandatory inside the container.
- [x] 5.5 Keep the "Quick start" section with the three example invocations and the LAN warning callout.
- [x] 5.6 Keep the configuration table (`--port`, `--host`).
- [x] 5.7 Move the "What it does" bullets into a "Features" section after Quick start.
- [x] 5.8 Add a "Security model" section: read-only by design, loopback default, path-traversal containment (mention out-of-root symlinks are dropped), explicit warning that `--host 0.0.0.0` exposes files to anyone on the LAN.
- [x] 5.9 Update the "Development" section: keep `dev-server` + `dev-web` flow, add `make web-commit` (from task 4.1), add the test command.
- [x] 5.10 Keep "Out-of-scope (v1)" as-is.
- [x] 5.11 Keep "Troubleshooting" and add an entry: "`go install` produced a binary that returns 501 / blank page" → "your `internal/server/ui/dist/` is empty; this should not happen with `@latest`. Open an issue."
- [x] 5.12 Add a short "Contributing" section: open issues/PRs welcome, run `make test` before submitting, run `make web-commit` if you touched `web/src/`.
- [x] 5.13 Add a "License" section linking to `LICENSE`.
- [x] 5.14 Fix the stated Go version: change `Go 1.21+` to `Go 1.24+` (matches `go.mod`).

## 6. Verify the install paths actually work

- [x] 6.1 In a clean shell, run `go install github.com/anantadwi13/explorer/cmd/explorer@latest` (or the local equivalent if not yet pushed: build from a fresh clone of the branch using `go install ./cmd/explorer`) and exercise it against `./testdata`. Confirm the SPA loads and the API returns a tree listing.
- [x] 6.2 In a clean shell, run `go run github.com/anantadwi13/explorer/cmd/explorer@latest ./testdata` (or local equivalent) and repeat the smoke test.
- [x] 6.3 Run `make build && ./explorer ./testdata` to confirm the existing flow is unbroken.
- [x] 6.4 Run `make test` and confirm all Go tests still pass.

## 7. Pre-publication housekeeping

- [x] 7.1 Skim the rendered README on GitHub (or via a markdown preview) to catch broken anchors, image paths, code-fence languages.
- [x] 7.2 Confirm no internal-only paths or sandbox references leaked into the README.
- [x] 7.3 Note (in the PR description, not code) the recommendation to cut a `v0.1.0` tag after merge so `@v0.1.0` works for `go install` consumers. *(Reminder for PR description: cut `v0.1.0` after merge so `go install ...@v0.1.0` works.)*
