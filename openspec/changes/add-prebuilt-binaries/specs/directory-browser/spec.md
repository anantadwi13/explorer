## MODIFIED Requirements

### Requirement: CLI invocation and flags

The `explorer` binary SHALL accept a single positional argument naming the directory to serve (the "served root") and SHALL accept optional flags `--port`, `--host`, and `--version` (alias `-v`). The default `--port` SHALL be `8080`. The default `--host` SHALL be `127.0.0.1`. Invocation without a directory argument or with a path that is not an existing readable directory SHALL fail with a non-zero exit code and a message on stderr, **except** when `--version` (or `-v`) is supplied — in that case the binary SHALL print the version line and exit 0 before validating the directory argument.

The same invocation contract SHALL apply when the binary is executed via the Go toolchain using the module path `github.com/anantadwi13/explorer/cmd/explorer`, including `go run github.com/anantadwi13/explorer/cmd/explorer@latest <dir> [flags...]` and the binary produced by `go install github.com/anantadwi13/explorer/cmd/explorer@latest`.

The binary SHALL print, as the first line of stdout on every successful startup (regardless of `--host` value), the exact playground banner line:

```
explorer (playground build — no auth, no audit; do not expose publicly)
```

When the existing non-loopback warning is emitted (because `--host` is not `127.0.0.1`, `::1`, or `localhost`), the playground banner SHALL appear strictly before the non-loopback warning. The non-loopback warning text and position relative to the served-root and URL lines SHALL NOT change.

The `--help` (and any usage-error) output SHALL include, immediately after the `Usage:` line and before the flag defaults, the exact two-line footer (each line indented with two leading spaces):

```
  Playground tool — no auth, no security audit. Bind to loopback
  unless you trust your network.
```

The `--version` (and `-v`) flag SHALL print exactly one line to stdout in the form `<version> (commit <commit>, built <buildDate>)` and SHALL exit with status 0. The values of `<version>`, `<commit>`, and `<buildDate>` are injected at link time by the release pipeline (see the `release-distribution` capability); locally-built binaries print the literal default `dev (commit unknown, built unknown)`. The `--version` flag SHALL NOT print the playground banner, the non-loopback warning, or any other line. When `--version` is combined with any other flag or positional argument, those other inputs SHALL be ignored and the version line SHALL be printed regardless.

#### Scenario: Invoke with directory only

- **WHEN** the user runs `explorer /some/dir` and `/some/dir` exists and is readable
- **THEN** the binary binds to `127.0.0.1:8080`
- **AND** the first line of stdout is exactly `explorer (playground build — no auth, no audit; do not expose publicly)`
- **AND** subsequent stdout contains the served root path and `http://127.0.0.1:8080`
- **AND** does not print a non-loopback warning

#### Scenario: Override port

- **WHEN** the user runs `explorer /some/dir --port 9000`
- **THEN** the binary binds to `127.0.0.1:9000`
- **AND** the first line of stdout is the playground banner
- **AND** the startup banner reflects port `9000`

#### Scenario: Override host to non-loopback

- **WHEN** the user runs `explorer /some/dir --host 0.0.0.0`
- **THEN** the binary binds to `0.0.0.0:8080`
- **AND** the first line of stdout is the playground banner
- **AND** the startup banner prints the URL `http://0.0.0.0:8080`
- **AND** the startup banner prints a warning that the host is not loopback and the served files are readable on the network
- **AND** the playground banner appears strictly before the non-loopback warning

#### Scenario: Missing directory argument

- **WHEN** the user runs `explorer` with no positional argument and no `--version` flag
- **THEN** the binary exits non-zero
- **AND** prints a usage message on stderr
- **AND** the usage message contains the playground footer text `Playground tool — no auth, no security audit. Bind to loopback unless you trust your network.`

#### Scenario: Path argument is not a directory

- **WHEN** the user runs `explorer /path/that/does/not/exist` or passes a regular file
- **THEN** the binary exits non-zero
- **AND** prints an error on stderr identifying that the path is missing or not a directory

#### Scenario: Help flag prints playground footer

