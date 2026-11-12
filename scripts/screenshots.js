'use strict';
// Launches the real app (under Xvfb on Linux) and captures UI screenshots into docs/screenshots.
// Usage: xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/screenshots.js
const { _electron: electron, chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'docs', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sagg-shots-'));
  const app = await electron.launch({
    executablePath: require(path.join(root, 'node_modules', 'electron')),
    args: [root, '--no-sandbox', '--user-data-dir=' + profile, '--force-device-scale-factor=1']
  });
  const errors = [];
  app.on('window', (p) => {
    p.on('pageerror', (e) => errors.push(p.url().split('/renderer/')[1] + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(p.url().split('/renderer/')[1] + ': ' + m.text()); });
  });
  // Sample weather so the widget is populated even where the API host is unreachable.
  await app.evaluate(({ ipcMain }) => {
    const day = (i, code, max, min) => ({ date: new Date(Date.now() + i * 864e5).toISOString().slice(0, 10), code, max, min });
    ipcMain.removeHandler('weather:get');
    ipcMain.handle('weather:get', () => ({
      city: 'İstanbul', temp: 17, feels: 16, code: 2, isDay: true, humidity: 62, wind: 14,
      days: [day(0, 2, 19, 12), day(1, 0, 21, 13), day(2, 61, 16, 11), day(3, 3, 15, 10), day(4, 1, 18, 11)]
    }));
  });
  await sleep(5000);

  const find = (part) => app.windows().find((w) => w.url().includes(part));
  const settings = find('/settings/');
  const set = (k, v) => settings.evaluate(([key, val]) => window.sagg.invoke('settings:set', key, val), [k, v]);
  const nav = async (id) => { await settings.click(`.nav-item[data-page="${id}"]`); await sleep(700); };

  // desktop composite: wallpaper + every transparent window at its real screen position
  async function desktop(name, hoverDock) {
    await sleep(1200);
    if (hoverDock) {
      const dock = find('/dock/');
      const size = await dock.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
      await dock.mouse.move(size.w / 2 - 150, size.h - 40);
      await sleep(200);
      await dock.mouse.move(size.w / 2 - 146, size.h - 40);
      await sleep(900);
    }
    const wins = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
      .filter((w) => w.isVisible()).map((w) => ({ url: w.webContents.getURL(), b: w.getBounds() })));
    const layers = [];
    for (const w of wins) {
      if (w.url.includes('/settings/')) continue;
      const page = app.windows().find((p) => p.url() === w.url);
      if (!page) continue;
      const png = await page.screenshot({ omitBackground: true });
      layers.push({ b: w.b, src: 'data:image/png;base64,' + png.toString('base64') });
    }
    const wallUrl = await settings.evaluate(() => window.sagg.invoke('env:get').then((e) => e.wallpaper));
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(`<body style="margin:0;width:1920px;height:1080px;background:url('${wallUrl}') center/cover;overflow:hidden">
      ${layers.map((l) => `<img src="${l.src}" style="position:absolute;left:${l.b.x}px;top:${l.b.y}px;width:${l.b.width}px;height:${l.b.height}px">`).join('')}</body>`);
    await page.screenshot({ path: path.join(out, name) });
    await browser.close();
  }

  const shot = async (name) => { await sleep(500); await settings.screenshot({ path: path.join(out, name) }); };

  await set('widgets.items.weather.unit', 'f');
  await set('widgets.items.weather.unit', 'c');
  await set('widgets.items.notes.enabled', true);
  await set('widgets.items.notes.text', 'Liquid Glass tema ✨\n• Dock simgelerini düzenle\n• Hava durumu şehrini seç\n• Duvar kâğıdını değiştir');
  await desktop('01-masaustu.png');

  await nav('overview'); await shot('02-ayarlar-genel-bakis.png');
  await nav('appearance'); await shot('03-ayarlar-gorunum.png');
  await nav('dock'); await shot('04-ayarlar-dock.png');
  await settings.evaluate(() => { document.getElementById('scroll').scrollTop = 560; }); await shot('05-ayarlar-dock-ogeleri.png');
  await nav('icons'); await shot('06-ayarlar-simgeler.png');
  await nav('widgets'); await shot('07-ayarlar-widgetlar.png');
  await nav('windows'); await shot('08-ayarlar-windows.png');
  await nav('about'); await shot('09-ayarlar-hakkinda.png');

  // dark mode + clear glass icons + crystal preset
  await set('appearance.mode', 'dark');
  await settings.evaluate(() => window.sagg.invoke('settings:applyPreset', 'crystal'));
  await set('icons.palette', 'clear');
  await set('widgets.items.clock.style', 'digital');
  await desktop('10-masaustu-koyu-kristal.png', true);
  await nav('appearance'); await shot('11-ayarlar-gorunum-koyu.png');

  console.log(errors.length ? 'RENDERER ERRORS:\n' + errors.join('\n') : 'no renderer errors');
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
