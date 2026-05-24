## MODIFIED Requirements

### Requirement: Embedded version metadata in released binaries

Every binary produced by the release pipeline SHALL contain version metadata injected at link time via `go build -ldflags "-X main.version=<tag> -X main.commit=<short-sha> -X main.buildDate=<utc-yyyy-mm-dd>"`, where:

- `<tag>` is the pushed git tag verbatim (e.g. `v0.1.0`).
- `<short-sha>` is the first 7 characters of the tagged commit's SHA.
- `<utc-yyyy-mm-dd>` is the date the release was built, in UTC, in `yyyy-mm-dd` format.

When a release-built binary is invoked with `--version` (or its `-v` alias), it SHALL print exactly one line to stdout in the form:

```
<tag> (commit <short-sha>, built <utc-yyyy-mm-dd>)
```

and exit with status 0, before any directory-argument validation. (The CLI flag itself, including the precedence-over-positional behaviour, is normatively specified in the `cli` capability — this requirement only constrains the values that release builds inject.)

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
