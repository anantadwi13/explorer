## 1. Startup banner and `--help` footer

- [ ] 1.1 In `cmd/explorer/main.go`, add a `const playgroundBanner = "explorer (playground build — no auth, no audit; do not expose publicly)"` at package scope so the banner string has a single source of truth.
- [ ] 1.2 In `cmd/explorer/main.go` `main()`, print `playgroundBanner` to stdout as the first line of successful startup, before the existing `explorer serving …` line. Print regardless of whether `--host` is loopback.
- [ ] 1.3 In `cmd/explorer/main.go` `fs.Usage`, insert two lines between the existing `Usage:` line and `fs.PrintDefaults()`:
  ```
  Playground tool — no auth, no security audit. Bind to loopback
  unless you trust your network.
  ```
  (Indent with two spaces to align with the `Usage:` continuation convention.)
- [ ] 1.4 Verify the existing non-loopback warning (`⚠ host is not loopback — anyone on this network can read these files.`) still prints unchanged when `--host` is non-loopback, strictly after the playground banner.

## 2. Tests

- [ ] 2.1 Add a `cmd/explorer/main_test.go` (or extend existing test file if present) that builds the binary and runs it against a temp directory with `--host 127.0.0.1 --port 0` (or equivalent), captures stdout, and asserts the first line is exactly the playground banner string.
- [ ] 2.2 Add a test case asserting that with `--host 0.0.0.0` the playground banner is the first line and the non-loopback warning still appears below it (substring match on `host is not loopback`).
- [ ] 2.3 Add a test case asserting that `explorer --help` (or invocation with no args) prints stderr containing the playground footer string `Playground tool — no auth, no security audit. Bind to loopback unless you trust your network.` exactly once.
- [ ] 2.4 Run `make test` and confirm all tests pass.

## 3. README

- [ ] 3.1 In `README.md`, insert a blockquote callout immediately after the `# explorer` H1 and before the `A lightweight, single-binary local directory browser…` tagline:
  ```
  > ⚠ **Playground / personal use only.** This is a hobby project, not a
  > hardened service. There is no authentication, no rate limiting, and no
  > security audit. Anyone who can reach the port can read every file
  > under the served directory. Run it on your own machine bound to
  > loopback (the default), or on a trusted LAN — never expose it to the
  > public internet, behind a tunnel, or on a shared host.
  ```
- [ ] 3.2 Render the README locally (or push a draft branch and check the GitHub preview) to verify the blockquote renders distinctively above the fold and the `⚠` glyph displays correctly.

## 4. Verification

- [ ] 4.1 Run `make build` and verify the binary still builds and embeds the SPA without errors.
- [ ] 4.2 Run `./explorer ./testdata` manually and visually confirm the playground banner is the first stdout line, followed by the existing `serving …` and URL lines, with no non-loopback warning.
- [ ] 4.3 Run `./explorer ./testdata --host 0.0.0.0 --port 0` manually and confirm the playground banner appears first, then `serving …`, then the URL, then the non-loopback warning — in that order.
- [ ] 4.4 Run `./explorer --help` manually and confirm the playground footer appears between the `Usage:` line and the flag defaults.
- [ ] 4.5 Run `openspec verify --change add-playground-warning` (or the equivalent `opsx:verify`) before archiving.
