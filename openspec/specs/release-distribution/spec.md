# Capability: Release Distribution

## Purpose

Automated build and publication of prebuilt `explorer` binaries for end users who do not have a Go toolchain. A tagged-release pipeline produces a fixed OS/arch matrix in two asset shapes (an archive bundling the binary with `LICENSE`/`README.md`, and a bare binary that runs without extraction), embeds version metadata via link-time ldflags, generates a `checksums.txt` for integrity verification, and gates publication behind execution and structural smoke tests so a broken embed or malformed archive cannot reach users. A parallel pull-request workflow exercises the same matrix and gates on every PR commit, uploading per-PR build artifacts (without creating a release) so reviewers can download and run the exact binary that would ship if the PR's changes were tagged.

## Requirements

### Requirement: Tagged release triggers prebuilt-binary build

A push of a git tag matching the pattern `v*.*.*` (e.g. `v0.1.0`, `v1.4.2`, `v2.0.0-rc1`) to the project's primary remote SHALL trigger an automated release pipeline that produces prebuilt binaries for the supported OS/arch matrix and publishes them to a GitHub Release whose tag matches the pushed tag exactly.

The pipeline SHALL NOT run on branch pushes, pull-request events, or tag pushes that do not match the `v*.*.*` pattern. The pipeline SHALL fail (and SHALL NOT publish a release) if any matrix build fails, if the embedded SPA assets are not present in the produced binaries, or if the smoke test gate (see "Release smoke test gates publication" requirement) fails.

#### Scenario: Push a release tag

- **WHEN** the maintainer runs `git tag v0.1.0 && git push origin v0.1.0`
- **THEN** the release workflow runs to completion
- **AND** a GitHub Release named `v0.1.0` is created with the twelve matrix assets (six archives + six bare binaries) and `checksums.txt` attached
- **AND** the release is marked as the latest release on the project's GitHub Releases page

#### Scenario: Push a non-release tag

- **WHEN** the maintainer pushes a tag that does not match `v*.*.*` (e.g. `nightly-2026-05-03`, `experiment`)
- **THEN** the release workflow does not run
- **AND** no GitHub Release is created

#### Scenario: Push to a branch

- **WHEN** any commit is pushed to `main` (or any branch) without a matching tag
- **THEN** the release workflow does not run

#### Scenario: Matrix build failure aborts publish

- **WHEN** any one of the matrix `go build` invocations exits non-zero
- **THEN** the workflow fails
- **AND** no GitHub Release is created
- **AND** no assets (archives or bare binaries) are uploaded as release assets

### Requirement: OS/arch matrix and release asset shapes

For every successful release, the pipeline SHALL produce exactly twelve binary release assets — two shapes (archive bundle + bare binary) per `(os, arch)` pair from the supported matrix:

- `linux/amd64`, `linux/arm64`
- `darwin/amd64`, `darwin/arm64`
- `windows/amd64`, `windows/arm64`

Both shapes SHALL share the filename prefix `explorer_<version>_<os>_<arch>`, where `<version>` is the pushed tag verbatim (including the leading `v`, e.g. `v0.1.0`). The shapes are distinguished by file extension.

**Archive shape** — bundles the binary with `LICENSE` and `README.md`:

- linux and darwin: `tar.gz`, named `explorer_<version>_<os>_<arch>.tar.gz`. The binary entry SHALL be named `explorer` and SHALL have the executable bit (`0755`) set.
- windows: `zip`, named `explorer_<version>_windows_<arch>.zip`. The binary entry SHALL be named `explorer.exe`.
- Each archive SHALL contain exactly three top-level entries:
  1. The binary (`explorer` or `explorer.exe`).
  2. `LICENSE` — copied verbatim from the repository root at the tagged commit.
  3. `README.md` — copied verbatim from the repository root at the tagged commit.
- Archives SHALL NOT contain any nested directory; extracting the archive into the current working directory SHALL place the three files there directly. Archives SHALL NOT contain any other files (no `.git`, no `web/`, no `dist/` from the build pipeline, no test data).

