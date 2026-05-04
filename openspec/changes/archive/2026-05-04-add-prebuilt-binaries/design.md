## Context

`explorer` is a single-binary tool, but today there is no published binary. The two existing install paths (`make build`, `go install ...`) both require a Go toolchain on the user's machine, and `make build` additionally requires Node. The committed `internal/server/ui/dist/` removes the Node dependency for `go install`, but does nothing for the much larger group of users who do not have Go installed at all.

The repo currently has **no** GitHub Actions workflows, no `.goreleaser.yaml`, no `dist/` directory, and `cmd/explorer/main.go` has no version variables. Versioning is implicit (`go install ...@latest` resolves to whatever git tag is newest, and there is no published tag yet — `git tag --list` is empty as of this proposal).

Constraints inherited from the project:

- **Stdlib-only Go**: no third-party Go libraries are used in production code; the same minimalism applies to the build infrastructure where feasible.
- **The SPA must be embedded**: a release binary whose `internal/server/ui/dist/` is empty serves a stock `http.ServeFileFS` 404 response (`text/plain` body, "404 page not found") instead of the SPA shell — the binary "works" but is useless. The release pipeline MUST guarantee the embed is populated. (Note: project-wide documentation including `CLAUDE.md` and the canonical `directory-browser` spec previously described this fallback as "501-style"; that is incorrect — see the proposal's "What Changes" item that fixes those docs.)
- **The playground banner contract**: the existing `directory-browser` spec is very strict about stdout ordering and the `--help` footer text. A new `--version` flag MUST NOT perturb either.

## Goals / Non-Goals

**Goals:**

- A user on linux, macOS, or windows (amd64 or arm64) can download a single asset from the GitHub Releases page — either the archive (extract, then run) or the bare binary (`chmod +x` then run on unix; just run on windows) — and execute `explorer ./some/dir` without installing Go, Node, or anything else.
- Every published release is reproducible from a tagged commit by the project maintainer with one command (`git tag vX.Y.Z && git push --tags`).
- Users can verify what they downloaded: a single `checksums.txt` per release plus a `--version` flag on the binary that prints the embedded git tag and short SHA.
- The release pipeline fails closed: if the SPA fails to embed, if the smoke-tested linux binaries (`amd64` natively + `arm64` via QEMU) fail to start and respond to `--version` + `GET /`, or if any archive in the matrix fails the structural three-entry assertion, the release is not published.

**Non-Goals:**

- **No package-manager publishing**: Homebrew, Scoop, AUR, apt, dnf, snap, flatpak, winget — all out. Each adds its own publishing infra and review surface; they can be layered on once the raw release flow is stable.
- **No code signing / notarisation**: macOS Gatekeeper will quarantine these binaries (users will need `xattr -d com.apple.quarantine`), and Windows SmartScreen will warn. We document this rather than fix it; signing requires paid certificates and out-of-band key custody that this project doesn't have set up.
- **No container registry publishing**: `make docker` stays as-is and is not promoted to a published image in this change.
- **No nightly / unstable channel**: only tagged releases produce binaries.
- **Version metadata is not exposed over HTTP**: no `/api/version`, no banner change. The `--version` flag is the only consumer.
- **No GoReleaser or similar tools**: keeps the build infra readable in one workflow file and avoids a new YAML dialect to maintain. We accept the small amount of extra shell scripting this implies.

## Decisions

### Decision 1: GitHub Actions + a single matrix job, not GoReleaser

**Choice**: Hand-rolled `.github/workflows/release.yml` with a `strategy.matrix` over six `(goos, goarch)` pairs.

**Why**: The Go side of the build is one `go build` invocation per target — `GOOS=... GOARCH=... go build -trimpath -ldflags "..." -o dist/...`. GoReleaser would handle archiving, checksumming, and release creation for us, but it pulls in a substantial config surface (`.goreleaser.yaml`) and a tool dependency we'd otherwise not need. For six targets with one binary each, the equivalent shell + `softprops/action-gh-release` config fits in ~100 lines and stays in the project's "stdlib-first" spirit. If we ever add archived sidecar files, signing, or homebrew tap publishing, the trade-off flips and switching to GoReleaser becomes worthwhile — but that is a future change.

**Alternatives considered**:

- **GoReleaser**: rejected for the reasons above. Reconsider when we add a second packaging concern.
- **Per-OS runners** (`macos-latest`, `windows-latest`, `ubuntu-latest`): unnecessary because Go cross-compiles cleanly without cgo, and the SPA build is platform-independent. One `ubuntu-latest` runner producing all six binaries is simpler and faster than three runners.

### Decision 2: Build the SPA once, then fan out

**Choice**: The workflow has two phases — a `build-web` job that runs `npm ci && npm run build` and uploads `internal/server/ui/dist/` as an artifact, and a `build-binaries` job (matrixed) that downloads that artifact and runs `go build` per target. Both jobs are within a single workflow run.

**Why**: The SPA bundle is identical for every OS/arch (it's pure JS/HTML/CSS shipped to the browser). Building it six times wastes ~2 minutes per release and risks producing six bundles with non-deterministic differences (Vite hashing, dependency ordering). Producing it once and embedding the same bytes everywhere keeps the binaries truly equivalent except for the Go cross-compile target.

**Alternative considered**: Have each matrix job rebuild the SPA. Rejected for the wasted time and the determinism risk.

### Decision 3: Version metadata via `-ldflags -X`, with safe defaults in source

**Choice**: `cmd/explorer/main.go` declares:

```go
var (
    version   = "dev"
    commit    = "unknown"
    buildDate = "unknown"
)
```

The release workflow injects them via:

```
-ldflags "-s -w -X main.version=${TAG} -X main.commit=${SHORT_SHA} -X main.buildDate=${DATE_UTC}"
```

`--version` (and `-v`) prints `<version> (commit <commit>, built <buildDate>)` to stdout and exits 0 before any directory-arg validation. Locally-built binaries (e.g. `make build`) print `dev (commit unknown, built unknown)` without ldflags overrides.

**Why**: This is the canonical Go pattern. It costs zero runtime overhead, requires no embed, and degrades gracefully when the binary is built outside the release pipeline. The SOURCE_DATE_EPOCH-derived `buildDate` is human-readable (`yyyy-mm-dd`) rather than full RFC3339 because the date alone is what matters for "is this binary recent?" — and a fully reproducible build needs SOURCE_DATE_EPOCH in CI which we set explicitly to the tagged commit's commit timestamp.

**Alternatives considered**:

- **`runtime/debug.ReadBuildInfo()`**: works for the commit/date, but cannot retrieve the human-readable git tag and prints `(devel)` for the version on `go build`. Loses the "this is v1.2.0" affordance entirely. Rejected.
- **Embed a `VERSION` file via `//go:embed`**: would need to be regenerated and committed before tagging. The ldflags approach has no such "remember to update this file" footgun.

### Decision 4: `--version` short-circuits before directory validation

**Choice**: Parse flags first; if `--version` (or `-v`) is set, print and exit 0, regardless of whether a directory positional was supplied. The existing "missing directory argument → exit non-zero" rule applies only when `--version` is absent.

**Why**: A user evaluating "did the binary I just downloaded actually work?" will run `./explorer --version` with no other args. Forcing them to supply a real directory just to see the version would be hostile. This is what every comparable CLI (`gh`, `rg`, `git`) does.

### Decision 5: Publish both shapes — archive bundle and bare binary

**Choice**: Every (os, arch) target produces two release assets:

1. **Archive** — `tar.gz` (linux/darwin) or `zip` (windows) containing exactly three top-level entries: the binary (`explorer` or `explorer.exe`), `LICENSE`, and `README.md`. No nested directory; `tar -xzf` / `Expand-Archive` places all three in the current working directory. The executable bit on the unix binary entry is preserved (`0755`).
2. **Bare binary** — the same compiled binary, uploaded directly: `explorer_<version>_<os>_<arch>` on unix (no extension) and `explorer_<version>_windows_<arch>.exe` on windows. The bare binary is byte-identical to the archive's binary entry — both come from the same `go build` invocation in the workflow.

Both shapes share the same `explorer_<version>_<os>_<arch>` filename prefix, distinguished by extension. Twelve binary release assets per tag (six archives + six bare binaries) plus `checksums.txt`.

**Why**: Two ergonomics with very low cost. Power users who already know what they want curl the bare binary in one step (`curl -L -o explorer https://.../explorer_v0.2.0_linux_amd64 && chmod +x explorer && ./explorer ./`). Users who prefer to keep the `LICENSE` and `README.md` locally — the playground warning lives in the README, which matters for a tool like this — extract the archive (executable bit already set, no `chmod`). The asset count grows from 7 to 13, upload time is unchanged in practice (parallel uploads), and `checksums.txt` covers both shapes (twelve lines).

The shared `<name>_<version>_<os>_<arch>[.ext]` naming follows the GoReleaser / HashiCorp convention used by `gh`, `terraform`, `vault`, `consul`, `cosign` — overwhelmingly the dominant pattern in the Go ecosystem, so it matches user muscle memory. Using extension as the only differentiator between shapes (and including the version on both) means a user with multiple downloads in `~/Downloads` can tell archives, bare binaries, and versions apart at a glance; they can always `mv explorer_v0.2.0_linux_amd64 explorer` if they want the short name.

**Alternatives considered**:

- **Archive only** (the original Decision 5 from the first draft): rejected on revision — users grabbing a single-file tool should not have to learn `tar -xzf` for a one-binary download. The Kubernetes ecosystem (`kubectl`, `kind`, `minikube`) ships bare binaries precisely for this reason.
- **Bare binary only**: rejected because dropping `LICENSE` from the redistributed-binary path is uncomfortable for MIT-obligation hygiene (the license text should travel with redistributions), and the `chmod +x` step is friction the archive flow avoids by preserving the executable bit. Users who care about either of these prefer the archive.
- **Kubectl-style unversioned bare names** (`explorer_linux_amd64` without `<version>`): rejected because the version disambiguates files on disk after download. The kubectl convention only works when the URL itself carries the version (`dl.k8s.io/release/v1.28.0/bin/...`) — GitHub Releases puts the tag in the URL but most users save assets by filename and lose that context.
- **Single combined archive containing both shapes**: nonsensical — the bare binary IS the archive's primary content.

### Decision 6: SHA-256 in `sha256sum`-compatible format

**Choice**: A single `checksums.txt` per release with one line per archive in the exact format produced by `sha256sum *.tar.gz *.zip`:

```
<64-hex-char-hash>  <filename>
```

(Two spaces between hash and filename — the GNU sha256sum default.)

**Why**: Users can verify with `sha256sum -c checksums.txt` (linux), `shasum -a 256 -c checksums.txt` (macOS — also accepts this format), or `Get-FileHash` plus a manual compare on windows. Anything more elaborate (PGP signatures, sigstore, in-toto) is great but is a separate change with its own threat-model discussion.

### Decision 7: Smoke test gates the release

**Choice**: After the matrix builds, a final job runs two checks:

1. **Execution smoke test (linux only).** Runs the `linux/amd64` and `linux/arm64` (via QEMU) **bare binaries** with `--version` (assert output matches the tag) and `GET /` against `./testdata` (assert HTTP 200 + `Content-Type: text/html`), then SIGINT (assert exit 0). The bare-binary shape is used so the smoke test does not depend on tar/zip plumbing — it directly exercises the same bytes that would ship as the archive entry.
2. **Structural archive assertion (all six targets).** Lists each archive's contents (`tar -tzf` or `unzip -l`) and asserts exactly three top-level entries — `explorer[.exe]`, `LICENSE`, `README.md` — with no nested directory and no other files.

If any check fails, the release is not created. Darwin and windows bare binaries are not executed in CI — Apple has no free macOS arm64 runner that doesn't burn the budget, and qemu-windows on linux is slow and brittle. Their archives are still structurally checked.

**Why**: Step 1 catches the common "release is broken" cases (SPA didn't embed, ldflags weren't injected, version variable was renamed). Step 2 catches the bundling-shape regressions specific to the dual-publish design (archive accidentally contains a nested directory, missing `LICENSE`, etc.). Splitting them keeps step 1 fast and lets step 2 cover all six targets without paying for runners we don't need.

Cross-OS ABI breakage is vanishingly rare in pure-Go static binaries; the embed-failure case is what we actually need to guard against, and that fails identically on linux as it would on macOS/windows.

**Alternative considered**: Skip the smoke test entirely (trust the build). Rejected — `go build` succeeding does not prove the SPA was embedded; that requires actually running the binary against `/` which the smoke test does as a follow-up curl. (See tasks.md for the curl step.)

**Implementation note on the failure mode**: an empty embed produces an HTTP 404 from `http.ServeFileFS(w, r, dist, "index.html")` (verified in `internal/server/static.go:28`), with `Content-Type: text/plain; charset=utf-8` and the body `404 page not found`. The smoke test gates on "200 + `Content-Type: text/html`", so any non-200 or non-`text/html` response — including this 404 — fails the gate. The CLI tests in `cmd/explorer/cli_test.go` already use the `runOnce` / `runServerUntilURL` subprocess pattern; the smoke-test job in `release.yml` mirrors that approach with a real HTTP fetch on top.

### Decision 8: PR builds in a separate workflow with read-only permissions

**Choice**: A second workflow file, `.github/workflows/pr-build.yml`, fires on `pull_request` events (default activity types: `opened`, `synchronize`, `reopened`). It builds the same six-target matrix in both shapes (archive + bare binary) as the release pipeline, runs the same execution smoke test (`linux/amd64` + `linux/arm64` via QEMU) and structural archive assertion (all six targets), and uploads each per-target artifact via `actions/upload-artifact@v4` instead of attaching to a GitHub Release. The workflow declares `permissions: contents: read` (and nothing else); no `GITHUB_TOKEN` write scope is granted. A `concurrency: { group: pr-build-${{ github.event.pull_request.number }}, cancel-in-progress: true }` block ensures force-pushes cancel the previous run.

PR builds embed `v0.0.0-${SHORT_SHA}` as the version (e.g. `v0.0.0-abc1234`, where `${SHORT_SHA}` is the first 7 characters of the head commit SHA). Asset names follow the same convention as releases: `explorer_v0.0.0-abc1234_<os>_<arch>[.tar.gz|.zip|.exe|<no-ext>]`. The `--version` line is therefore `v0.0.0-abc1234 (commit abc1234, built <yyyy-mm-dd>)` — the SHA appears twice because `commit` is also injected via ldflags, mirroring the release line shape; the consistency is more useful than the redundancy is annoying. No `checksums.txt` is generated for PR builds (no public consumers; workflow-artifact integrity is already guaranteed by GitHub).

**Why two separate workflow files**:

- The release workflow needs `permissions: contents: write` to create the GitHub Release; the PR workflow doesn't. Splitting keeps the write-scoped job inside the workflow that actually needs it (smaller blast radius — a compromised PR workflow cannot push tags or modify repo content).
- Reading "what runs when?" is a single-glance answer: tag push → `release.yml`; PR event → `pr-build.yml`. No conditional `if:` ladders to parse.
- The diff between the two workflows is small (asset destination, version derivation, presence/absence of the `release` job). We accept ~50 lines of duplication for the clarity and permission split. If the duplication grows, factoring the matrix into a reusable workflow (`workflow_call`) is the migration path.

**Why workflow artifacts (not draft releases)**: GitHub Actions artifacts are downloadable from the PR's Checks tab for the default ~90-day retention. The alternative (a draft "nightly" GitHub Release per PR) would pollute the Releases page with one entry per PR, requires `contents: write`, and offers no real upside for "internal pre-merge testing."

**Why the `v0.0.0-<sha>` version scheme**: Loosely follows Go's pseudo-version convention (`v0.0.0-yyyymmddhhmmss-abcdef012345`) but trimmed to just the SHA — sufficient for "is this the binary from commit X?" without timestamp noise. The `0.0.0` makes any accidental promotion of a PR binary obviously not-a-release; a user running `--version` and seeing `v0.0.0-…` knows immediately this is a pre-merge test build, not a tagged release.

**Alternatives considered**:

- **Single workflow with `if:` conditionals on each job**: rejected for the permission-scope and readability reasons above.
- **Run only `linux/amd64` on PR, full matrix on tag**: saves ~1 minute per PR but blocks pre-merge testing of darwin/windows. Rejected because the project explicitly wants to verify all targets before merge — the cost is small and Go cross-compile is fast.
- **Draft GitHub Release per PR**: rejected — pollutes the Releases page, requires `contents: write`, and the artifact UX is no better than `actions/download-artifact`.
- **Comment a download link on the PR**: a future enhancement (the artifact URL is buried in the Checks tab UI today). Out of scope here; would need `pull-requests: write` permission and a small Action to do the commenting.
- **Skip the smoke test on PR**: rejected — without it, "go build succeeded" doesn't prove the SPA was embedded. The whole point of pre-merge testing is to catch the same regressions the release smoke test catches.

**Constraints outside the spec**:

- **Branch protection**: enforcing "binary tested before merge" requires a repository-level branch-protection rule on `main` requiring the `pr-build` checks to pass. That is a GitHub Settings change, not encoded in any workflow file. Documented in the project release runbook; out of scope to encode in spec.
- **Fork PRs and first-time contributors**: GitHub's default policy gives `pull_request` events from forks a read-only `GITHUB_TOKEN` and skips workflows that need secrets. `actions/upload-artifact` works without secrets and from a read-only token, so artifact upload itself is fine. However, GitHub also requires maintainer approval before any first-time contributor's workflow runs at all (Settings → Actions → "Require approval for first-time contributors"). External-contributor PRs therefore won't produce downloadable binaries until a maintainer hits "Approve and run." That is GitHub's safety default; we accept it rather than weaken it.

## Risks / Trade-offs

- **Tag pushed without `internal/server/ui/dist/` updated** → released binaries serve the empty-embed fallback. **Mitigation**: the workflow rebuilds the SPA fresh in CI (Decision 2), so the embedded bytes always match the source under `web/src/` at the tagged commit, even if the committed `internal/server/ui/dist/` is stale. The committed dist is only what `go install` users get; tagged releases are always rebuilt from source.
- **macOS Gatekeeper quarantine on `darwin/*` binaries** → users see "cannot be opened because the developer cannot be verified". **Mitigation**: README documents the `xattr -d com.apple.quarantine ./explorer` workaround. Signing/notarisation is a future change requiring an Apple Developer account.
- **Windows SmartScreen warning on `windows/*` binaries** → users see "Windows protected your PC". **Mitigation**: README documents the "More info → Run anyway" path. Authenticode signing is a future change.
- **Tag pushed accidentally / tag pointing at a broken commit** → a broken release is published before anyone notices. **Mitigation**: `make release-snapshot` runs the full matrix locally so maintainers verify before tagging. The smoke-test gate (Decision 7) catches the majority of programmatic regressions but cannot catch logic bugs.
- **Binary size growth surprises users** → embedding the SPA already produces a ~10–15 MB binary. With `-s -w` and `-trimpath` the windows/arm64 archive is the largest at roughly 5 MB compressed. Documented in the README so a user grepping "why is it 5 MB" finds the answer.
- **Two spaces in `checksums.txt` is a footgun on macOS** → some `shasum` versions are picky about spacing. **Mitigation**: we generate the file with `sha256sum` (GNU coreutils available on the runner) which produces the canonical format; we don't hand-edit.
- **`internal/server/ui/dist/` in CI vs committed dist** → could in principle diverge if `package-lock.json` changes between tagging and the CI run produces a different bundle. **Mitigation**: `npm ci` (not `npm install`) pins to the lockfile; `package-lock.json` is committed. The committed `dist/` is what `go install` users receive and SHOULD be regenerated alongside any web change (existing `make web-commit` rule), but the tagged release does not depend on it.

## Migration Plan

There is no migration in the user-facing sense — this change adds a distribution channel rather than changing an existing one. Rollout steps:

1. Land all source changes (workflow, Makefile, `--version` flag, README) under one PR. No release is produced by merging.
2. After merge, push `v0.2.0` (the first published tag with prebuilt binaries) to trigger the workflow. (The `v0.1.0` tag already exists at commit `2208398` from before this branch and was never associated with a published Release, so the first prebuilt release bumps minor.)
3. Verify the GitHub Release page shows twelve binary assets (six archives + six bare binaries) plus `checksums.txt`.
4. Manually download and execute the `darwin/arm64` and `windows/amd64` binaries (the two execution targets CI does not cover — their archives are still structurally checked, but only linux is run end-to-end) and confirm `--version` and `./explorer ./somedir` both work.
5. If anything is wrong, **bump to a new patch tag** (e.g. `v0.2.1`) rather than deleting and re-tagging `v0.2.0`. Pushed tags are public; re-using a tag name silently swaps content for anyone who already pulled it. To hide a broken release without losing the tag, mark it as a pre-release / draft in the GitHub UI.

Rollback: a broken release stays in the history but is marked pre-release/draft to hide it from the "latest" badge; the next patch tag becomes the corrected release.

## Open Questions

- ~~**Initial version number**: `v0.1.0` (treating prior un-tagged history as pre-release) or `v1.0.0` (declaring the existing CLI surface stable)?~~ **Resolved (2026-05-03):** stay on `v0.x.x` for now — first tag is `v0.1.0`. The playground banner already disclaims production-readiness, so locking in `v1.x` semver promises is heavier than this project wants today. Re-evaluate when the surface stabilises. **Updated (2026-05-04):** during implementation we discovered `v0.1.0` had already been tagged at commit `2208398` (pre-prebuilt-binaries) without an associated Release. The first prebuilt-binary release is therefore **`v0.2.0`** — minor bump because this change adds a new CLI flag (`--version`/`-v`) plus a new distribution channel, both of which are honestly more "feature" than "fix." The `v0.x.x` ceiling stays.
- ~~**Should `make release-snapshot` set `version=snapshot-<short-sha>`?**~~ **Resolved (2026-05-04):** `make release-snapshot` injects `-X main.version=snapshot -X main.commit=$(git rev-parse --short HEAD) -X main.buildDate=$(date -u +%Y-%m-%d)` (literal `snapshot` in the version field; the short SHA goes in the `commit` field — see `tasks.md` 3.1(c)). The `--version` line is therefore `snapshot (commit <short-sha>, built <yyyy-mm-dd>)`, which is unambiguously distinct from the four other version-line shapes the project produces: `dev (commit unknown, built unknown)` (no-ldflags local build), `v0.0.0-<short-sha>` (PR build), and `v*.*.*` (release tag). Four trigger-distinguishable states. If a future need arises to round-trip a snapshot SHA through the version field itself, switch to `snapshot-<sha>` then.
