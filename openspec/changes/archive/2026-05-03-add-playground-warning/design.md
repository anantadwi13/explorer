## Context

`cmd/explorer/main.go` currently prints, on a successful startup:

```
explorer serving /home/alice/docs
  → http://127.0.0.1:8080
  ⚠ host is not loopback — anyone on this network can read these files.   (only when --host is non-loopback)
```

The non-loopback warning is the only runtime signal that the binary is not a hardened service. A user who runs `explorer .` against the default loopback bind sees no warning at all. The README likewise has no security callout — the closest adjacent text is a deferred-features list mentioning "Authentication / multi-user", which a casual reader would not parse as a security warning.

Meanwhile the binary has, by design: no auth, no rate limit, no TLS, no audit logs, hand-rolled path-traversal containment in `internal/server/resolver`, and a hand-rolled markdown sanitization pipeline. The threat model — *trusted user, trusted network, read-only* — is implicit in the code but not stated anywhere a user would encounter it. This change makes that threat model explicit at three discovery points (README, `--help`, startup banner) so a reader does not have to infer it.

## Goals / Non-Goals

**Goals:**

- Make the playground threat model legible at three points: the README (browsing the repo), `--help` (typing the binary at the shell), and the startup banner (running it).
- Always print the banner — including for the loopback default — because the loopback default is exactly the case where today's warnings are silent.
- Preserve the existing non-loopback warning verbatim. The new line *adds*; nothing existing is removed or reordered relative to itself.
- Keep the banner string a single source of truth in code, so tests, README, and spec can assert against the same value.

**Non-Goals:**

- Any actual hardening (auth, TLS, rate limit, audit logs, sandboxing, content scanning, third-party security audit). Those are different changes — much bigger ones — and out of scope here.
- Refusing to bind on non-loopback hosts. The existing "warn but allow" stance is intentional (LAN-from-phone is a documented use case in the README) and stays.
- A `--quiet` flag to suppress the banner. Defeats the point.
- Any change to the SPA, the API, the resolver, MIME detection, the embed pipeline, or tests outside `cmd/explorer/`.

## Decisions

### D1. Always print the banner, regardless of host

Printing only on non-loopback would leave the most common invocation (`explorer .`) silent — exactly the case where a misinformed user is most likely to forward the port, share the URL, or run it inside a container exposed to a wider network than they think. Cost is one extra line of stdout per run; benefit is the warning shows up where it can actually be seen.

*Alternative considered:* gate the playground line on the same `!isLoopback(host)` check the network warning uses. Rejected — the network warning is about *this specific invocation reaching too far*, the playground line is about *this binary's overall posture*. They are different facts and want different visibility rules.

### D2. Place the playground line first, before "explorer serving …"

The first line of stdout is what scrollback shows when the user comes back to the terminal hours later, and what tends to get copy-pasted into bug reports and screenshots. Putting the warning at the top maximises its chance of being seen. The existing "serving …" line and URL keep their current order below it, and the non-loopback warning (when applicable) keeps its current position below the URL.

```
Output when --host is loopback (default):

   explorer (playground build — no auth, no audit; do not expose publicly)
   explorer serving /home/alice/docs
     → http://127.0.0.1:8080

Output when --host is non-loopback:

   explorer (playground build — no auth, no audit; do not expose publicly)
   explorer serving /home/alice/docs
     → http://0.0.0.0:8080
     ⚠ host is not loopback — anyone on this network can read these files.
```

### D3. Preserve the non-loopback warning verbatim

The non-loopback warning is a separate, situational warning — "this specific run is reachable on the network" — and stays useful even with the playground banner above it. Stacking both is fine; they say different things. Removing or rewording the non-loopback warning would be a regression on an existing requirement.

### D4. `--help` footer is one sentence (rendered on two lines), immediately under the usage line

`fs.Usage` currently writes one `Usage:` line then calls `fs.PrintDefaults()`. Insert the playground sentence between them so it sits where a reader's eye lands first when they type `explorer --help`. Two-line wrap keeps the line under ~80 columns, indented with two spaces to align with the existing `Usage:` continuation convention.

### D5. README callout uses a blockquote with `⚠`, placed between the H1 and the tagline

A blockquote renders distinctively on GitHub (left border + indent), and the `⚠` glyph mirrors the startup banner's existing convention (the non-loopback warning uses the same glyph). Placement above the tagline means the callout appears in the GitHub README preview without scrolling. Avoids the temptation to bury it under a "Security" header that no one clicks through to.

### D6. Banner copy is fixed and centralised in a single Go constant

A package-scope `const playgroundBanner = "explorer (playground build — no auth, no audit; do not expose publicly)"` in `cmd/explorer/main.go` is the single source of truth. No flag, no env var, no build tag alters or removes it. The spec quotes the same string verbatim, README tasks reference the same string, and the implementation tests assert the exact line — three checks for the same string makes drift loud.

This also blocks the easy "I built it with `-ldflags=-X main.banner=''`" workaround. Anyone who really wants to remove the banner has to fork the source, which is fine — at that point they have explicitly chosen to defeat the warning.

### D7. Spec change is a MODIFY of the existing CLI requirement, not an ADD

The new banner line is a behavioural addition to the same surface (`cmd/explorer/main.go` startup output) the existing CLI requirement already covers. Splitting it into a sibling "Security warnings" requirement would fragment the CLI contract across two requirements that have to be read together to make sense. MODIFY keeps the entire CLI invocation contract in one place; existing scenarios get a small wording bump to expect the new banner line, and new scenarios cover the always-printed banner, banner+non-loopback stacking, and the `--help` footer.

## Risks / Trade-offs

- **Banner text drift between spec, code, README, and tests** → if the four copies get out of sync the spec stops being load-bearing. *Mitigation:* one Go constant, the spec quotes the string verbatim, README tasks reference the same string, and the tests assert the exact line. Four checks for the same string makes drift loud.
- **Adds one line of stdout to every invocation** → trivial. Anyone parsing `explorer`'s stdout programmatically is already in unsupported territory; the binary is not a long-lived service with a stable log format. Acceptable.
- **A user could still ignore all three warnings and expose the binary** → yes, and out of scope. This change does not promise to *prevent* misuse, only to make the threat model legible. Refusing to bind on non-loopback was rejected (see Non-Goals).
- **Future translation / i18n** → not a concern for a hobby tool. Banner stays English-only.
- **`--help` two-line wrap depending on terminal width** → users on narrow terminals already see flag descriptions wrap; the fixed two-line break keeps the footer ≤ 80 columns even on minimal terminals. Acceptable.

## Migration Plan

No data migration. No config migration. Single binary rebuild + README rewrite. Rollback is reverting the commit. No interaction with any other in-flight change.

## Open Questions

None. The change is fully specified by the proposal + this design + the spec delta.
