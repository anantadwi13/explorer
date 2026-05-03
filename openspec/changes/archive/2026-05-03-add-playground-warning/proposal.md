## Why

`explorer` is a hobby-grade local browser, but nothing in the README or the binary's runtime output explicitly says so. The existing non-loopback host warning only fires when `--host` is non-loopback, so a user running the default `explorer .` sees no warning at all and may incorrectly infer the binary is production-grade. Anyone who can reach the listening port can read every file under the served root — there is no auth, no rate limit, no TLS termination, no audit logs, and the resolver / sanitizer code is hand-rolled and not third-party-audited. This change makes that threat model legible without changing it.

## What Changes

- **README** gains a prominent `⚠ Playground / personal use only` blockquote callout near the top (between the H1 and the tagline) spelling out: no auth, no rate limit, no security audit; intended for loopback or trusted-LAN use; do not expose to the public internet, behind a tunnel, or on a shared host.
- **Startup banner** (`cmd/explorer/main.go`) gains a new always-printed first line — `explorer (playground build — no auth, no audit; do not expose publicly)` — printed unconditionally before the existing `serving …` / URL / non-loopback-warning lines. The existing non-loopback warning is preserved verbatim and still appears strictly after the new line.
- **`--help` / usage output** (`cmd/explorer/main.go` `fs.Usage`) gains a two-line footer immediately after the `Usage:` line and before the flag defaults: `Playground tool — no auth, no security audit. Bind to loopback unless you trust your network.`

Out of scope (deferred to other changes if ever pursued):

- Actual security hardening — auth, rate limiting, TLS, audit logs, content sniffing for malicious uploads, third-party security audit. This change is doc + banner only.
- A `--quiet` flag to suppress the banner. The banner is the point.
- Refusing to bind when `--host` is non-loopback. This change keeps the existing "warn but allow" stance.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `directory-browser`: extends the existing **CLI invocation and flags** requirement so the always-printed playground banner line is part of the CLI contract and the `--help` output surfaces the same warning at command-line discovery time. No other requirements change.

## Impact

- **Affected Go code**: `cmd/explorer/main.go` only — one new banner constant, one `fmt.Println` at the start of `main()`, and two extra lines inside `fs.Usage`. No changes under `internal/`, the resolver, MIME detection, the SPA, or the API contract.
- **Affected docs**: `README.md` — one new blockquote callout immediately under the H1.
- **Spec**: delta against `openspec/specs/directory-browser/spec.md` only — modifies the existing `### Requirement: CLI invocation and flags` section. No new spec files.
- **Build / dependencies**: no changes. No new packages, no Makefile changes, no Docker changes.
- **Behavioural**: every successful invocation now prints one extra line on stdout at startup. No existing output is removed. `--help` text grows by two lines.
- **Tests**: new black-box tests in `cmd/explorer/` covering the banner-on-loopback, banner-stacks-with-non-loopback-warning, and `--help`-footer scenarios.
- **No interaction** with any other in-flight change. Can land in any order relative to other work.
