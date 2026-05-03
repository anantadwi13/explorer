// Capture demo frames for the README GIFs by driving the explorer SPA via the
// Chrome DevTools Protocol. A synthetic mouse cursor is injected into the page
// so the captured frames show pointer movement and clicks (headless Chrome
// doesn't render an OS cursor).
//
// Usage:
//   node record.mjs <cdpUrl> <baseUrl> <outDir> <width> <height> <mobile 0|1>
//
// Example (driven by record.sh):
//   node record.mjs "ws://127.0.0.1:9222/devtools/page/<id>" \
//     "http://127.0.0.1:18794" /tmp/frames-desktop 1280 720 0
//
// To customise what the demo shows, edit the DESKTOP / MOBILE timelines below.

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { WebSocket as WS } from 'ws';

const [,, cdpUrl, baseUrl, outDir, widthStr, heightStr, mobileStr] = process.argv;
if (!cdpUrl || !baseUrl || !outDir) {
  console.error('usage: node record.mjs <cdpUrl> <baseUrl> <outDir> <width> <height> <mobile 0|1>');
  process.exit(64);
}
const width = parseInt(widthStr, 10);
const height = parseInt(heightStr, 10);
const mobile = mobileStr === '1';

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const ws = new WS(cdpUrl);
let id = 0;
const pending = new Map();
const eventListeners = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const cur = ++id;
    pending.set(cur, { res, rej });
    ws.send(JSON.stringify({ id: cur, method, params }));
  });
}
function once(eventName) {
  return new Promise((res) => eventListeners.set(eventName, res));
}
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
    else p.res(msg.result);
  } else if (msg.method && eventListeners.has(msg.method)) {
    const cb = eventListeners.get(msg.method);
    eventListeners.delete(msg.method);
    cb(msg.params);
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// SVG arrow + tap-pulse, position:fixed and z-index:max so it sits above the
// SPA. The tip of the arrow is at translate(x, y).
const CURSOR_INJECT = `
(function () {
  if (window.__cursorReady) return;
  window.__cursorReady = true;
  const onReady = () => {
    if (document.getElementById('__cursor')) return;
    const wrap = document.createElement('div');
    wrap.id = '__cursor';
    wrap.innerHTML = \`
      <style>
        #__cursor { position: fixed; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 2147483647; transform: translate(-200px, -200px); transition: transform 600ms cubic-bezier(.22,.61,.36,1); }
        #__cursor svg { position: absolute; left: -2px; top: -2px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
        #__cursor .ring { position: absolute; left: 0; top: 0; width: 36px; height: 36px; margin: -18px 0 0 -18px; border: 2px solid rgba(255, 99, 38, .95); border-radius: 50%; opacity: 0; transform: scale(.2); }
        #__cursor.tap .ring { animation: __cursorTap 420ms ease-out; }
        @keyframes __cursorTap {
          0%   { transform: scale(.2); opacity: .9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      </style>
      <span class="ring"></span>
      <svg width="22" height="22" viewBox="0 0 320 512" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 16 L16 360 L112 280 L176 408 L244 392 L176 264 L320 264 Z"
              fill="white" stroke="#111" stroke-width="28" stroke-linejoin="round"/>
      </svg>
    \`;
    document.body.appendChild(wrap);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady, { once: true });
  else onReady();
})();
`;

async function captureFrame(idx) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/frame_${String(idx).padStart(4, '0')}.png`, Buffer.from(data, 'base64'));
}

async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval error: ' + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

// minX is a guard against off-screen drawers: the mobile sidebar lives in the
// DOM with a negative `left` until it slides in. Pass { minX: 0 } when looking
// up an element that should be on-screen.
async function getCoordsBySelector(sel, { retries = 12, interval = 120, minX = -1e9 } = {}) {
  for (let i = 0; i < retries; i++) {
    const j = await evalJs(`
      JSON.stringify((() => {
        const e = document.querySelector(${JSON.stringify(sel)});
        if (!e) return null;
        const r = e.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return { x: r.left + r.width/2, y: r.top + r.height/2 };
      })())
    `);
    const coords = JSON.parse(j);
    if (coords && coords.x >= minX) return coords;
    await sleep(interval);
  }
  throw new Error(`not found after ${retries} retries: ${sel}`);
}

async function getCoordsByRoleText(role, text) {
  const j = await evalJs(`
    JSON.stringify((() => {
      const els = [...document.querySelectorAll('[role="${role}"]')];
      const e = els.find(x => x.textContent.trim() === ${JSON.stringify(text)});
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    })())
  `);
  const coords = JSON.parse(j);
  if (!coords) throw new Error(`not found: role=${role} text=${text}`);
  return coords;
}

async function moveCursor(x, y, duration = 600) {
  await evalJs(`(() => {
    const c = document.getElementById('__cursor');
    if (!c) return;
    c.style.transition = 'transform ${duration}ms cubic-bezier(.22,.61,.36,1)';
    c.style.transform = 'translate(${x}px, ${y}px)';
  })()`);
  await sleep(duration);
}

async function tapCursor() {
  await evalJs(`(() => {
    const c = document.getElementById('__cursor');
    if (!c) return;
    c.classList.remove('tap');
    void c.offsetWidth;
    c.classList.add('tap');
  })()`);
  await sleep(420);
}

async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function moveAndClickSelector(sel, moveDuration = 600, opts = {}) {
  const c = await getCoordsBySelector(sel, opts);
  await moveCursor(c.x, c.y, moveDuration);
  const tap = tapCursor();
  await sleep(150);
  await clickAt(c.x, c.y);
  await tap;
}

async function moveAndClickRoleText(role, text, moveDuration = 500) {
  const c = await getCoordsByRoleText(role, text);
  await moveCursor(c.x, c.y, moveDuration);
  const tap = tapCursor();
  await sleep(150);
  await clickAt(c.x, c.y);
  await tap;
}

ws.on('open', async () => {
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });

    // Force a clean light-theme starting point on every navigation, and inject
    // the synthetic cursor.
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('explorer.theme', 'light'); } catch (e) {}\n` + CURSOR_INJECT,
    });

    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url: baseUrl + '/view/' });
    await loaded;
    await sleep(700);

    const FPS = 12;
    const FRAME_INTERVAL = Math.round(1000 / FPS);
    let stopped = false;
    let frameIdx = 0;
    const frameTask = (async () => {
      while (!stopped) {
        const t0 = Date.now();
        await captureFrame(frameIdx++);
        const elapsed = Date.now() - t0;
        if (elapsed < FRAME_INTERVAL) await sleep(FRAME_INTERVAL - elapsed);
      }
    })();

    if (!mobile) {
      // ====================================================================
      // DESKTOP TIMELINE — 1280x720
      // Edit this block to change what the desktop GIF demonstrates.
      // ====================================================================

      // Scene 1: open README.md from the main folder listing
      await sleep(600);
      await moveAndClickSelector('a.row[href$="/view/README.md"]', 700);
      await sleep(1100);

      // Scene 2: smooth-scroll through the markdown
      await moveCursor(640, 380, 500);
      for (let i = 0; i < 16; i++) {
        await evalJs(`window.scrollBy({top: 32, behavior: 'auto'})`);
        await sleep(75);
      }
      await sleep(400);

      // Scene 3: open Settings → switch to Dark theme → dismiss popover
      await moveAndClickSelector('button[aria-label="Settings"]', 650);
      await sleep(450);
      await moveAndClickRoleText('radio', 'Dark', 450);
      await sleep(900);
      // Real CDP click is required to fire useClickOutside (mousedown listener) —
      // an in-page `.click()` won't dismiss the popover.
      await moveCursor(360, 30, 400);
      await tapCursor();
      await sleep(120);
      await clickAt(360, 30);
      await sleep(700);

      // Scene 4: navigate via the sidebar tree
      // 4a — click the `images` folder link in the tree
      await moveAndClickSelector('a.tree-row[href$="/view/images/"]', 700);
      await sleep(1100);
      // 4b — expand `images` via its chevron (chevron stops propagation, so the
      //      tree expands without re-navigating)
      await moveAndClickSelector('button[aria-label="Expand images"]', 600);
      await sleep(750);
      // 4c — click `diagram.svg` inside the expanded tree → image preview opens
      await moveAndClickSelector('a.tree-row[href$="/view/images/diagram.svg"]', 600);
      await sleep(1500);
    } else {
      // ====================================================================
      // MOBILE TIMELINE — 390x720
      // Edit this block to change what the mobile GIF demonstrates.
      // ====================================================================

      // Scene 1: open README.md from the main listing
      await sleep(700);
      await moveAndClickSelector('a.row[href$="/view/README.md"]', 600);
      await sleep(1300);

      // Scene 2: scroll the markdown, then snap back so the header is visible
      await moveCursor(195, 500, 500);
      for (let i = 0; i < 14; i++) {
        await evalJs(`window.scrollBy({top: 32, behavior: 'auto'})`);
        await sleep(85);
      }
      await sleep(500);
      await evalJs(`window.scrollTo({top: 0, behavior: 'auto'})`);
      await sleep(400);

      // Scene 3: open the drawer via the hamburger
      await moveAndClickSelector('button[aria-label="Open folders"]', 600);
      await sleep(800); // drawer slide-in

      // Scene 4: expand `images` via its chevron — drawer stays open.
      // minX:0 keeps us from clicking the still-translating off-screen rect.
      await moveAndClickSelector('button[aria-label="Expand images"]', 500, { minX: 0 });
      await sleep(750);

      // Scene 5: tap diagram.svg → drawer auto-closes (closeSidebar fires on
      //          file Link click), image preview renders in the main pane.
      await moveAndClickSelector('a.tree-row[href$="/view/images/diagram.svg"]', 500, { minX: 0 });
      await sleep(1500);
    }

    stopped = true;
    await frameTask;
    console.log(`captured ${frameIdx} frames into ${outDir}`);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
});
ws.on('error', (e) => { console.error('ws error', e); process.exit(2); });
