'use strict';
const { app, BrowserWindow, ipcMain, screen, nativeTheme, nativeImage, Tray, Menu, shell, dialog, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Store, clone } = require('./store');
const { DEFAULTS, PRESETS } = require('./defaults');
const sys = require('./system');

const isWin = sys.isWin;
const RENDERER = path.join(__dirname, '..', 'renderer');
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const PRELOAD = path.join(__dirname, '..', 'preload.js');

// Minimal file log (userData/sagg.log) so start-up problems can be diagnosed on a user's machine.
function log(...parts) {
  try {
    const file = path.join(app.getPath('userData'), 'sagg.log');
    try { if (fs.statSync(file).size > 512 * 1024) fs.unlinkSync(file); } catch {}
    const text = parts.map((p) => (p instanceof Error ? p.stack || p.message : typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${text}\n`);
  } catch { /* logging must never throw */ }
}
process.on('uncaughtException', (e) => log('uncaughtException', e));
process.on('unhandledRejection', (e) => log('unhandledRejection', e));
const step = async (name, fn) => {
  log('step: ' + name);
  try { await fn(); } catch (e) { log('step failed: ' + name, e); }
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId('com.sagg.desktoptheme');

let store;
let helper;
let tray = null;
let settingsWin = null;
let dockWin = null;
const widgetWins = new Map();
let wallpaper = { url: null, file: null, mtime: 0 };
let helperState = { fullscreen: false, procs: [] };
let quitting = false;

const WIDGET_SIZES = {
  clock: { w: 180, h: 180 },
  calendar: { w: 330, h: 180 },
  weather: { w: 330, h: 180 },
  system: { w: 330, h: 180 },
  notes: { w: 250, h: 250 }
};
const WIDGET_PAD = 18; // transparent margin around a widget for its drop shadow

const S = () => store.get();

/* ---------- helpers ---------- */
function allWindows() {
  return [settingsWin, dockWin, ...widgetWins.values()].filter((w) => w && !w.isDestroyed());
}

function broadcast(channel, payload) {
  for (const w of allWindows()) w.webContents.send(channel, payload);
}

function envPayload() {
  return {
    wallpaper: wallpaper.url,
    dark: nativeTheme.shouldUseDarkColors,
    platform: process.platform,
    version: app.getVersion(),
    nativeHelper: !!(helper && helper.proc)
  };
}

function sendBounds(win) {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const d = screen.getDisplayMatching(b).bounds;
  win.webContents.send('win:bounds', {
    x: b.x, y: b.y, width: b.width, height: b.height,
    zoom: win.webContents.getZoomFactor(),
    display: { x: d.x, y: d.y, width: d.width, height: d.height }
  });
}

function baseWebPrefs() {
  return { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false };
}

function lockDown(win) {
  const wc = win.webContents;
  const name = () => { try { return path.basename(path.dirname(new URL(wc.getURL()).pathname)); } catch { return '?'; } };
  wc.on('render-process-gone', (_e, d) => log('renderer gone', name(), d.reason));
  wc.on('did-fail-load', (_e, code, desc) => log('load failed', name(), code, desc));
  wc.on('console-message', (e) => { if (e.level === 'error') log('renderer error', name(), e.message); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('system-context-menu', (e) => e.preventDefault());
}

async function refreshWallpaper(force) {
  const size = screen.getPrimaryDisplay().size;
  try {
    if (!force && wallpaper.file) {
      const m = fs.statSync(wallpaper.file).mtimeMs;
      if (m === wallpaper.mtime) return;
    }
  } catch { /* file vanished: reload */ }
  const next = await sys.loadWallpaper(size);
  if (next.url !== wallpaper.url) {
    wallpaper = next;
    broadcast('env:changed', envPayload());
  } else {
    wallpaper = next;
  }
}

/* ---------- dock ---------- */
function dockMetrics() {
  const d = S().dock;
  const max = d.magnify ? d.magnifyScale : 1;
  const pad = Math.round(d.iconSize * 0.16);
  const panelH = d.iconSize + pad * 2;
  return {
    height: Math.ceil(d.iconSize * max + pad * 2 + d.margin + 48),
    reserve: panelH + d.margin + 6
  };
}

function dockBounds() {
  const disp = screen.getPrimaryDisplay();
  const m = dockMetrics();
  const useFull = S().windows.reserveDockSpace;
  const area = useFull ? disp.bounds : disp.workArea;
  return { x: disp.bounds.x, y: area.y + area.height - m.height, width: disp.bounds.width, height: m.height };
}

function createDock() {
  if (dockWin && !dockWin.isDestroyed()) return;
  dockWin = new BrowserWindow({
    ...dockBounds(),
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, focusable: false, alwaysOnTop: true, show: false, type: 'toolbar',
    webPreferences: baseWebPrefs()
  });
  dockWin.setAlwaysOnTop(true, 'pop-up-menu');
  lockDown(dockWin);
  dockWin.loadFile(path.join(RENDERER, 'dock', 'index.html'));
  dockWin.once('ready-to-show', () => { updateDockVisibility(); sendBounds(dockWin); });
  dockWin.webContents.on('did-finish-load', () => sendBounds(dockWin));
  dockWin.on('closed', () => { dockWin = null; });
}

function layoutDock() {
  if (!dockWin || dockWin.isDestroyed()) return;
  dockWin.setBounds(dockBounds());
  sendBounds(dockWin);
}

function updateDockVisibility() {
  if (!dockWin || dockWin.isDestroyed()) return;
  const hide = S().dock.hideOnFullscreen && helperState.fullscreen;
  if (hide) dockWin.hide();
  else if (!dockWin.isVisible()) dockWin.showInactive();
}

function syncDock() {
  if (S().dock.enabled) { createDock(); layoutDock(); updateDockVisibility(); }
  else if (dockWin && !dockWin.isDestroyed()) dockWin.destroy();
  applyReserve();
}

function applyReserve() {
  if (!helper) return;
  const s = S();
  const on = s.dock.enabled && s.windows.reserveDockSpace && !s.dock.autoHide;
  const scale = screen.getPrimaryDisplay().scaleFactor || 1;
  helper.send('reserve ' + (on ? Math.round(dockMetrics().reserve * scale) : 0));
  setTimeout(layoutDock, 600);
}

/* ---------- dock items ---------- */
async function iconDataUrl(file) {
  try {
    const img = await nativeImage.createThumbnailFromPath(file, { width: 128, height: 128 });
    if (!img.isEmpty()) return img.toDataURL();
  } catch { /* fall through */ }
  try {
    const img = await app.getFileIcon(file, { size: 'large' });
    if (!img.isEmpty()) return img.toDataURL();
  } catch { /* no icon */ }
  return null;
}

async function itemFromPath(file) {
  let target = file;
  let iconSource = file;
  if (isWin && /\.lnk$/i.test(file)) {
    try {
      const link = shell.readShortcutLink(file);
      if (link.target) target = link.target;
      if (link.icon && fs.existsSync(link.icon)) iconSource = link.icon;
      else if (link.target && fs.existsSync(link.target)) iconSource = link.target;
    } catch { /* keep the .lnk itself */ }
  }
  const name = path.basename(file).replace(/\.(lnk|exe|url|appref-ms)$/i, '');
  return {
    id: 'app-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    kind: 'app',
    name,
    icon: (await iconDataUrl(iconSource)) || 'pack:app',
    launch: { type: 'path', target: file },
    exe: /\.exe$/i.test(target) ? path.basename(target).toLowerCase() : null
  };
}

async function addDockPaths(paths) {
  const items = S().dock.items.slice();
  let added = 0;
  for (const p of paths || []) {
    if (typeof p !== 'string' || !p || !fs.existsSync(p)) continue;
    if (items.some((i) => i.launch && i.launch.type === 'path' && i.launch.target.toLowerCase() === p.toLowerCase())) continue;
    const item = await itemFromPath(p);
    const sep = items.findIndex((i) => i.kind === 'separator');
    if (sep >= 0) items.splice(sep, 0, item); else items.push(item);
    added++;
  }
  if (added) setSetting('dock.items', items);
  return added;
}

function launchItem(id) {
  const item = S().dock.items.find((i) => i.id === id);
  if (!item || !item.launch) return;
  const l = item.launch;
  if (l.type === 'theme-settings') return openSettings();
  if (!isWin) return; // dev preview on other platforms
  if (l.type === 'start') return helper.send('start');
  if (l.type === 'url') return void shell.openExternal(l.target).catch(() => {});
  if (l.type === 'path') return void shell.openPath(l.target);
  if (l.type === 'exec') {
    const fallback = () => { if (l.fallback) spawnDetached(l.fallback, [], () => {}); };
    spawnDetached(l.target, l.args || [], fallback);
  }
}

function spawnDetached(cmd, args, onError) {
  try {
    const p = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    p.on('error', onError);
    p.unref();
  } catch { onError(); }
}

/* ---------- widgets ---------- */
function widgetSize(type) {
  const scale = S().widgets.scale || 1;
  const b = WIDGET_SIZES[type];
  return { width: Math.round((b.w + WIDGET_PAD * 2) * scale), height: Math.round((b.h + WIDGET_PAD * 2) * scale) };
}

function defaultWidgetPos(type) {
  const wa = screen.getPrimaryDisplay().workArea;
  const scale = S().widgets.scale || 1;
  const gap = 16 * scale;
  const colW = (330 + WIDGET_PAD * 2) * scale;
  const rowH = 180 * scale + gap;
  const right = wa.x + wa.width - 20 - colW;
  const top = wa.y + 20;
  const pos = {
    weather: { x: right, y: top },
    calendar: { x: right, y: top + rowH },
    system: { x: right, y: top + rowH * 2 },
    clock: { x: right - 180 * scale - gap, y: top },
    notes: { x: right - 250 * scale - gap, y: top + rowH }
  }[type];
  return { x: Math.round(pos.x), y: Math.round(pos.y) };
}

function onScreen(x, y, size) {
  return screen.getAllDisplays().some((d) => {
    const b = d.bounds;
    return x + size.width > b.x + 40 && x < b.x + b.width - 40 && y + size.height > b.y + 40 && y < b.y + b.height - 40;
  });
}

function createWidget(type) {
  const cfg = S().widgets.items[type];
  const size = widgetSize(type);
  let pos = (Number.isFinite(cfg.x) && Number.isFinite(cfg.y)) ? { x: cfg.x, y: cfg.y } : defaultWidgetPos(type);
  if (!onScreen(pos.x, pos.y, size)) pos = defaultWidgetPos(type);
  const win = new BrowserWindow({
    ...pos, ...size,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, show: false, type: 'toolbar',
    alwaysOnTop: !!S().widgets.alwaysOnTop,
    webPreferences: baseWebPrefs()
  });
  win.widgetType = type;
  lockDown(win);
  // Right-click on a draggable region arrives as a system menu request, not a DOM event.
  win.on('system-context-menu', () => showWidgetMenu(win));
  win.loadFile(path.join(RENDERER, 'widget', 'index.html'), { query: { type } });
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(S().widgets.scale || 1);
    sendBounds(win);
  });
  win.once('ready-to-show', () => {
    win.showInactive();
    if (!S().widgets.alwaysOnTop) sendToBottom(win);
    sendBounds(win);
  });
  let saveTimer = null;
  win.on('move', () => {
    sendBounds(win);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const [x, y] = win.getPosition();
      store.set(`widgets.items.${type}.x`, x);
      store.set(`widgets.items.${type}.y`, y);
    }, 400);
  });
  win.on('closed', () => { clearTimeout(saveTimer); widgetWins.delete(type); });
  widgetWins.set(type, win);
}

function showWidgetMenu(win) {
  if (!win || win.isDestroyed() || !win.widgetType) return;
  const type = win.widgetType;
  const s = S();
  Menu.buildFromTemplate([
    { label: 'Bu Widget\'ı Gizle', click: () => setSetting(`widgets.items.${type}.enabled`, false) },
    { label: 'Konumları Kilitle', type: 'checkbox', checked: s.widgets.locked, click: (m) => setSetting('widgets.locked', m.checked) },
    { label: 'Her Zaman Üstte', type: 'checkbox', checked: s.widgets.alwaysOnTop, click: (m) => setSetting('widgets.alwaysOnTop', m.checked) },
    { type: 'separator' },
    { label: 'Widget Ayarları…', click: () => openSettings('widgets') }
  ]).popup({ window: win });
}

function sendToBottom(win) {
  if (!isWin || !helper || win.isDestroyed()) return;
  try {
    const buf = win.getNativeWindowHandle();
    const hwnd = buf.length >= 8 ? buf.readBigUInt64LE(0).toString() : String(buf.readUInt32LE(0));
    helper.send('bottom ' + hwnd);
  } catch { /* ignore */ }
}

function syncWidgets() {
  const w = S().widgets;
  for (const type of Object.keys(WIDGET_SIZES)) {
    const want = w.enabled && w.items[type] && w.items[type].enabled;
    const win = widgetWins.get(type);
    if (want && !win) createWidget(type);
    else if (!want && win) win.destroy();
    else if (want && win) {
      win.setAlwaysOnTop(!!w.alwaysOnTop);
      const size = widgetSize(type);
      const b = win.getBounds();
      if (b.width !== size.width || b.height !== size.height) {
        win.setResizable(true);
        win.setBounds({ x: b.x, y: b.y, ...size });
        win.setResizable(false);
        win.webContents.setZoomFactor(w.scale || 1);
        sendBounds(win);
      }
    }
  }
}

function raiseWidgets() {
  for (const win of widgetWins.values()) {
    if (win.isDestroyed()) continue;
    win.showInactive();
    win.moveTop();
  }
}

function resetWidgetPositions() {
  for (const type of Object.keys(WIDGET_SIZES)) {
    store.set(`widgets.items.${type}.x`, null);
    store.set(`widgets.items.${type}.y`, null);
    const win = widgetWins.get(type);
    if (win && !win.isDestroyed()) {
      const p = defaultWidgetPos(type);
      win.setPosition(p.x, p.y);
      sendBounds(win);
    }
  }
  broadcast('settings:changed', S());
}

/* ---------- settings window ---------- */
function openSettings(section) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    if (section) settingsWin.webContents.send('settings:navigate', section);
    return;
  }
  settingsWin = new BrowserWindow({
    width: 1060, height: 720, minWidth: 920, minHeight: 620,
    frame: false, backgroundColor: '#15161a', show: false, title: 'SAGG Desktop Theme',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: baseWebPrefs()
  });
  lockDown(settingsWin);
  settingsWin.loadFile(path.join(RENDERER, 'settings', 'index.html'), section ? { query: { section } } : undefined);
  settingsWin.once('ready-to-show', () => { settingsWin.show(); sendBounds(settingsWin); });
  for (const ev of ['move', 'resize']) settingsWin.on(ev, () => sendBounds(settingsWin));
  settingsWin.on('closed', () => { settingsWin = null; });
}

/* ---------- settings changes ---------- */
function applyAutostart() {
  if (!isWin || !app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!S().general.autostart, args: ['--hidden'] });
}

function setSetting(keyPath, value) {
  store.set(keyPath, value);
  afterChange(keyPath);
}

function afterChange(keyPath) {
  broadcast('settings:changed', S());
  if (keyPath.startsWith('dock.') || keyPath === '*') syncDock();
  if (keyPath.startsWith('widgets.') || keyPath === '*') syncWidgets();
  if (keyPath === 'general.autostart' || keyPath === '*') applyAutostart();
  if (keyPath === 'windows.taskbarAutoHide' || keyPath === '*') {
    helper.send('taskbar ' + (S().windows.taskbarAutoHide ? 1 : 0));
    setTimeout(applyReserve, 1500);
  }
  if (keyPath === 'windows.taskbarAlign') sys.setTaskbarAlign(S().windows.taskbarAlign);
  if (keyPath === 'windows.reserveDockSpace') applyReserve();
  buildTrayMenu();
}

/* ---------- tray ---------- */
function buildTrayMenu() {
  if (!tray) return;
  const s = S();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Tema Ayarlarını Aç', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Dock', type: 'checkbox', checked: s.dock.enabled, click: (m) => setSetting('dock.enabled', m.checked) },
    { label: 'Widget\'lar', type: 'checkbox', checked: s.widgets.enabled, click: (m) => setSetting('widgets.enabled', m.checked) },
    { label: 'Widget\'ları Öne Getir\tCtrl+Alt+W', click: raiseWidgets },
    { type: 'separator' },
    { label: 'Çıkış', click: () => app.quit() }
  ]));
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, 'tray.png')));
    tray.setToolTip('SAGG Desktop Theme');
    tray.on('click', () => openSettings());
    buildTrayMenu();
  } catch (e) {
    tray = null;
  }
}

/* ---------- IPC ---------- */
function registerIpc() {
  const winOf = (e) => BrowserWindow.fromWebContents(e.sender);

  ipcMain.handle('settings:get', () => S());
  ipcMain.handle('settings:set', (e, keyPath, value) => { setSetting(String(keyPath), value); });
  ipcMain.handle('settings:presets', () => PRESETS);
  ipcMain.handle('settings:applyPreset', (e, id) => {
    const p = PRESETS[id];
    if (!p) return;
    const { name, ...values } = p;
    store.set('appearance', { ...S().appearance, ...values, preset: id });
    afterChange('appearance.preset');
  });
  ipcMain.handle('settings:reset', () => { store.reset(); afterChange('*'); resetWidgetPositions(); });
  ipcMain.handle('settings:resetDock', () => setSetting('dock.items', clone(DEFAULTS.dock.items)));
  ipcMain.handle('settings:export', async (e) => {
    const r = await dialog.showSaveDialog(winOf(e), {
      title: 'Ayarları Dışa Aktar', defaultPath: 'sagg-tema-ayarlari.json', filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, JSON.stringify(S(), null, 2));
    return true;
  });
  ipcMain.handle('settings:import', async (e) => {
    const r = await dialog.showOpenDialog(winOf(e), {
      title: 'Ayarları İçe Aktar', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePaths[0]) return false;
    try {
      const data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
      if (!data || typeof data !== 'object' || !data.appearance) return false;
      store.replace(data);
      afterChange('*');
      return true;
    } catch { return false; }
  });

  ipcMain.handle('env:get', () => envPayload());
  ipcMain.handle('win:info', (e) => { const w = winOf(e); if (w) sendBounds(w); });
  ipcMain.handle('win:minimize', (e) => { const w = winOf(e); if (w) w.minimize(); });
  ipcMain.handle('win:close', (e) => { const w = winOf(e); if (w) w.close(); });

  ipcMain.handle('dock:launch', (e, id) => launchItem(String(id)));
  ipcMain.handle('dock:running', () => helperState.procs);
  ipcMain.on('dock:ignore', (e, ignore) => {
    if (dockWin && !dockWin.isDestroyed() && e.sender === dockWin.webContents) {
      dockWin.setIgnoreMouseEvents(!!ignore, { forward: true });
    }
  });
  ipcMain.handle('dock:pickApps', async (e) => {
    const r = await dialog.showOpenDialog(winOf(e), {
      title: 'Dock\'a Uygulama Ekle',
      defaultPath: isWin ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs') : undefined,
      properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
      filters: [{ name: 'Uygulamalar ve Kısayollar', extensions: ['exe', 'lnk', 'url'] }, { name: 'Tüm Dosyalar', extensions: ['*'] }]
    });
    if (r.canceled) return 0;
    return addDockPaths(r.filePaths);
  });
  ipcMain.handle('dock:addPaths', (e, paths) => addDockPaths(Array.isArray(paths) ? paths : []));
  ipcMain.handle('dock:pickIcon', async (e, id) => {
    const r = await dialog.showOpenDialog(winOf(e), {
      title: 'Simge Seç', properties: ['openFile'],
      filters: [{ name: 'Görseller', extensions: ['png', 'jpg', 'jpeg', 'ico', 'exe', 'lnk'] }]
    });
    if (r.canceled || !r.filePaths[0]) return false;
    const file = r.filePaths[0];
    let url = null;
    if (/\.(png|jpe?g)$/i.test(file)) {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) url = img.resize({ width: 128, height: 128, quality: 'best' }).toDataURL();
    } else {
      url = await iconDataUrl(file);
    }
    if (!url) return false;
    const items = S().dock.items.map((i) => (i.id === id ? { ...i, icon: url } : i));
    setSetting('dock.items', items);
    return true;
  });
  ipcMain.handle('dock:contextMenu', (e, id) => {
    const s = S();
    const item = id ? s.dock.items.find((i) => i.id === id) : null;
    const tpl = [];
    if (item && item.kind !== 'separator') {
      tpl.push({ label: 'Aç', click: () => launchItem(item.id) });
      tpl.push({ label: 'Dock\'tan Kaldır', click: () => setSetting('dock.items', S().dock.items.filter((i) => i.id !== item.id)) });
      tpl.push({ type: 'separator' });
    }
    tpl.push({ label: 'Otomatik Gizle', type: 'checkbox', checked: s.dock.autoHide, click: (m) => setSetting('dock.autoHide', m.checked) });
    tpl.push({ label: 'Büyütme Efekti', type: 'checkbox', checked: s.dock.magnify, click: (m) => setSetting('dock.magnify', m.checked) });
    tpl.push({ type: 'separator' });
    tpl.push({ label: 'Dock Ayarları…', click: () => openSettings('dock') });
    const win = winOf(e);
    if (!win) return;
    // A non-focusable window cannot dismiss a native menu; borrow focus while it is open.
    win.setFocusable(true);
    win.focus();
    Menu.buildFromTemplate(tpl).popup({
      window: win,
      callback: () => { if (!win.isDestroyed()) { win.setFocusable(false); win.setAlwaysOnTop(true, 'pop-up-menu'); } }
    });
  });

  ipcMain.handle('widget:contextMenu', (e) => showWidgetMenu(winOf(e)));
  ipcMain.handle('widgets:resetPositions', () => resetWidgetPositions());
  ipcMain.handle('widgets:raise', () => raiseWidgets());

  ipcMain.handle('sys:stats', () => sys.systemStats());
  ipcMain.handle('weather:get', (e, city, unit) => sys.weather(String(city || ''), unit === 'f' ? 'f' : 'c'));

  ipcMain.handle('wallpapers:list', () => sys.listBundledWallpapers());
  ipcMain.handle('wallpapers:apply', (e, id) => {
    const p = sys.bundledWallpaperPath(id);
    if (!p || !isWin) return false;
    helper.send('wallpaper ' + p);
    setTimeout(() => refreshWallpaper(true), 1500);
    setTimeout(() => refreshWallpaper(true), 4000);
    return true;
  });
  ipcMain.handle('app:openSettings', (e, section) => openSettings(section));
  ipcMain.handle('app:quit', () => app.quit());
}

/* ---------- self test (--selftest): exercises the Windows integration and logs the results ---------- */
async function selfTest() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const query = () => new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 4000);
    helper.once('info', (m) => { clearTimeout(t); resolve(m); });
    helper.send('query');
  });
  const results = [];
  const check = (name, ok, detail) => { results.push(ok); log(`selftest ${ok ? 'PASS' : 'FAIL'}: ${name}`, detail === undefined ? '' : detail); };
  await wait(7000);
  const outDir = path.join(app.getPath('userData'), 'selftest');
  fs.mkdirSync(outDir, { recursive: true });

  const expected = 2 + Object.values(S().widgets.items).filter((w) => w.enabled).length;
  check('window count', allWindows().length === expected, `${allWindows().length}/${expected}`);
  for (const w of allWindows()) {
    const name = path.basename(path.dirname(new URL(w.webContents.getURL()).pathname)) + (w.widgetType ? '-' + w.widgetType : '');
    const info = await w.webContents.executeJavaScript(`({
      glass: document.querySelectorAll('.glass-layers').length,
      wall: !!(window.Theme && Theme.env && Theme.env.wallpaper),
      bounds: !!(window.Theme && Theme.bounds),
      text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 60)
    })`).catch((e) => ({ error: String(e) }));
    check('window ' + name, w.isVisible() && info.glass > 0 && info.wall && info.bounds, { b: w.getBounds(), ...info });
    try { fs.writeFileSync(path.join(outDir, name + '.png'), (await w.webContents.capturePage()).toPNG()); } catch (e) { log('capture failed', name, e); }
  }
  check('wallpaper source', !!wallpaper.file, wallpaper.file);
  check('tray', !!tray);

  if (isWin) {
    check('helper process', !!helper.proc);
    const q0 = await query();
    check('helper query', !!q0, q0);
    if (q0) {
      helper.send('taskbar 1'); await wait(2000);
      const q1 = await query();
      check('taskbar auto-hide on', !!q1 && q1.autohide === true);
      helper.send('reserve 90'); await wait(1500);
      const q2 = await query();
      check('reserve dock space', !!q2 && q2.work[3] === q2.screen[1] - 90, q2 && q2.work);
      helper.send('reserve 0'); await wait(1000);
      helper.send('taskbar 0'); await wait(2500);
      const q3 = await query();
      check('taskbar restored', !!q3 && q3.autohide === q0.autohide, q3 && q3.work);
    }
    const wx = await sys.weather('İstanbul', 'c');
    check('weather api', !!wx && !wx.error && Number.isFinite(wx.temp) && wx.days.length === 5, wx && (wx.error || `${wx.city} ${wx.temp}`));
    launchItem('notepad'); await wait(6000);
    check('launch + running detection', helperState.procs.includes('notepad.exe'), helperState.procs.join(','));
    spawn('taskkill', ['/IM', 'notepad.exe', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => {});
    const added = await addDockPaths([path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'mspaint.exe'), path.join(process.env.SystemRoot || 'C:\\Windows', 'regedit.exe')]);
    const last = S().dock.items.filter((i) => i.kind === 'app');
    check('add app + icon extraction', added > 0 && last.every((i) => /^data:image\/png/.test(i.icon)), last.map((i) => i.name + ':' + String(i.icon).length));
    await wait(1500);
    if (dockWin) fs.writeFileSync(path.join(outDir, 'dock-after-add.png'), (await dockWin.webContents.capturePage()).toPNG());
  }
  const failed = results.filter((r) => !r).length;
  log(`selftest done: ${results.length - failed} passed, ${failed} failed`);
  app.quit();
}

/* ---------- lifecycle ---------- */
app.on('second-instance', () => openSettings());
app.on('window-all-closed', () => { /* keep running in the tray */ });

app.on('before-quit', (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  try { store.saveNow(); } catch {}
  globalShortcut.unregisterAll();
  // Let the helper restore the taskbar / work area before we exit.
  helper.stop().finally(() => app.exit(0));
});

app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'));
  log('start', app.getVersion(), process.platform, process.getSystemVersion ? process.getSystemVersion() : '');
  helper = new sys.Helper();
  helper.on('message', (m) => {
    if (m.t === 'ready') log('helper ready, native=' + m.native);
    if (m.t === 'error') log('helper error', m.cmd, m.message);
    if (m.t === 'info') { log('helper info', m); helper.emit('info', m); }
    if (m.t === 'state') {
      helperState = { fullscreen: !!m.fullscreen, procs: Array.isArray(m.procs) ? m.procs : (m.procs ? [m.procs] : []) };
      updateDockVisibility();
      if (dockWin && !dockWin.isDestroyed()) dockWin.webContents.send('dock:running', helperState.procs);
    }
  });
  helper.on('restart', () => {
    log('helper restarted');
    if (S().windows.taskbarAutoHide) helper.send('taskbar 1');
    applyReserve();
  });
  await step('helper', () => helper.start());
  await step('ipc', registerIpc);
  await step('wallpaper', () => refreshWallpaper(true));
  await step('tray', createTray);
  await step('taskbar', () => { if (S().windows.taskbarAutoHide) helper.send('taskbar 1'); });
  await step('dock', syncDock);
  await step('widgets', syncWidgets);
  await step('autostart', applyAutostart);

  const hidden = process.argv.includes('--hidden');
  await step('settings window', () => { if (!hidden || S().general.firstRun) openSettings(); });
  if (S().general.firstRun) store.set('general.firstRun', false);

  await step('shortcut', () => { globalShortcut.register('Control+Alt+W', raiseWidgets); });
  log('ready');
  if (process.argv.includes('--selftest')) selfTest().catch((e) => { log('selftest crashed', e); app.exit(1); });

  setInterval(() => refreshWallpaper(false).catch(() => {}), 5000);
  nativeTheme.on('updated', () => broadcast('env:changed', envPayload()));
  const relayout = () => {
    layoutDock();
    for (const w of allWindows()) sendBounds(w);
    refreshWallpaper(true).catch(() => {});
  };
  screen.on('display-metrics-changed', relayout);
  screen.on('display-added', relayout);
  screen.on('display-removed', relayout);
});