- **WHEN** the user runs `explorer --help`
- **THEN** the usage output contains the `Usage: explorer <dir> [--port PORT] [--host HOST]` line
- **AND** the line immediately after begins with `  Playground tool — no auth, no security audit.`
- **AND** the flag defaults are printed below the footer
- **AND** the listed flags include `--version` (alias `-v`)

#### Scenario: Version flag with no other arguments

- **WHEN** the user runs `explorer --version`
- **THEN** stdout contains exactly one line in the form `<version> (commit <commit>, built <buildDate>)`
- **AND** stdout does NOT contain the playground banner
- **AND** the process exits 0
- **AND** no HTTP server is started

#### Scenario: Version short flag alias

- **WHEN** the user runs `explorer -v`
- **THEN** the output is identical to `explorer --version`
- **AND** the process exits 0

#### Scenario: Version flag combined with directory and other flags

- **WHEN** the user runs `explorer /some/dir --port 9000 --version`
- **THEN** stdout contains exactly the version line
- **AND** the process exits 0
- **AND** no HTTP server is started on port 9000 or any other port

#### Scenario: Version flag on a locally-built binary

- **WHEN** a binary built via `make build` or `go install github.com/anantadwi13/explorer/cmd/explorer@latest` (without release-pipeline ldflags) is invoked with `--version`
- **THEN** stdout contains exactly one line: `dev (commit unknown, built unknown)`
- **AND** the process exits 0

#### Scenario: Invoke via `go run` from the module path

- **WHEN** the user has a Go 1.24+ toolchain and runs `go run github.com/anantadwi13/explorer/cmd/explorer@latest /some/dir`
- **THEN** the Go toolchain fetches the module, compiles the binary, and executes it with `/some/dir` as the served root
- **AND** the running server behaves identically to the `./explorer /some/dir` invocation, including binding defaults, the playground banner as the first line of stdout, the startup banner, and SPA assets served at `/`

#### Scenario: Install via `go install` from the module path

- **WHEN** the user has a Go 1.24+ toolchain and runs `go install github.com/anantadwi13/explorer/cmd/explorer@latest`
- **THEN** the Go toolchain produces an `explorer` binary in `$GOBIN` (or `$GOPATH/bin`)
- **AND** running that binary against any readable directory serves the SPA and JSON API exactly as the `make build` output would, and prints the playground banner as the first line of stdout

### Requirement: Embedded SPA assets ship in the published module

The compiled Single-Page Application assets that the Go binary serves SHALL be present in the published source tree at `internal/server/ui/dist/`, so that any consumer obtaining the module via the Go module proxy (`go install`, `go run`, or `go get` followed by a local build) produces a binary whose `embed.FS` contains a fully functional SPA without requiring Node.js, npm, or a separate frontend build step on the consumer's machine.

#### Scenario: Fresh clone produces a runnable binary without npm

- **WHEN** a contributor clones the repository on a machine with only the Go toolchain installed
- **AND** runs `go build ./cmd/explorer`
- **THEN** the produced binary serves the SPA at `/` and renders folder listings, markdown previews, and image previews against any readable directory
- **AND** no `npm` or `node` invocation is required to obtain a working binary

#### Scenario: Module-proxy install produces a runnable binary

- **WHEN** a user with no clone of the repository runs `go install github.com/anantadwi13/explorer/cmd/explorer@latest`
- **THEN** the resulting binary serves a non-empty SPA shell at `/` (HTTP 200 with a non-trivial HTML body that loads the bundled JS/CSS)
- **AND** the binary does NOT serve the empty-embed fallback (an HTTP 404 with `Content-Type: text/plain` and body `404 page not found`, returned by the stock `http.ServeFileFS` handler in `internal/server/static.go` when `dist/index.html` is missing)

#### Scenario: SPA source change without dist regeneration is detectable

- **WHEN** a contributor modifies files under `web/src/` and commits without regenerating `internal/server/ui/dist/`
- **THEN** the project provides a documented mechanism (a Make target, pre-commit hook guidance, or CI check) by which the staleness of `internal/server/ui/dist/` relative to `web/src/` can be detected before merge
