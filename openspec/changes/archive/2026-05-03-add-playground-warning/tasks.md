## 1. Startup banner and `--help` footer

- [x] 1.1 In `cmd/explorer/main.go`, add a package-scope constant `const playgroundBanner = "explorer (playground build — no auth, no audit; do not expose publicly)"` so the banner string has a single source of truth shared with tests.
- [x] 1.2 In `cmd/explorer/main.go` `main()`, print `playgroundBanner` to stdout as the first line of successful startup, before the existing `explorer serving …` line. Print regardless of whether `--host` is loopback. Place the print after argument validation (i.e., do not print on usage failure) but before `server.New(absRoot)` is constructed.
- [x] 1.3 In `cmd/explorer/main.go` `fs.Usage`, insert two lines between the existing `Usage:` line and the `fs.PrintDefaults()` call:
  ```
    Playground tool — no auth, no security audit. Bind to loopback
    unless you trust your network.
  ```
  Each line is indented with two leading spaces to align with the `Usage:` continuation convention.
- [x] 1.4 Verify by reading the diff that the existing non-loopback warning (`⚠ host is not loopback — anyone on this network can read these files.`) and the existing `explorer serving …` and `  → <url>` lines are unchanged in text and still emitted in the same order, strictly after the playground banner.

## 2. Tests

- [x] 2.1 Add (or extend) `cmd/explorer/main_test.go` with a black-box test that builds the binary via `go build -o` into a temp dir, runs it against a temp directory with `--host 127.0.0.1 --port 0` (or an alternative free-port strategy), captures stdout, and asserts the first line of stdout is exactly the `playgroundBanner` string.
- [x] 2.2 Add a test case asserting that with `--host 0.0.0.0` the playground banner is the first line of stdout and the non-loopback warning still appears below it (substring match on `host is not loopback`), and that the playground banner appears strictly before the non-loopback warning.
- [x] 2.3 Add a test case running the binary with no positional argument, asserting stderr exits non-zero and contains the playground footer string `Playground tool — no auth, no security audit. Bind to loopback unless you trust your network.` exactly once.
- [x] 2.4 Add a test case running the binary with `--help`, asserting stderr (or stdout, whichever `flag` writes to) contains `Usage: explorer <dir> [--port PORT] [--host HOST]` immediately followed by a line beginning with `  Playground tool — no auth, no security audit.`, and that the flag defaults appear after the footer.
- [x] 2.5 Run `make test` and confirm all tests (new and existing) pass.

## 3. README

- [x] 3.1 In `README.md`, insert a blockquote callout immediately after the `# explorer` H1 and before the existing tagline:
  ```
  > ⚠ **Playground / personal use only.** This is a hobby project, not a
  > hardened service. There is no authentication, no rate limiting, and no
  > security audit. Anyone who can reach the port can read every file
  > under the served directory. Run it on your own machine bound to
  > loopback (the default), or on a trusted LAN — never expose it to the
  > public internet, behind a tunnel, or on a shared host.
  ```
- [x] 3.2 Render the README locally (or push a draft branch and check the GitHub preview) to verify the blockquote renders distinctively above the fold and the `⚠` glyph displays correctly.

## 4. Verification

- [x] 4.1 Run `make build` and verify the binary still builds and embeds the SPA without errors.
- [x] 4.2 Run `./explorer ./testdata` manually and visually confirm the playground banner is the first stdout line, followed by the existing `serving …` and URL lines, with no non-loopback warning.
- [x] 4.3 Run `./explorer ./testdata --host 0.0.0.0 --port 0` manually and confirm the playground banner appears first, then `serving …`, then the URL, then the non-loopback warning — in that order.
- [x] 4.4 Run `./explorer --help` manually and confirm the playground footer appears on two lines between the `Usage:` line and the flag defaults.
- [x] 4.5 Run `openspec validate add-playground-warning --strict` (or `opsx:verify`) and confirm the change passes before archiving.