**Bare-binary shape** — the same compiled binary, uploaded directly:

- linux and darwin: file with no extension, named `explorer_<version>_<os>_<arch>` (e.g. `explorer_v0.1.0_linux_amd64`).
- windows: named `explorer_<version>_windows_<arch>.exe`.
- The bare binary SHALL be byte-identical to the binary entry inside the corresponding archive — both come from the same `go build` invocation. (Verifiable: SHA-256 of the bare binary equals SHA-256 of the archive entry after extraction.)
- The executable bit on the unix bare binary depends on the user's download tool (`curl -O` does not preserve permissions); the README `Install` section SHALL document `chmod +x` as part of the bare-binary install step.

#### Scenario: Linux archive layout

- **WHEN** a user downloads `explorer_v0.1.0_linux_amd64.tar.gz` from the release
- **AND** runs `tar -xzf explorer_v0.1.0_linux_amd64.tar.gz`
- **THEN** the current directory now contains `explorer`, `LICENSE`, and `README.md`
- **AND** `explorer` has executable permissions
- **AND** `./explorer --version` prints the version line and exits 0

#### Scenario: Windows archive layout

- **WHEN** a user downloads `explorer_v0.1.0_windows_amd64.zip` from the release
- **AND** extracts it
- **THEN** the extraction produces `explorer.exe`, `LICENSE`, and `README.md` (no nested folder)
- **AND** running `explorer.exe --version` from PowerShell or cmd prints the version line and exits 0

#### Scenario: Linux bare-binary layout

- **WHEN** a user downloads `explorer_v0.1.0_linux_amd64` (no extension) from the release
- **AND** runs `chmod +x explorer_v0.1.0_linux_amd64`
- **THEN** `./explorer_v0.1.0_linux_amd64 --version` prints the version line and exits 0
- **AND** no extraction step is required

#### Scenario: Windows bare-binary layout

- **WHEN** a user downloads `explorer_v0.1.0_windows_amd64.exe` from the release
- **THEN** running `explorer_v0.1.0_windows_amd64.exe --version` from PowerShell or cmd prints the version line and exits 0
- **AND** no extraction or rename step is required to invoke the binary

#### Scenario: Bare binary matches archive content

- **WHEN** the release for a given tag and target produces both `explorer_<version>_<os>_<arch>.tar.gz` (or `.zip`) and the corresponding bare binary
- **AND** the binary entry is extracted from the archive
- **THEN** the SHA-256 of the bare binary equals the SHA-256 of the extracted archive entry
- **AND** running either binary with `--version` produces identical output

#### Scenario: Matrix completeness

- **WHEN** the release workflow finishes successfully
- **THEN** the GitHub Release page lists exactly these archive assets:
  - `explorer_<version>_linux_amd64.tar.gz`
  - `explorer_<version>_linux_arm64.tar.gz`
  - `explorer_<version>_darwin_amd64.tar.gz`
  - `explorer_<version>_darwin_arm64.tar.gz`
  - `explorer_<version>_windows_amd64.zip`
  - `explorer_<version>_windows_arm64.zip`
- **AND** lists exactly these bare-binary assets:
  - `explorer_<version>_linux_amd64`
  - `explorer_<version>_linux_arm64`
  - `explorer_<version>_darwin_amd64`
  - `explorer_<version>_darwin_arm64`
  - `explorer_<version>_windows_amd64.exe`
  - `explorer_<version>_windows_arm64.exe`
- **AND** lists `checksums.txt`
- **AND** no other binary or archive assets are attached

### Requirement: Embedded version metadata in released binaries

Every binary produced by the release pipeline SHALL contain version metadata injected at link time via `go build -ldflags "-X main.version=<tag> -X main.commit=<short-sha> -X main.buildDate=<utc-yyyy-mm-dd>"`, where:

