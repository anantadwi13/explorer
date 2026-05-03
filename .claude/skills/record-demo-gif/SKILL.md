---
name: record-demo-gif
description: Record or regenerate the demo GIFs (docs/desktop.gif, docs/mobile.gif) used in the project README. Use whenever the user wants to refresh the recordings, change which interactions they show, or add a new scene.
license: MIT
compatibility: Requires ffmpeg (full build with the gif muxer — the playwright-bundled ffmpeg only outputs webm), node 20+, npm, and a chromium binary (chromium / chromium-browser / google-chrome / Playwright cache).
---

Regenerate the README demos. Two GIFs are produced:

- `docs/desktop.gif` — 1280×720 capture, scaled to 900px wide
- `docs/mobile.gif` — 390×720 capture, scaled to 320px wide

Both run at 12 fps and are encoded with an ffmpeg `palettegen`/`paletteuse` filter chain so the small file size doesn't smear text.

## Quick start (no timeline changes)

From the repo root:

```bash
./.claude/skills/record-demo-gif/record.sh
```

That single command rebuilds the SPA, starts a sandboxed `explorer` instance, drives a headless Chromium through the Chrome DevTools Protocol, captures PNG frames, and stitches them into the two GIFs. It cleans up its own background processes on exit.

If `ffmpeg` is missing the script prints how to install it (`sudo apt-get install -y ffmpeg`). The first run installs the `ws` npm package into the skill folder; later runs reuse it.

## What's in each timeline

The recorded interactions live in `record.mjs` under two clearly-marked blocks:

- `// === DESKTOP TIMELINE ===` — what `desktop.gif` shows
- `// === MOBILE TIMELINE ===` — what `mobile.gif` shows

Edit those blocks to change scenes, then re-run `record.sh`.

Current desktop sequence:

1. Click `README.md` from the main folder listing → markdown renders.
2. Smooth-scroll the markdown.
3. Open the Settings popover → click **Dark** → click breadcrumb to dismiss.
4. Click `images` folder in the sidebar tree → main pane shows folder.
5. Click the chevron next to `images` → tree expands.
6. Click `diagram.svg` from the expanded tree → SVG preview renders.

Current mobile sequence:

1. Tap `README.md` from the listing → markdown renders.
2. Scroll, then snap back to top.
3. Tap the hamburger (`Open folders`) → drawer slides in.
4. Tap the chevron next to `images` → tree expands inside the drawer.
5. Tap `diagram.svg` → drawer auto-closes, SVG preview renders.

## How it works (read this before editing)

**Frames**: a frame loop runs at 12 fps via CDP `Page.captureScreenshot`. Independently, a scripted timeline dispatches mouse/keyboard input. Whatever is on screen at each frame tick gets captured — there's no special "wait until idle" between actions, so spacing comes from `await sleep(ms)` calls in the timeline.

**Cursor**: headless Chrome doesn't paint an OS cursor, so `record.mjs` injects an SVG arrow + tap-pulse `<div>` into every new document via `Page.addScriptToEvaluateOnNewDocument`. The arrow's tip sits at `transform: translate(x, y)` and animates with a `cubic-bezier(.22,.61,.36,1)` glide. A `.tap` ring class pulses on every click.

**Click flow** (helper: `moveAndClickSelector(selector, moveDuration, opts?)`):

1. Look up element coords with `document.querySelector(...).getBoundingClientRect()`.
2. Animate the synthetic cursor to those coords via CSS transform.
3. Add the `tap` class to fire the pulse.
4. After ~150 ms, dispatch a real CDP `Input.dispatchMouseEvent` (mousePressed → mouseReleased) at the same coords.

`moveAndClickRoleText(role, text)` is the variant that finds elements by ARIA role + text content (used for the Light/Dark/System theme buttons).

**Theme reset**: every navigation re-runs the inline boot script in `web/index.html`, which reads `localStorage["explorer.theme"]`. To start every recording in light theme regardless of leftover state, the injection sets `localStorage.setItem('explorer.theme', 'light')` before any document script runs.

