## Context

`explorer` is a single-binary local directory browser at `github.com/anantadwi13/explorer`. Until now the README has assumed a developer who has the repo cloned and Node installed. The project is being published publicly, which raises three problems:

1. **First-impression docs.** GitHub visitors decide in seconds. The current README opens with "what it does" but lacks a screenshot, a one-line install, a license, badges, or a clear "why use this".
2. **No Go-only install path.** A user with just a Go toolchain (no Node) cannot install `explorer` today. `go install github.com/anantadwi13/explorer/cmd/explorer@latest` would compile, but `internal/server/ui/dist/` is gitignored, so the embedded `embed.FS` is empty and the server falls back to the 501 stub. They'd get a binary that "works" but serves nothing useful.
3. **Stale facts.** README claims Go 1.21+; `go.mod` declares 1.24.4. There is no `LICENSE` file, which makes the project legally unusable by others even though it's "public".

This change addresses all three with documentation and one structural decision (committing the SPA build output).

## Goals / Non-Goals

**Goals:**
- A `README.md` that a stranger landing on the GitHub page can read top-to-bottom and (a) understand what `explorer` does, (b) install it via the path that matches their toolchain, (c) run it safely, and (d) know what license governs reuse.
- `go install github.com/anantadwi13/explorer/cmd/explorer@latest` works out-of-the-box and produces a fully-functional binary with the SPA embedded.
- `go run github.com/anantadwi13/explorer/cmd/explorer@latest <dir>` works the same way for try-before-install.
- The build/dev workflow for contributors stays intact (`make build`, `make dev-server` + `make dev-web`).
- The security model (read-only, loopback by default, path-traversal containment) is surfaced in the README, not buried.