- `<tag>` is the pushed git tag verbatim (e.g. `v0.1.0`).
- `<short-sha>` is the first 7 characters of the tagged commit's SHA.
- `<utc-yyyy-mm-dd>` is the date the release was built, in UTC, in `yyyy-mm-dd` format.

When a release-built binary is invoked with `--version` (or its `-v` alias), it SHALL print exactly one line to stdout in the form:

```
<tag> (commit <short-sha>, built <utc-yyyy-mm-dd>)
```

and exit with status 0, before any directory-argument validation. (The CLI flag itself, including the precedence-over-positional behaviour, is normatively specified in the `directory-browser` capability — this requirement only constrains the values that release builds inject.)

When the binary is built locally without these ldflags (e.g. `make build`, `go install`, `go run`), it SHALL print the line:

```
dev (commit unknown, built unknown)
```

The binary SHALL NOT fail or refuse to run when version metadata is missing — version is informational, not a guard.

#### Scenario: Release binary version output

- **WHEN** a user runs `./explorer --version` against the binary extracted from `explorer_v0.1.0_linux_amd64.tar.gz` (built from commit `abcdef0123456789...` on `2026-05-15`)
- **THEN** stdout contains exactly one line: `v0.1.0 (commit abcdef0, built 2026-05-15)`
- **AND** the process exits 0

#### Scenario: Locally-built binary version output

- **WHEN** a user clones the repo and runs `make build` (which does not pass `-ldflags -X`)
- **AND** then runs `./explorer --version`
- **THEN** stdout contains exactly one line: `dev (commit unknown, built unknown)`
- **AND** the process exits 0

### Requirement: Release checksum file

Every release SHALL include a single asset named `checksums.txt` listing the SHA-256 hash of every binary release asset across both shapes (archives and bare binaries), in the canonical GNU `sha256sum` format: each line SHALL be `<64-lowercase-hex-hash>  <filename>` (two ASCII spaces between hash and filename, no leading whitespace, LF line endings).

The file SHALL contain exactly twelve lines (six archive lines + six bare-binary lines, matching the asset matrix) and SHALL NOT contain a hash entry for itself. Filenames SHALL match the asset names exactly (no path prefix).

A user SHALL be able to verify any subset of downloaded assets by placing `checksums.txt` and the asset(s) in the same directory and running `sha256sum --ignore-missing -c checksums.txt` (or, on macOS, `shasum -a 256 --ignore-missing -c checksums.txt`); a successful verification SHALL produce a line ending in `: OK` for each present asset, and verification SHALL exit 0 if every present asset matches.

#### Scenario: Verify a downloaded archive

- **WHEN** a user downloads `explorer_v0.1.0_linux_amd64.tar.gz` and `checksums.txt` from the release
- **AND** runs `sha256sum --ignore-missing -c checksums.txt`
- **THEN** the command prints `explorer_v0.1.0_linux_amd64.tar.gz: OK`
- **AND** exits 0

#### Scenario: Verify a downloaded bare binary

- **WHEN** a user downloads `explorer_v0.1.0_linux_amd64` (bare) and `checksums.txt` from the release
- **AND** runs `sha256sum --ignore-missing -c checksums.txt`
- **THEN** the command prints `explorer_v0.1.0_linux_amd64: OK`
- **AND** exits 0

#### Scenario: Tampered asset fails verification

- **WHEN** a user downloads an asset (archive or bare binary) that has been corrupted or modified (the byte content does not match the recorded hash)
- **AND** runs `sha256sum -c checksums.txt`
- **THEN** the command prints a `FAILED` line for that asset
- **AND** exits non-zero

### Requirement: Release smoke test gates publication

Before the release workflow attaches assets to the GitHub Release, it SHALL execute two checks: an execution smoke test on every binary it can natively run on the workflow runner, and a structural assertion on every archive in the matrix.

