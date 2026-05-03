## MODIFIED Requirements

### Requirement: CLI invocation and flags

The `explorer` binary SHALL accept a single positional argument naming the directory to serve (the "served root") and SHALL accept optional flags `--port` and `--host`. The default `--port` SHALL be `8080`. The default `--host` SHALL be `127.0.0.1`. Invocation without a directory argument or with a path that is not an existing readable directory SHALL fail with a non-zero exit code and a message on stderr.

The same invocation contract SHALL apply when the binary is executed via the Go toolchain using the module path `github.com/anantadwi13/explorer/cmd/explorer`, including `go run github.com/anantadwi13/explorer/cmd/explorer@latest <dir> [flags...]` and the binary produced by `go install github.com/anantadwi13/explorer/cmd/explorer@latest`.

#### Scenario: Invoke with directory only

- **WHEN** the user runs `explorer /some/dir` and `/some/dir` exists and is readable
- **THEN** the binary binds to `127.0.0.1:8080`
- **AND** prints a startup banner on stdout containing the served root path and `http://127.0.0.1:8080`
- **AND** does not print a non-loopback warning

#### Scenario: Override port

- **WHEN** the user runs `explorer /some/dir --port 9000`
- **THEN** the binary binds to `127.0.0.1:9000`
- **AND** the startup banner reflects port `9000`

#### Scenario: Override host to non-loopback

- **WHEN** the user runs `explorer /some/dir --host 0.0.0.0`
- **THEN** the binary binds to `0.0.0.0:8080`
- **AND** the startup banner prints the URL `http://0.0.0.0:8080`
- **AND** the startup banner prints a warning that the host is not loopback and the served files are readable on the network

#### Scenario: Missing directory argument

- **WHEN** the user runs `explorer` with no positional argument
- **THEN** the binary exits non-zero
- **AND** prints a usage message on stderr

#### Scenario: Path argument is not a directory

- **WHEN** the user runs `explorer /path/that/does/not/exist` or passes a regular file
- **THEN** the binary exits non-zero
- **AND** prints an error on stderr identifying that the path is missing or not a directory

#### Scenario: Invoke via `go run` from the module path

- **WHEN** the user has a Go 1.24+ toolchain and runs `go run github.com/anantadwi13/explorer/cmd/explorer@latest /some/dir`
- **THEN** the Go toolchain fetches the module, compiles the binary, and executes it with `/some/dir` as the served root
- **AND** the running server behaves identically to the `./explorer /some/dir` invocation, including binding defaults, startup banner, and SPA assets served at `/`

#### Scenario: Install via `go install` from the module path

- **WHEN** the user has a Go 1.24+ toolchain and runs `go install github.com/anantadwi13/explorer/cmd/explorer@latest`
- **THEN** the Go toolchain produces an `explorer` binary in `$GOBIN` (or `$GOPATH/bin`)
- **AND** running that binary against any readable directory serves the SPA and JSON API exactly as the `make build` output would

## ADDED Requirements

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
- **AND** the binary does NOT serve the "SPA not yet embedded" 501-style fallback

#### Scenario: SPA source change without dist regeneration is detectable

- **WHEN** a contributor modifies files under `web/src/` and commits without regenerating `internal/server/ui/dist/`
- **THEN** the project provides a documented mechanism (a Make target, pre-commit hook guidance, or CI check) by which the staleness of `internal/server/ui/dist/` relative to `web/src/` can be detected before merge
