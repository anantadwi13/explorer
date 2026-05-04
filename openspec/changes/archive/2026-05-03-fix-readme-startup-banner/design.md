## Context

The README "Quick start" section contains a code block showing the startup banner the binary emits when `--host` is set to a non-loopback address. This example was written before the playground-warning headline (`playgroundBanner`) was added to `main.go`, and it also carries a `(also reachable on your LAN)` annotation on the URL line that the code never produces.

## Goals / Non-Goals

**Goals:**
- Make the README example exactly match `main.go`'s actual output
- No ambiguity for users or contributors reading the docs

**Non-Goals:**
- Changing any Go or TypeScript code
- Changing the startup banner wording itself
- Updating any spec requirements (no behavior is changing)

## Decisions

Single-file edit to `README.md`: replace the incorrect banner block with the correct one. No tests, no code, no spec delta required.

The correct output (derived from `main.go` lines 83-88) is:
```
explorer (playground build — no auth, no audit; do not expose publicly)
explorer serving /home/alice/docs
  → http://0.0.0.0:8080
  ⚠ host is not loopback — anyone on this network can read these files.
```

## Risks / Trade-offs

No risks — documentation-only change with no runtime impact.
