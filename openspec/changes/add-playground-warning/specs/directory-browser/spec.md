## MODIFIED Requirements

### Requirement: CLI invocation and flags

The `explorer` binary SHALL accept a single positional argument naming the directory to serve (the "served root") and SHALL accept optional flags `--port` and `--host`. The default `--port` SHALL be `8080`. The default `--host` SHALL be `127.0.0.1`. Invocation without a directory argument or with a path that is not an existing readable directory SHALL fail with a non-zero exit code and a message on stderr.

The binary SHALL print, as the first line of stdout on every successful startup (regardless of `--host` value), the exact playground banner line:

```
explorer (playground build — no auth, no audit; do not expose publicly)
```

The `--help` (and any usage-error) output SHALL include, immediately after the `Usage:` line and before the flag defaults, the exact two-line footer:

```
  Playground tool — no auth, no security audit. Bind to loopback
  unless you trust your network.
```

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

- **WHEN** the user runs `explorer` with no positional argument
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
- **AND** the line immediately after begins with `Playground tool — no auth, no security audit.`
- **AND** the flag defaults are printed below the footer
