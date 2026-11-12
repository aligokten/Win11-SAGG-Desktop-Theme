'use strict';
// Generates bundled wallpapers and app/tray icons with headless Chromium (dev-time only).
// Usage: node scripts/gen-assets.js   (needs `playwright` available to Node)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const blob = (x, y, r, c) => `radial-gradient(circle at ${x}% ${y}%, ${c} 0, transparent ${r}%)`;
const WALLS = {
  aurora: {
    base: 'linear-gradient(160deg,#061a3a,#0a2a5e 40%,#1a1147)',
    blobs: [blob(18, 78, 46, '#12d6b0'), blob(52, 30, 40, '#3b7bff'), blob(84, 68, 44, '#a445ff'), blob(70, 8, 30, '#22e3ff'), blob(6, 12, 30, '#5a3bff'), blob(40, 96, 28, '#ff5fa8')]
  },
  dusk: {
    base: 'linear-gradient(170deg,#2a1150,#7a1f6b 45%,#ff7a45)',
    blobs: [blob(20, 86, 48, '#ffb347'), blob(78, 78, 44, '#ff4f7b'), blob(56, 24, 42, '#8a4dff'), blob(8, 18, 34, '#3d2bb8'), blob(94, 14, 30, '#ff8fd0')]
  },
  ocean: {
    base: 'linear-gradient(165deg,#bfe9ff,#58b8ff 45%,#1560d6)',
    blobs: [blob(16, 22, 44, '#ffffff'), blob(74, 30, 42, '#7fe7ff'), blob(34, 84, 46, '#1f6bff'), blob(88, 86, 40, '#32d3c0'), blob(56, 58, 30, '#9fd4ff')]
  },
  graphite: {
    base: 'linear-gradient(160deg,#0d0e12,#1d2029 50%,#0a0b0e)',
    blobs: [blob(22, 28, 40, '#4a5068'), blob(78, 72, 44, '#2f3d63'), blob(60, 12, 30, '#6b6f80'), blob(10, 90, 34, '#3a2f55')]
  }
};

const wallHtml = (w) => `<html><body style="margin:0;width:2560px;height:1440px;overflow:hidden;background:${w.base}">
<div style="position:absolute;inset:-12%;background:${w.blobs.join(',')};filter:blur(70px) saturate(125%);"></div>
<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,transparent 45%,rgba(0,0,0,.28) 100%)"></div>
<svg width="2560" height="1440" style="position:absolute;inset:0;opacity:.07;mix-blend-mode:overlay"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>
</body></html>`;

const iconHtml = (size, tray) => `<html><body style="margin:0;background:transparent">
<div id="i" style="width:${size}px;height:${size}px;position:relative">
<div style="position:absolute;inset:${tray ? 4 : 6}%;border-radius:24%;background:linear-gradient(160deg,#7df3ff,#6a8bff 45%,#b45cf5 88%);
box-shadow:inset 0 ${size / 64}px 0 rgba(255,255,255,.55), inset 0 0 0 ${Math.max(0.5, size / 256)}px rgba(255,255,255,.3), 0 ${size / 40}px ${size / 22}px rgba(0,0,0,.28);overflow:hidden">
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.36),rgba(255,255,255,.05) 46%,transparent 52%)"></div>
<svg viewBox="0 0 24 24" style="position:absolute;inset:17%;width:66%;height:66%;filter:drop-shadow(0 ${size / 90}px ${size / 70}px rgba(0,0,0,.25))" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
<path d="M12 3.4c3.2 3.9 5.6 6.6 5.6 10a5.6 5.6 0 0 1-11.2 0c0-3.4 2.4-6.1 5.6-10z" fill="#fff" fill-opacity=".34"/><path d="M9.4 14.2a2.8 2.8 0 0 0 2.4 2.6"/></svg>
</div></div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  fs.mkdirSync(path.join(root, 'wallpapers'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(root, 'build', 'icons'), { recursive: true });

  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  for (const [name, w] of Object.entries(WALLS)) {
    await page.setContent(wallHtml(w));
    await page.screenshot({ path: path.join(root, 'wallpapers', name + '.jpg'), type: 'jpeg', quality: 90 });
  }
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(iconHtml(size, size <= 32));
    await (await page.$('#i')).screenshot({ path: path.join(root, 'build', 'icons', size + '.png'), omitBackground: true });
  }
  fs.copyFileSync(path.join(root, 'build', 'icons', '512.png'), path.join(root, 'assets', 'icon.png'));
  fs.copyFileSync(path.join(root, 'build', 'icons', '32.png'), path.join(root, 'assets', 'tray.png'));
  await browser.close();
  console.log('assets generated; run scripts/make-ico.py to build build/icon.ico');
})();