**Non-Goals:**
- No CI workflow in this change. (A follow-up could add a GitHub Action that verifies `dist/` is in sync with sources, but that's outside the README scope.)
- No release automation, GitHub releases, prebuilt binary artifacts, or signed checksums.
- No code changes in `cmd/`, `internal/server/`, or `web/` source files. The embed wiring already works; it just lacks committed content.
- No website, GitHub Pages, or external docs site — README is the canonical entry point.

## Decisions

### Decision 1: Commit `internal/server/ui/dist/` to source control

**Choice:** Stop gitignoring the SPA build output. Commit the generated `dist/` files so `go install`/`go run` from the module path embeds a real SPA.

**Why:** The `//go:embed all:dist` directive bakes whatever is in that directory at compile time. When users `go install` from the proxy, they get the source tarball — no `make web` runs on their machine. The only way to ship a working binary via the Go toolchain is to ship the built assets in the repo. This is the same pattern used by tools like `goreleaser`, `caddy` plugins, and most Go-based static-site generators.

**Alternatives considered:**
- *Run `go generate` to invoke `npm run build`.* Doesn't help — `go install` does not run `go generate` on the consumer's machine, and even if it did, requiring Node defeats the point.
- *Use a separate build pipeline that commits dist on a release branch only.* Adds release-engineering overhead disproportionate to the project size. Easier to keep `main` always-installable.
- *Publish prebuilt binaries via GitHub Releases and document `curl | sh`.* Useful complement but doesn't satisfy the "works with the Go toolchain alone" goal. Could be added later without conflict.

**Trade-off:** PR diffs that touch the SPA will include regenerated minified JS/CSS. Mitigation: a `make web-commit` target (or pre-commit hook documented in CONTRIBUTING) that rebuilds and stages `dist/` so contributors don't forget. Reviewers can ignore the `dist/` chunk and focus on `web/src/`.

### Decision 2: Two install paths in README, ordered by audience

**Choice:** README presents installs in this order: (1) `go install`, (2) prebuilt binary placeholder for future releases, (3) clone + `make build` for contributors. Docker keeps its own section.

**Why:** Most public-repo visitors with the patience to install something either have Go (it's a Go project) or want a one-liner. `go install` covers both. `make build` is the contributor flow; visitors don't need to read it first.

**Alternatives considered:**
- *Single "build from source" path.* Worse UX for the "I just want to try it" case.
- *Lead with Docker.* `docker compose up --build` clones the repo too, so it's not really lighter; and Docker users are a subset.

### Decision 3: License — MIT (confirmed)

**Choice:** Add `LICENSE` (MIT) at repo root. Copyright holder: the GitHub account owner (`anantadwi13`); year: current year.

**Why:** MIT is the de facto choice for small Go OSS tools — permissive, short, well-understood. Apache-2.0 is the main alternative (adds patent grant and contributor terms) but is overkill for a single-binary utility with no patentable surface.

### Decision 4: Update `.gitignore`, not the embed wiring

**Choice:** Remove `internal/server/ui/dist/` from `.gitignore`. Leave `internal/server/ui/ui.go` (the `//go:embed` directive) untouched.

**Why:** The embed contract is fine; the only thing wrong is that the directory it points at is empty in fresh clones. Un-ignoring it fixes that. Keep `web/node_modules/` ignored.

### Decision 5: README structure (top → bottom)

```
1. Hero: name + one-sentence pitch + (optional badges)
2. Screenshot (placeholder image with TODO note for apply)
3. Why explorer? (use case: phone-on-LAN, read markdown/text/images)
4. Install
   ├─ Go toolchain (go install / go run)
   ├─ From source (git clone + make build)
   └─ Docker / Docker Compose
5. Quick start (3 example invocations + the LAN warning callout)
6. Configuration (--port, --host table)
7. Features (current bullets, lightly edited)
8. Security model (read-only, loopback default, path containment, the 0.0.0.0 caveat)
9. Development (dev-server + dev-web flow, test command)
10. Out-of-scope (existing list)
11. Troubleshooting (existing items + "go install gave me a 501" → was committed dist missing?)
12. Contributing (one paragraph: open issues/PRs welcome, run tests, regenerate dist)
13. License (MIT, link to LICENSE)
```

**Why this order:** Pitch → proof → install → use → details. Mobile-friendly: the first viewport on phone-sized GitHub pages shows hero + install command, not internal architecture.

## Risks / Trade-offs

- **[Risk] Committed `dist/` becomes stale.** A contributor edits `web/src/` but forgets to rebuild and commit `dist/`. Released binaries serve old SPA against new API.
  → **Mitigation:** Add a `make web-commit` target that runs `npm run build && git add internal/server/ui/dist`. Document in CONTRIBUTING that PRs touching `web/` must include a regenerated `dist/`. Future CI: a job that runs `make web` and fails if `git status` shows changes under `dist/`.

- **[Risk] PR review noise from minified `dist/` diffs.** Reviewers will see large diffs in generated files.
  → **Mitigation:** Mark `internal/server/ui/dist/**` as `linguist-generated=true` in `.gitattributes` so GitHub collapses it in diff views. (Non-blocking nice-to-have for this change.)

- **[Risk] Repo size grows with every SPA build.** Vite output is small (tens of KB gzipped, low hundreds raw) but accumulates in git history.
  → **Mitigation:** Acceptable for a tool of this size. Repo stays well under 10 MB for years at expected change cadence.

- **[Risk] `go install` users get whatever was on `main` at the time, including in-progress changes.** No version tags currently exist.
  → **Mitigation:** Out of scope for this change, but cut a `v0.1.0` tag soon after merging so users can pin (`@v0.1.0`). Mention this in the README install section.

- **[Trade-off] README grows from ~115 lines to roughly 200–250.** Longer is fine if it's better organized; the existing length is artificially short because it skips license, contributing, security, and screenshots.

## Migration Plan

1. Land the README + LICENSE + `.gitignore` change.
2. Run `make web` and commit the resulting `internal/server/ui/dist/` in the same PR (or a follow-up — the `dist` commit is what unlocks `go install`, so prefer same PR).
3. After merge, tag `v0.1.0` so consumers can pin a known-good version.
4. (Optional follow-up) GitHub Action to verify `dist/` parity with sources on each PR.

No rollback complexity: the change is documentation + tracked-files, both reversible by `git revert`.

## Resolved Decisions (post-review)

- **License:** MIT, copyright `anantadwi13`, current year.
- **Commit `internal/server/ui/dist/`:** confirmed yes.
- **"Always regenerate UI when changed" must be documented in three places** so it survives different audiences finding the project from different angles:
  1. `Makefile` — a `web-commit` target with a comment explaining when to run it.
  2. `README.md` — both the Development section and the Contributing section call out: if you touched `web/src/`, run `make web-commit` before committing.
  3. `CLAUDE.md` — a short paragraph under the build/conventions guidance reminding future Claude (and humans skimming) that SPA changes require a `dist/` regeneration in the same commit.

## Open Questions

- **Screenshot.** README will include a `![explorer screenshot](docs/screenshot.png)` placeholder. If no real image is available at apply time, leave the reference + an HTML `<!-- TODO -->` comment.
- **Badges.** Include Go-version badge and MIT license badge (shields.io). Skip build-status badge until a CI workflow exists.
- **CONTRIBUTING.md.** Keep contributing inline in README for now; split into its own file later if the section outgrows ~30 lines.