**Execution smoke test (linux only).** At minimum this covers the `linux/amd64` bare binary running directly on the `ubuntu-latest` runner, and the `linux/arm64` bare binary running under QEMU user-mode emulation on the same runner. The bare-binary shape (not the archive) is used so the smoke test does not depend on tar/zip plumbing — it directly exercises the same bytes that ship as the archive entry. For each smoke-tested binary, the workflow SHALL:

1. Invoke `<binary> --version` and assert the output line matches `<pushed-tag> (commit <short-sha>, built <utc-yyyy-mm-dd>)` exactly.
2. Start `<binary> ./testdata` (or another existing directory in the workflow checkout) bound to a free local port, wait until the server is listening, fetch `GET /` over HTTP, and assert the response is HTTP 200 with a non-empty body whose `Content-Type` starts with `text/html`. This proves the SPA was embedded — an empty-`dist` build serves a stock `http.ServeFileFS` 404 response (`Content-Type: text/plain`, body `404 page not found`), so the 200/`text/html` assertion correctly fails on a broken embed.
3. Send the server SIGINT and assert it exits 0 within the existing graceful-shutdown timeout.

**Structural archive assertion (all six targets).** For each of the six archives in the matrix (including darwin and windows, which are not executed), the workflow SHALL list the archive contents (`tar -tzf <archive>` for `.tar.gz`; `unzip -l <archive>` for `.zip`) and assert exactly three top-level entries — `explorer` (or `explorer.exe`), `LICENSE`, `README.md` — with no nested directory and no other files.

If any check fails, the workflow SHALL fail and SHALL NOT create the GitHub Release. Darwin and windows bare binaries are not required to be executed in CI; their correctness is validated manually as part of the release procedure (see project release runbook).

#### Scenario: Smoke test passes

- **WHEN** the release workflow builds the `linux/amd64` binary for tag `v0.1.0`
- **AND** runs the smoke test
- **THEN** `--version` prints the expected line
- **AND** `GET /` returns HTTP 200 with a `text/html` body
- **AND** SIGINT shuts the server down with exit 0
- **AND** the workflow proceeds to create the GitHub Release

#### Scenario: Empty embed fails the smoke test

- **WHEN** the SPA build phase silently produces an empty `internal/server/ui/dist/` (e.g. a Vite misconfiguration)
- **AND** the matrix builds the `linux/amd64` binary against that empty embed
- **AND** the smoke test fetches `GET /`
- **THEN** the response is HTTP 404 with `Content-Type: text/plain` and body `404 page not found` (the stock `http.ServeFileFS` response when `dist/index.html` is missing)
- **AND** the smoke test asserts `text/html` and 200 → fails
- **AND** no GitHub Release is created

#### Scenario: Archive with nested directory fails the structural assertion

- **WHEN** a packaging-step regression accidentally produces an archive whose top-level entry is a directory (e.g. `explorer/explorer`, `explorer/LICENSE`, `explorer/README.md`) instead of three bare entries
- **AND** the structural archive assertion lists the archive contents
- **THEN** the listing does NOT match the required three top-level entries (`explorer[.exe]`, `LICENSE`, `README.md`)
- **AND** the workflow fails
- **AND** no GitHub Release is created

### Requirement: PR test builds produce per-commit artifacts

For every `pull_request` event (default activity types: `opened`, `synchronize`, `reopened`) targeting any branch, a separate CI workflow SHALL build the same OS/arch matrix in both asset shapes (archive + bare binary) as the release pipeline, run the same execution smoke test (`linux/amd64` native + `linux/arm64` via QEMU) and structural archive assertion (all six targets), and upload the resulting twelve per-PR assets as **GitHub Actions workflow artifacts** — NOT as a GitHub Release.

The PR build workflow SHALL:

- Embed the version string `v0.0.0-<short-sha>` in every binary, where `<short-sha>` is the first 7 characters of the head commit SHA, via the same `-ldflags "-X main.version=... -X main.commit=... -X main.buildDate=..."` mechanism the release pipeline uses. The `commit` ldflags value SHALL also be `<short-sha>`; the `buildDate` SHALL be the workflow run date in UTC (`yyyy-mm-dd`).
- Name assets using the same convention as releases — bare binaries are `explorer_v0.0.0-<short-sha>_<os>_<arch>` on unix (no extension) and `explorer_v0.0.0-<short-sha>_windows_<arch>.exe` on windows; archives are `explorer_v0.0.0-<short-sha>_<os>_<arch>.tar.gz` for linux/darwin and `explorer_v0.0.0-<short-sha>_windows_<arch>.zip` for windows.
- Declare `permissions: contents: read` (no write scope on `GITHUB_TOKEN`).
- Declare `concurrency: { group: pr-build-${{ github.event.pull_request.number }}, cancel-in-progress: true }` so force-pushes cancel the in-flight run instead of stacking.
- NOT create a GitHub Release; NOT push tags; NOT modify any repository content.
- NOT generate or upload a `checksums.txt` (no public consumers; workflow-artifact integrity is already guaranteed by GitHub).

PR builds from forks are subject to GitHub's default policy that requires maintainer approval before workflows run for first-time external contributors; until approved, the workflow does not run and no artifacts are produced. This is a GitHub default, not a project-specific gate.

If any matrix build, smoke step, or structural-archive assertion fails, the workflow SHALL fail and the PR's check status SHALL be red, allowing branch-protection rules (a repository setting outside this spec) to block merge.

#### Scenario: PR build produces downloadable artifacts

- **WHEN** a contributor opens a pull request targeting `main` with head commit `abc1234567890...`
- **THEN** the PR build workflow runs to completion
- **AND** twelve assets are uploaded as workflow artifacts named `assets-<os>-<arch>` (one per matrix target, each containing the archive + bare binary for that target)
- **AND** the asset filenames embed `v0.0.0-abc1234` (the head's 7-character short SHA)
- **AND** running `./explorer_v0.0.0-abc1234_linux_amd64 --version` (after `chmod +x`) prints `v0.0.0-abc1234 (commit abc1234, built <yyyy-mm-dd>)`
- **AND** no GitHub Release is created
- **AND** the assets are downloadable from the PR's "Checks" tab for the standard workflow-artifact retention window (~90 days by default)

#### Scenario: Force-push cancels in-flight PR build

- **WHEN** a contributor pushes a new commit to a PR while the previous PR build is still running
- **THEN** the previous workflow run is cancelled (via the `concurrency.cancel-in-progress` setting)
- **AND** a new PR build starts for the new head commit
- **AND** the cancelled run does not produce artifacts

#### Scenario: PR smoke-test failure surfaces as a red check

- **WHEN** the PR build workflow's execution smoke test fails (e.g. the binary returns HTTP 404 from `GET /` because the SPA was not embedded)
- **THEN** the PR's `pr-build` check status is red
- **AND** if the repository has a branch-protection rule requiring the `pr-build` check (a repository setting outside this spec), the merge button is disabled until the failure is fixed

#### Scenario: First-time contributor PR awaits maintainer approval

- **WHEN** a first-time external contributor opens a pull request from a fork
- **THEN** the PR build workflow does NOT run automatically (per GitHub's default policy for first-time contributors)
- **AND** the PR's "Checks" tab shows a "workflow run requires approval" prompt
- **AND** a maintainer's "Approve and run" action causes the workflow to run with `permissions: contents: read` and produce the same artifacts as a normal PR build

#### Scenario: Tagged release pipeline does not run on PRs

- **WHEN** a pull request is opened, synchronized, or reopened
- **THEN** the release workflow (the `v*.*.*` tag-push workflow) does NOT run
- **AND** no GitHub Release is created
- **AND** only the PR build workflow runs

#### Scenario: PR build does not run on tag push

- **WHEN** a maintainer pushes a `v*.*.*` tag (no associated PR event)
- **THEN** the PR build workflow does NOT run
- **AND** only the release workflow runs
