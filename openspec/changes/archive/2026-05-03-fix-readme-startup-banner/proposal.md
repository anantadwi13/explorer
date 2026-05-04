## Why

The startup banner example in the README's "Quick start" section does not match what the binary actually prints: it omits the playground-warning headline and includes a `(also reachable on your LAN)` annotation on the URL line that the code never emits. This misleads users and contributors about what to expect when they run the binary.

## What Changes

- Update the startup banner code block in the README's "Quick start" section to match the actual output of `main.go`:
  - Add the missing first line: `explorer (playground build — no auth, no audit; do not expose publicly)`
  - Remove the non-existent `(also reachable on your LAN)` annotation from the URL line

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
<!-- none — this is a documentation-only fix; no spec-level behavior is changing -->

## Impact

- `README.md` only — no code, API, or spec changes required.
