#!/usr/bin/env bash
# Regenerate docs/desktop.gif and docs/mobile.gif by driving the explorer SPA
# through the Chrome DevTools Protocol and stitching frames with ffmpeg.
#
# Run from the repo root:
#   ./.claude/skills/record-demo-gif/record.sh
#
# Edit record.mjs to change the recorded timeline.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

PORT=18794
DEBUG_PORT=9222

# --- prerequisites ---------------------------------------------------------

command -v ffmpeg >/dev/null 2>&1 || {
  echo "error: ffmpeg not found. Install with: sudo apt-get install -y ffmpeg" >&2
  exit 1
}
command -v node >/dev/null 2>&1 || {
  echo "error: node 20+ not found." >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "error: npm not found." >&2
  exit 1
}

# Find a chromium binary. Prefer the Playwright cache (already extracted, fast
# startup); fall back to system chromium installs.
CHROME=""
for candidate in \
  "${CHROME_PATH:-}" \
  "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome \
  "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/headless_shell \
  "$(command -v chromium 2>/dev/null || true)" \
  "$(command -v chromium-browser 2>/dev/null || true)" \
  "$(command -v google-chrome 2>/dev/null || true)" \
  "$(command -v google-chrome-stable 2>/dev/null || true)" ; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    CHROME="$candidate"
    break
  fi
done
[ -n "$CHROME" ] || {
  echo "error: no chromium binary found. Set CHROME_PATH or install chromium-browser." >&2
  exit 1
}
echo "using chromium: $CHROME"

# --- one-off setup ---------------------------------------------------------

# Install ws into the skill directory if missing.
if [ ! -d "$SKILL_DIR/node_modules/ws" ]; then
  echo "installing ws into $SKILL_DIR..."
  (cd "$SKILL_DIR" && npm install --silent)
fi

# Build the explorer binary if missing. (`make build` rebuilds the SPA too,
# which is what we want — the recorded GIF should reflect current SPA code.)
if [ ! -x "$REPO_ROOT/explorer" ]; then
  echo "building explorer..."
  make build
fi

# --- start servers ---------------------------------------------------------

EXP_LOG="$(mktemp -t explorer-rec.XXXXXX.log)"
CHROME_LOG="$(mktemp -t chrome-rec.XXXXXX.log)"
EXP_PID=""
CHROME_PID=""

cleanup() {
  set +e
  [ -n "$EXP_PID" ] && kill "$EXP_PID" 2>/dev/null
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null
  rm -f "$EXP_LOG" "$CHROME_LOG"
  rm -rf /tmp/frames-desktop /tmp/frames-mobile
}
trap cleanup EXIT

echo "starting explorer on :$PORT..."
"$REPO_ROOT/explorer" "$REPO_ROOT/testdata" --port "$PORT" >"$EXP_LOG" 2>&1 &
EXP_PID=$!
sleep 1
curl -sf -o /dev/null "http://127.0.0.1:$PORT/" || {
  echo "error: explorer failed to start" >&2
  cat "$EXP_LOG" >&2
  exit 1
}

echo "starting chromium on debug port :$DEBUG_PORT..."
"$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --remote-debugging-port="$DEBUG_PORT" about:blank >"$CHROME_LOG" 2>&1 &
CHROME_PID=$!

# Poll the debug endpoint — system chromium (snap) takes several seconds to come up.
CDP_WS=""
for i in $(seq 1 30); do
  sleep 0.5
  RESP="$(curl -sf "http://127.0.0.1:$DEBUG_PORT/json" 2>/dev/null || true)"
  if [ -n "$RESP" ]; then
    CDP_WS="$(echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const t=JSON.parse(d);const p=t.find(x=>x.type==='page');if(p){console.log(p.webSocketDebuggerUrl)}}catch(e){}})")"
    if [ -n "$CDP_WS" ]; then break; fi
  fi
done
[ -n "$CDP_WS" ] || {
  echo "error: chromium debug port did not become ready within 15s" >&2
  echo "--- chrome log ---" >&2
  tail -20 "$CHROME_LOG" >&2
  exit 1
}

# --- capture frames + encode ----------------------------------------------

mkdir -p "$REPO_ROOT/docs"

echo "capturing desktop frames..."
node "$SKILL_DIR/record.mjs" "$CDP_WS" "http://127.0.0.1:$PORT" /tmp/frames-desktop 1280 720 0

echo "capturing mobile frames..."
node "$SKILL_DIR/record.mjs" "$CDP_WS" "http://127.0.0.1:$PORT" /tmp/frames-mobile 390 720 1

echo "encoding docs/desktop.gif..."
ffmpeg -y -hide_banner -loglevel warning -framerate 12 \
  -i /tmp/frames-desktop/frame_%04d.png \
  -vf "fps=12,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" \
  -loop 0 "$REPO_ROOT/docs/desktop.gif"

echo "encoding docs/mobile.gif..."
ffmpeg -y -hide_banner -loglevel warning -framerate 12 \
  -i /tmp/frames-mobile/frame_%04d.png \
  -vf "fps=12,scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" \
  -loop 0 "$REPO_ROOT/docs/mobile.gif"

echo
echo "done."
ls -la "$REPO_ROOT/docs/desktop.gif" "$REPO_ROOT/docs/mobile.gif"
