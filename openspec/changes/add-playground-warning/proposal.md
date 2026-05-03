## Why

`explorer` is a hobby-grade local browser, but nothing in the README or the binary's runtime output explicitly says so. The existing non-loopback host warning only fires when `--host` is non-loopback, so a user running the default `explorer .` sees no warning at all and may incorrectly infer the binary is production-grade. Anyone who can reach the listening port can read every file under the served root — there is no auth, no rate limit, no TLS termination, no audit logs, and the resolver / sanitizer code is hand-rolled and not third-party-audited. This change makes that threat model legible without changing it.

## What Changes

- **README** gets a prominent `⚠ Playground / personal use only` callout near the top (between the H1 and "What it does"), spelling out: no auth, no rate limit, no security audit; intended for loopback or trusted-LAN use; do not expose to the public internet, behind a tunnel, or on a shared host.
- **Startup banner** (`cmd/explorer/main.go`) gains a new always-printed first line — `explorer (playground build — no auth, no audit; do not expose publicly)` — printed unconditionally before the existing `serving …` / URL / non-loopback-warning lines. The existing non-loopback warning is preserved verbatim.
- **`--help` / usage output** (`cmd/explorer/main.go` `fs.Usage`) gains a one-sentence footer below the existing usage line: `Playground tool — no auth, no security audit. Bind to loopback unless you trust your network.`

Out of scope (deferred to other changes if ever pursued):

- Actual security hardening — auth, rate limiting, TLS, audit logs, content sniffing for malicious uploads, third-party security audit. This change is doc + banner only.
- A startup `--quiet` flag to suppress the banner. The banner is the point.
- Refusing to bind when `--host` is non-loopback. This change keeps the existing "warn but allow" stance.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `directory-browser`: extends the existing **CLI invocation and flags** requirement to mandate the always-printed playground banner line and a `--help` footer that surfaces the same warning at command-line discovery time. No other requirements change.

## Impact

- **Affected Go code**: `cmd/explorer/main.go` only — one new `fmt.Printf` for the banner line, one extra line in `fs.Usage`. No changes under `internal/`, the resolver, MIME detection, the SPA, the API contract, or tests beyond the scenarios added here.
- **Affected docs**: `README.md` — one new blockquote callout near the top.
- **Spec**: delta against `openspec/specs/directory-browser/spec.md` only — modifies the existing `### Requirement: CLI invocation and flags` section. No new spec files.
- **Build / dependencies**: no changes. No new packages, no Makefile changes, no Docker changes.
- **Behavioural**: every existing invocation now prints one extra line on stdout at startup. No existing output is removed. `--help` text grows by one line.
- **No interaction** with `refresh-spa-design` (in-flight) or the planned post-`refresh-spa-design` API restructure (see project memory). Can land in any order relative to either.