**Mobile drawer caveat**: the sidebar is always in the DOM but translated off-screen until `sidebarOpen` is true. Its `getBoundingClientRect()` reports negative `left` while hidden. Pass `{ minX: 0 }` to `getCoordsBySelector` (already done for the mobile timeline's chevron + diagram lookups) so the helper retries until the drawer actually slides in.

**Settings popover dismissal**: `useClickOutside` listens for `mousedown` on `document`. An in-page `element.click()` won't trigger it. Use a real CDP `clickAt(x, y)` against a coordinate outside the popover (the desktop timeline clicks the breadcrumb area at `(360, 30)`).

## Common selectors (to write or modify scenes)

Folder listing, main pane:

- File row: `a.row[href$="/view/<name>"]` (no trailing slash)
- Folder row: `a.row[href$="/view/<name>/"]` (trailing slash)

Sidebar tree (defined in `web/src/components/TreeSidebar.tsx`):

- Folder link: `a.tree-row[href$="/view/<name>/"]`
- File link: `a.tree-row[href$="/view/<path-with-slashes>"]`
- Expand chevron: `button[aria-label="Expand <name>"]`
- Collapse chevron: `button[aria-label="Collapse <name>"]`

Toolbar / chrome:

- Settings menu (desktop): `button[aria-label="Settings"]`
- Theme radio (desktop, inside the popover): use `moveAndClickRoleText('radio', 'Dark' | 'Light' | 'System')`
- Density radio (desktop): use `moveAndClickRoleText('radio', 'Compact' | 'Regular' | 'Comfy')`

Mobile-only:

- Hamburger (open drawer): `button[aria-label="Open folders"]`
- Drawer close button: `button[aria-label="Close folders"]`
- Header theme toggle: `button[aria-label="Toggle theme"]`

Common URL conventions to remember when writing `href$=` selectors: folders end with a trailing slash, files do not. So `/view/images/` is a folder and `/view/images/diagram.svg` is a file.

## Recipes for common changes

**Slow down or speed up a scene**: edit the `await sleep(...)` calls between actions. The cursor glide duration is the second arg to `moveAndClickSelector` (default 600 ms).

**Add a smooth scroll**: park the cursor first with `await moveCursor(x, y, 500)`, then loop `await evalJs("window.scrollBy({top: 32, behavior: 'auto'})"); await sleep(75)` for ~16 iterations.

**Add a new scene that opens a different file**: pick a file under `testdata/`, then add `await moveAndClickSelector('a.row[href$="/view/<path>"]', 700); await sleep(1100);`. For a sidebar click, swap `a.row` for `a.tree-row` and use the trailing-slash convention above. If the file lives inside a folder, expand the chevron first (`button[aria-label="Expand <folder>"]`).

**Switch the file shown in the SVG demo**: the test fixture `testdata/images/logo.png` is a 1×1 pixel placeholder that renders as a single dot — use `testdata/images/diagram.svg` instead (it's a small blue rounded rectangle with "SVG" text). If you need a different visual, drop a real image into `testdata/images/` and update the selector.

**Change frame rate or output size**: edit `FPS` in `record.mjs` and the `scale=...` filter in `record.sh`. 12 fps + `scale=900:-1` gives ~190 KB for a 16-second desktop clip; bumping to 18 fps roughly doubles the file.

**Test a single scene without re-running both captures**: comment out the timeline you don't need in `record.mjs` (everything stays alive across the script — both runs share one Chromium instance), or invoke `record.mjs` directly:

```bash
PORT=18794
./explorer ./testdata --port $PORT &
EXP_PID=$!
chromium-browser --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --remote-debugging-port=9222 about:blank &
CHROME_PID=$!
sleep 1
CDP=$(curl -s http://127.0.0.1:9222/json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const t=JSON.parse(d);console.log(t.find(x=>x.type==='page').webSocketDebuggerUrl)})")
node .claude/skills/record-demo-gif/record.mjs "$CDP" "http://127.0.0.1:$PORT" /tmp/frames-desktop 1280 720 0
kill $EXP_PID $CHROME_PID
```

Then encode just one GIF:

```bash
ffmpeg -y -framerate 12 -i /tmp/frames-desktop/frame_%04d.png \
  -vf "fps=12,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" \
  -loop 0 docs/desktop.gif
```

## Troubleshooting

**`error: ffmpeg not found` or `Unknown encoder 'gif'`** — install full ffmpeg (`sudo apt-get install -y ffmpeg`). The Playwright-bundled binary at `~/.cache/ms-playwright/ffmpeg-*/ffmpeg-linux` is configured for webm only and silently lacks the gif muxer.

**`error: no chromium binary found`** — install `chromium-browser` or set `CHROME_PATH=/path/to/chrome` before invoking `record.sh`.

**Cursor lands on the wrong spot** — the layout probably changed. Re-grep the selector against the latest `web/src/components/...` and update the timeline. ARIA labels are the safest anchor; class names like `.tree-row` are stable too but check the tsx file when in doubt.

**Final frame catches a popover or transition mid-animation** — increase the trailing `await sleep(...)` after the last action so the recorder keeps capturing while the UI settles. Each frame is ~83 ms at 12 fps, so add 200–400 ms.

**Theme didn't switch / GIF stayed in light theme** — confirm the boot-script injection ran. The desktop timeline opens the Settings popover and clicks the **Dark** button by text; if the menu structure changed, verify `moveAndClickRoleText('radio', 'Dark')` still resolves a single `[role="radio"]` whose `textContent.trim()` is exactly `"Dark"`.

**GIF too large** — drop the scale (`scale=720:-1` for desktop, `scale=280:-1` for mobile) or lower `max_colors=128` to `64` in the ffmpeg filter. Aim for under 250 KB so GitHub renders it inline.
