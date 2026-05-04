## Why

Today the only ways to run `explorer` are: clone the repo and run `make build` (which requires Go **and** Node), or `go install github.com/anantadwi13/explorer/cmd/explorer@latest` (which requires Go on the user's machine but at least skips Node thanks to the committed `internal/server/ui/dist/`). Neither path works for a user who just wants to download a single file and run it — and that is the natural distribution shape for a single-binary CLI. The README already pitches the project as a "single static binary" but there is no place to download one. Shipping prebuilt archives for every common OS/arch closes that gap and matches what tools in the same neighbourhood (e.g. `gh`, `rg`, `fd`, `bat`) do.

## What Changes

- Add an automated release pipeline (GitHub Actions) that, on every pushed tag matching `v*.*.*`, builds the SPA once, then cross-compiles the Go binary for the supported OS/arch matrix and uploads archives to a GitHub Release.
- Add a parallel **PR build workflow** (`.github/workflows/pr-build.yml`) that runs on every `pull_request` event (opened/synchronize/reopened), builds the same six-target matrix in both shapes, runs the same smoke + structural checks, and uploads the assets as **GitHub Actions workflow artifacts** (downloadable from the PR's "Checks" tab for the default ~90-day retention) — no GitHub Release is created. PR builds embed `v0.0.0-<short-sha>` (e.g. `v0.0.0-abc1234`) as the version so a downloaded test binary is unambiguously identifiable as a per-commit pre-merge artifact, never confusable with a tagged release.
- Supported targets (six per shape; both shapes shipped per target — see "Two asset shapes" below):
  - `linux/amd64`, `linux/arm64`
  - `darwin/amd64` (Intel Macs), `darwin/arm64` (Apple Silicon)
  - `windows/amd64`, `windows/arm64`
- Two asset shapes per target — the user picks whichever they prefer:
  - **Archive** (preserves executable bit, bundles `LICENSE` and `README.md`):
    - `*.tar.gz` for linux + darwin (`explorer` entry plus `LICENSE` and `README.md`)
    - `*.zip` for windows (`explorer.exe` plus `LICENSE` and `README.md`)
    - File naming: `explorer_<version>_<os>_<arch>.<ext>` (e.g. `explorer_v1.2.0_linux_amd64.tar.gz`)
  - **Bare binary** (one-step download; user runs `chmod +x` on unix; `LICENSE` lives at the repo URL):
    - linux + darwin: bare file with no extension, named `explorer_<version>_<os>_<arch>` (e.g. `explorer_v1.2.0_linux_amd64`)
    - windows: `explorer_<version>_windows_<arch>.exe`
  - Both shapes share the same filename prefix; the binary inside each archive is byte-identical to the corresponding bare binary (same `go build` invocation).
- Publish a single `checksums.txt` per release listing the SHA-256 of every release asset across both shapes (twelve lines total: six archives + six bare binaries), in the canonical `sha256sum` format so users can verify with `sha256sum -c checksums.txt`.
- Embed the release version into the binary so `explorer --version` prints `<version> (commit <short-sha>, built <yyyy-mm-dd>)`. Built via `-ldflags "-X main.version=... -X main.commit=... -X main.buildDate=..."`. When built locally without ldflags (e.g. `make build`, `go install`), the binary SHALL print `dev (commit unknown, built unknown)` rather than failing — version metadata is informational, not a guard.
- Add Makefile targets:
  - `make release-snapshot` — build the cross-compile matrix locally into `dist/`, no upload, no tagging. For verifying the release pipeline before tagging.
  - `make checksums` — regenerate `checksums.txt` over `dist/`.
- Document both install paths in `README.md` — the bare-binary `curl + chmod` one-liner first (the simpler flow for users who just want `./explorer ./`), then the archive `curl + tar/unzip` flow for users who want `LICENSE` and `README.md` locally — and link to the latest GitHub Release.
- Correct a pre-existing documentation inaccuracy that the smoke-test gate exposed: `CLAUDE.md` and the canonical `directory-browser` spec describe the empty-`dist` static-handler response as a "501-style fallback", but `internal/server/static.go` actually returns HTTP 404 (`text/plain`) via `http.ServeFileFS` when `index.html` is missing. Fix the CLAUDE.md sentence and the affected scenario in the canonical spec so the smoke-test gate's prose lines up with reality.
- Out of scope (explicitly): Homebrew tap, Scoop bucket, Linux package repos (apt/rpm/AUR), code signing / notarisation for macOS, Windows Authenticode signing, container image publishing to a registry. The existing `make docker` target stays as-is and is not part of this change.

## Capabilities

### New Capabilities

- `release-distribution`: defines the prebuilt-binary distribution contract for **both** tagged releases and pull-request test builds — the OS/arch matrix that MUST be produced for every tagged release and every PR, the two asset shapes (archive bundle + bare binary) and their shared naming convention, checksum file format covering both shapes (releases only — PR builds skip checksums), the `--version` flag on the produced binary, the version scheme per trigger (the pushed tag for releases, `v0.0.0-<short-sha>` for PRs), and the conditions under which a release is allowed to publish (tag must match `v*.*.*`, embedded SPA must be present, the smoke-tested binary must respond to `--version` and serve the SPA, and every archive must structurally match the expected three-entry layout). PR builds upload the same matrix as workflow artifacts under `permissions: contents: read`; no GitHub Release is created.

### Modified Capabilities

- `directory-browser`: the "CLI invocation and flags" requirement currently lists `--port` and `--host` as the only flags; this change adds `--version` (and its `-v` alias) as a flag that prints the embedded version line to stdout and exits zero, taking precedence over the directory positional argument. The playground banner and existing flag behaviour are unchanged. Additionally, the "Embedded SPA assets ship in the published module" requirement contains one scenario whose **AND** clause inaccurately describes the empty-embed fallback as `501-style`; this change rewrites that clause to assert the actual HTTP 404 / `text/plain` response, with no behaviour change.

## Impact

- **New CI workflow** (`.github/workflows/release.yml`): triggered by tag push. Steps: check out, set up Node + Go, build SPA once, run cross-compile matrix, package archives, generate checksums, create GitHub Release, attach assets. Uses standard actions only (`actions/checkout`, `actions/setup-node`, `actions/setup-go`, `softprops/action-gh-release` or the `gh` CLI). No third-party releaser tool (e.g. GoReleaser) is added — keeping the toolchain stdlib-Go + npm matches the existing project convention.
- **New PR build workflow** (`.github/workflows/pr-build.yml`): triggered by `pull_request`. Builds the same matrix and shapes as `release.yml`, runs the same smoke + structural checks, uploads results as workflow artifacts (no Release, no `contents: write`). Declares `permissions: contents: read` and a `concurrency:` block keyed by PR number with `cancel-in-progress: true` so force-pushes cancel in-flight runs. Two workflow files (rather than one with conditional jobs) so the write-permissioned release path stays minimally scoped.
- **`Makefile`**: gains `release-snapshot` and `checksums` targets. The existing `build`, `web`, `test`, `docker`, `clean` targets are not changed; `clean` SHALL also remove `dist/`.
- **`cmd/explorer/main.go`**: gains a `--version`/`-v` flag and three `var` declarations (`version`, `commit`, `buildDate`) that ldflags overrides at release-build time. When the flag is passed, the binary prints the version line and exits before attempting to validate the directory argument, so `explorer --version` works without any positional.
- **`internal/server`**: unchanged. No new endpoints, no resolver / mime / api changes. The version string is CLI-only and is not exposed over HTTP in this change.
- **Embedded SPA artefact** (`internal/server/ui/dist/`): unchanged in shape. The release pipeline relies on the same `make web` step plus the existing `//go:embed all:dist`, so a release tag MUST be pushed from a commit that already contains an up-to-date `internal/server/ui/dist/` (the existing `make web-commit` rule already enforces this for normal development; the release workflow additionally rebuilds the SPA in CI as a belt-and-braces step).
- **`README.md`**: new "Install" section above the existing "Build from source" instructions, with the download-and-run flow for unix and windows, plus the checksum verification command.
- **`CLAUDE.md`** and **`openspec/specs/directory-browser/spec.md`**: one-line correction in each so the empty-embed fallback is described as the actual HTTP 404 / `text/plain` response from `http.ServeFileFS`, not a fictional 501. Pure documentation fix; no code change implied.
- **`.gitignore`**: append a `dist/` entry under a new comment group; `.gitignore` already exists with structured comment groups, so the task is an append, not a create.
- **No new Go dependencies, no new npm dependencies.** Build matrix runs on `ubuntu-latest` only (Go cross-compiles; no native cgo).
