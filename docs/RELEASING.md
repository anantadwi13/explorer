# Releasing explorer

Maintainer-facing notes for the prebuilt-binary release pipeline. Users do
not need to read this; see the README's "Install" section instead.

## Triggering a release

Push a tag that matches `v*.*.*`:

```bash
git tag -a v0.2.0 -m "Initial prebuilt binary release"
git push origin v0.2.0
```

This fires `.github/workflows/release.yml`, which builds the SPA once,
cross-compiles the Go binary for the six-target matrix
(linux/{amd64,arm64}, darwin/{amd64,arm64}, windows/{amd64,arm64}),
runs a smoke test on the linux binaries (amd64 native + arm64 via QEMU),
asserts every archive's structural layout, and creates a GitHub Release
with twelve binary assets (six archives + six bare binaries) plus
`checksums.txt`.

If anything is wrong, **bump to a new patch tag** (`v0.2.1`, `v0.2.2`, …)
rather than deleting and re-tagging the same name:

```bash
# fix the bug, commit, then:
git tag -a v0.2.1 -m "..."
git push origin v0.2.1
```

Pushed tags are public — anyone who already pulled the broken release
would see silent content swap if you re-used the tag name. To hide the
broken release without losing the tag, mark it as a pre-release or draft
in the GitHub UI.

## Verifying a release locally before tagging

```bash
make release-snapshot   # cross-compiles all six targets into dist/
make checksums          # generates dist/checksums.txt
```

This runs the same `go build` matrix the release workflow uses and
produces twelve assets in `dist/` named `explorer_snapshot_<os>_<arch>[.ext]`.
Spot-check by extracting one archive and running `./explorer --version`;
the output should be `snapshot (commit <short-sha>, built <yyyy-mm-dd>)`.
The `dist/` directory is gitignored.

## Pre-merge testing via PR builds

`.github/workflows/pr-build.yml` runs on every `pull_request` event and
produces the same matrix as the release pipeline, but uploads results
as **GitHub Actions workflow artifacts** (no GitHub Release is created).
Each binary embeds `v0.0.0-<short-sha>` as the version.

To download a per-target test binary from a PR:

> On the PR page, click **Checks** → **pr-build** → scroll to the
> **Artifacts** section at the bottom → download
> `assets-<os>-<arch>.zip` for the target you want to test.

Each artifact contains both shapes for that target — the archive
(`.tar.gz` / `.zip`) and the bare binary. Artifacts are kept for the
repo/org default retention window (typically ~90 days).

**Fork PRs from first-time contributors require maintainer approval
before the workflow runs at all.** This is the GitHub default
(*Settings → Actions → "Require approval for first-time contributors"*)
and we leave it on. Click **Approve and run** on the PR's Checks tab to
unblock.

## Branch protection (one-time repo setup)

Branch protection on `main` SHOULD require the `pr-build / smoke-test`
check to pass before merge. This is a GitHub repository setting
(*Settings → Branches → main → Require status checks to pass*) and is
not encoded in any workflow file in this repo — set it once when the
release pipeline lands so a regression in the smoke gate cannot be
merged silently.
