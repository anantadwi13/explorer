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
        /* Larger, thicker, partly-filled ring so it survives the GIF's
           128-color palette and reads on both light and dark backgrounds.
           Animation is slower (650ms) so the recorder captures ~8 frames of
           it at 12 fps instead of ~5. */
        #__cursor .ring { position: absolute; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px; border: 4px solid rgba(255, 90, 30, 1); background: rgba(255, 90, 30, .35); border-radius: 50%; opacity: 0; transform: scale(.25); }
        #__cursor.tap .ring { animation: __cursorTap 650ms ease-out; }
        @keyframes __cursorTap {
          0%   { transform: scale(.25); opacity: 1; }
          60%  { transform: scale(1.0);  opacity: .7; }
          100% { transform: scale(1.7);  opacity: 0; }
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
  // Match the keyframe duration in CURSOR_INJECT (650ms) so callers that
  // `await tap;` don't release before the ring finishes fading.
  await sleep(650);
}

async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

// SettingsMenu listens for Escape on window — use this to dismiss the popover
// without picking a coordinate that might land on a listing row, the
// breadcrumb, or some other clickable element.
async function pressEscape() {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
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

// Find a button whose textContent (trimmed) matches `text`, scoped to an
// optional CSS container. Useful for menu items that don't have an ARIA role.
async function getCoordsByButtonText(text, containerSel = '') {
  const j = await evalJs(`
    JSON.stringify((() => {
      const scope = ${containerSel ? `document.querySelector(${JSON.stringify(containerSel)})` : 'document'};
      if (!scope) return null;
      const els = [...scope.querySelectorAll('button')];
      const e = els.find(x => x.textContent.trim() === ${JSON.stringify(text)});
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    })())
  `);
  const coords = JSON.parse(j);
  if (!coords) throw new Error(`button not found: text=${text}${containerSel ? ` in ${containerSel}` : ''}`);
  return coords;
}

async function moveAndClickButtonText(text, containerSel = '', moveDuration = 500) {
  const c = await getCoordsByButtonText(text, containerSel);
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

    // Force a clean starting point on every full navigation (light theme,
    // list view), and inject the synthetic cursor. Resetting `explorer.view`
    // matters because both runs share the same Chromium profile — without
    // this, a Grid pick during the desktop run would persist into the mobile
    // run and break selectors like `a.row[…]` that only exist in list view.
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source:
        `try { localStorage.setItem('explorer.theme', 'light'); } catch (e) {}\n` +
        `try { localStorage.setItem('explorer.view', 'list'); } catch (e) {}\n` +
        CURSOR_INJECT,
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
      // DESKTOP TIMELINE — 1280x720, served against testdata/sample-repo
      // (a git repo, so the branch picker + commits surface are active).
      // ====================================================================

      // Scene 1: open Settings on the folder listing → Dark theme → flip
      //          View to Grid (folder visibly switches to tiles) → flip back
      //          to List so the subsequent `a.row` selectors still resolve →
      //          dismiss. The popover holds the three global-preference rows
      //          (Theme, Density, View), so dwell long enough that the whole
      //          panel is visible.
      await sleep(600);
      await moveAndClickSelector('button[aria-label="Settings"]', 650);
      await sleep(650);
      await moveAndClickRoleText('radio', 'Dark', 450);
      await sleep(900);
      await moveAndClickRoleText('radio', 'Grid', 450);
      await sleep(1400); // dwell so the list→grid transition is visible
      await moveAndClickRoleText('radio', 'List', 450);
      await sleep(800);
      // Dismiss by clicking outside the popover with a visible cursor
      // animation + tap ring. (700, 65) lands in the empty right-hand side
      // of the toolbar's path row — past the breadcrumb text, and well left
      // of the popover (which anchors right against the Settings gear).
      // Hits the inert `.toolbar-path` div, so the click only fires
      // useClickOutside; nothing else navigates.
      await moveCursor(700, 65, 500);
      const desktopDismissTap = tapCursor();
      await sleep(150);
      await clickAt(700, 65);
      await desktopDismissTap;
      await sleep(600);

      // Scene 2: open README.md from the main folder listing
      await moveAndClickSelector('a.row[href$="/view/README.md"]', 700);
      await sleep(1100);

      // Scene 3: smooth-scroll through the markdown (short doc — few iters)
      await moveCursor(640, 380, 500);
      for (let i = 0; i < 8; i++) {
        await evalJs(`window.scrollBy({top: 32, behavior: 'auto'})`);
        await sleep(85);
      }
      await sleep(300);
      await evalJs(`window.scrollTo({top: 0, behavior: 'auto'})`);
      await sleep(400);

      // Scene 4: tree navigation → preview the binary logo image
      await moveAndClickSelector('a.tree-row[href$="/view/logo.png"]', 700);
      await sleep(1400);

      // Scene 5: git surface — open the branch picker, jump to the commits
      // list, then drill into the most recent commit to see its diff.
      // The picker, list, and detail page are all part of the new git-reader
      // capability and only render when the served root is a git repository.
      await moveAndClickSelector('button.branch-picker-trigger', 600);
      await sleep(700);
      await moveAndClickButtonText('View commits', '.branch-picker-menu', 500);
      await sleep(1100);
      await moveAndClickSelector('a.commit-subject', 600);
      await sleep(2200);
    } else {
      // ====================================================================
      // MOBILE TIMELINE — 390x720, served against testdata/sample-repo.
      // ====================================================================

      // Scene 1: tap the Settings gear in the topbar (it replaced the old
      //           standalone theme toggle) → Dark → flip View to Grid (the
      //           folder listing visibly switches to tiles) → flip back to
      //           List so later `a.row` selectors resolve → dismiss. The
      //           popover anchors right and stays inside the viewport at
      //           390 px, holding Theme, Density, and View rows.
      await sleep(700);
      await moveAndClickSelector('button[aria-label="Settings"]', 600);
      await sleep(700);
      await moveAndClickRoleText('radio', 'Dark', 450);
      await sleep(900);
      await moveAndClickRoleText('radio', 'Grid', 450);
      await sleep(1400);
      await moveAndClickRoleText('radio', 'List', 450);
      await sleep(800);
      // Dismiss by clicking outside the popover (see desktop note). On
      // mobile the popover at width 390 sits at x≈164-378, y≈58-280; the
      // breadcrumb path row is y≈102-127. (120, 115) is past the "Home"
      // breadcrumb text, left of the popover, and well above the listing.
      await moveCursor(120, 115, 500);
      const mobileDismissTap = tapCursor();
      await sleep(150);
      await clickAt(120, 115);
      await mobileDismissTap;
      await sleep(600);

      // Scene 2: open README.md from the main listing
      await moveAndClickSelector('a.row[href$="/view/README.md"]', 600);
      await sleep(1300);

      // Scene 3: scroll the markdown, then snap back so the header is visible
      await moveCursor(195, 500, 500);
      for (let i = 0; i < 8; i++) {
        await evalJs(`window.scrollBy({top: 32, behavior: 'auto'})`);
        await sleep(95);
      }
      await sleep(400);
      await evalJs(`window.scrollTo({top: 0, behavior: 'auto'})`);
      await sleep(400);

      // Scene 4: open the drawer via the hamburger
      await moveAndClickSelector('button[aria-label="Open folders"]', 600);
      await sleep(800); // drawer slide-in

      // Scene 5: tap logo.png → drawer auto-closes (closeSidebar fires on
      //          file Link click), image preview renders in the main pane.
      // minX:0 guards against clicking the still-translating off-screen rect.
      await moveAndClickSelector('a.tree-row[href$="/view/logo.png"]', 500, { minX: 0 });
      await sleep(1500);

      // Scene 6: reopen the drawer to reach the git surface — on mobile the
      // BranchPicker lives in the drawer header (LayoutSidebar). Tap it,
      // jump to the commits list, then drill into the most recent commit so
      // the diff view renders before the recording ends.
      await moveAndClickSelector('button[aria-label="Open folders"]', 500);
      await sleep(700);
      await moveAndClickSelector('button.branch-picker-trigger', 500, { minX: 0 });
      await sleep(700);
      await moveAndClickButtonText('View commits', '.branch-picker-menu', 500);
      await sleep(1400);
      await moveAndClickSelector('a.commit-subject', 600);
      await sleep(2200);
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
