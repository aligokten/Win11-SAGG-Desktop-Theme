'use strict';
// OS integration: native helper process, wallpaper lookup, system stats, weather.
const { app, nativeImage, net } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const isWin = process.platform === 'win32';
const resDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..');
const helperPath = app.isPackaged ? path.join(resDir, 'helper.ps1') : path.join(resDir, 'src', 'native', 'helper.ps1');
const wallpaperDir = path.join(resDir, 'wallpapers');

/* ---------- native helper (PowerShell) ---------- */
class Helper extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.buf = '';
    this.restarts = 0;
    this.stopping = false;
    this.queue = [];
  }

  start() {
    if (!isWin || this.proc || this.stopping) return;
    try {
      const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      this.proc = spawn(exe, ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    } catch (e) {
      this.proc = null;
      return;
    }
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (d) => this.onData(d));
    this.proc.stdin.on('error', () => {});
    this.proc.on('error', () => { this.proc = null; });
    this.proc.on('exit', () => {
      this.proc = null;
      this.emit('exit');
      if (!this.stopping && this.restarts < 5) {
        this.restarts++;
        setTimeout(() => { this.start(); this.emit('restart'); }, 2000);
      }
    });
    for (const line of this.queue.splice(0)) this.send(line);
  }

  onData(d) {
    this.buf += d;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      try { this.emit('message', JSON.parse(line)); } catch { /* ignore noise */ }
    }
  }

  send(line) {
    if (!isWin) return;
    if (!this.proc) { this.queue.push(line); return; }
    try { this.proc.stdin.write(line + '\n', 'utf8'); } catch { /* helper gone */ }
  }

  // Ask the helper to undo system changes and exit; resolves when it is gone.
  stop() {
    this.stopping = true;
    return new Promise((resolve) => {
      if (!this.proc) return resolve();
      const p = this.proc;
      const t = setTimeout(() => { try { p.kill(); } catch {} resolve(); }, 2500);
      p.once('exit', () => { clearTimeout(t); resolve(); });
      try { p.stdin.write('quit\n'); p.stdin.end(); } catch { clearTimeout(t); resolve(); }
    });
  }
}

/* ---------- wallpaper ---------- */
function regWallpaper() {
  return new Promise((resolve) => {
    if (!isWin) return resolve(null);
    execFile('cmd.exe', ['/d', '/c', 'chcp 65001>nul & reg query "HKCU\\Control Panel\\Desktop" /v WallPaper'],
      { windowsHide: true, encoding: 'utf8', windowsVerbatimArguments: true }, (err, out) => {
        if (err) return resolve(null);
        const m = /REG_SZ\s+(.+?)\s*$/m.exec(out || '');
        resolve(m ? m[1] : null);
      });
  });
}

async function findWallpaperCandidates() {
  const list = [];
  if (isWin) {
    const themes = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Themes');
    list.push(path.join(themes, 'TranscodedWallpaper'));
    try {
      const cached = path.join(themes, 'CachedFiles');
      const files = fs.readdirSync(cached).map((f) => path.join(cached, f))
        .map((f) => ({ f, t: fs.statSync(f).mtimeMs })).sort((a, b) => b.t - a.t);
      if (files[0]) list.push(files[0].f);
    } catch { /* none */ }
    const reg = await regWallpaper();
    if (reg) list.push(reg);
  }
  list.push(path.join(wallpaperDir, 'aurora.jpg'));
  return list;
}

function decode(file) {
  try {
    const img = nativeImage.createFromBuffer(fs.readFileSync(file));
    return img.isEmpty() ? null : img;
  } catch { return null; }
}

// Returns { url, file, mtime } - wallpaper cropped to the display aspect ("fill") and downscaled.
async function loadWallpaper(displaySize) {
  for (const file of await findWallpaperCandidates()) {
    if (!fs.existsSync(file)) continue;
    let img = decode(file);
    if (!img) continue;
    const { width, height } = img.getSize();
    const target = displaySize.width / displaySize.height;
    let cw = width, ch = height;
    if (width / height > target) cw = Math.round(height * target); else ch = Math.round(width / target);
    img = img.crop({ x: Math.floor((width - cw) / 2), y: Math.floor((height - ch) / 2), width: cw, height: ch });
    if (cw > 1600) img = img.resize({ width: 1600, quality: 'good' });
    let mtime = 0;
    try { mtime = fs.statSync(file).mtimeMs; } catch {}
    return { url: 'data:image/jpeg;base64,' + img.toJPEG(84).toString('base64'), file, mtime };
  }
  return { url: null, file: null, mtime: 0 };
}

function listBundledWallpapers() {
  const names = { aurora: 'Aurora', dusk: 'Gün Batımı', ocean: 'Okyanus', graphite: 'Grafit' };
  try {
    return fs.readdirSync(wallpaperDir).filter((f) => /\.jpe?g$/i.test(f)).sort().map((f) => {
      const id = path.basename(f, path.extname(f));
      const img = nativeImage.createFromPath(path.join(wallpaperDir, f)).resize({ width: 320 });
      return { id, name: names[id] || id, thumb: 'data:image/jpeg;base64,' + img.toJPEG(80).toString('base64') };
    });
  } catch { return []; }
}

function bundledWallpaperPath(id) {
  const safe = String(id).replace(/[^a-z0-9_-]/gi, '');
  const p = path.join(wallpaperDir, safe + '.jpg');
  return fs.existsSync(p) ? p : null;
}

/* ---------- system stats ---------- */
let lastCpu = null;
function cpuSample() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    for (const k of Object.keys(c.times)) total += c.times[k];
    idle += c.times.idle;
  }
  return { idle, total };
}

async function systemStats() {
  const now = cpuSample();
  let cpu = 0;
  if (lastCpu && now.total > lastCpu.total) {
    cpu = 1 - (now.idle - lastCpu.idle) / (now.total - lastCpu.total);
  }
  lastCpu = now;
  const total = os.totalmem();
  const free = os.freemem();
  let disk = null;
  try {
    const st = await fs.promises.statfs(isWin ? (process.env.SystemDrive || 'C:') + '\\' : '/');
    const dt = st.blocks * st.bsize;
    const df = st.bavail * st.bsize;
    disk = { total: dt, used: dt - df };
  } catch { /* unsupported */ }
  return { cpu: Math.max(0, Math.min(1, cpu)), mem: { total, used: total - free }, disk };
}

/* ---------- weather (open-meteo, no API key) ---------- */
const weatherCache = new Map();
async function getJson(url) {
  const res = await net.fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function weather(city, unit) {
  const key = (city || '').trim().toLowerCase() + '|' + unit;
  const hit = weatherCache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.data;
  try {
    const geo = await getJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=tr&name=' + encodeURIComponent(city));
    const place = geo.results && geo.results[0];
    if (!place) return { error: 'Şehir bulunamadı' };
    const tu = unit === 'f' ? 'fahrenheit' : 'celsius';
    const w = await getJson('https://api.open-meteo.com/v1/forecast?latitude=' + place.latitude + '&longitude=' + place.longitude +
      '&current=temperature_2m,weather_code,is_day,apparent_temperature,relative_humidity_2m,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5&timezone=auto&temperature_unit=' + tu);
    const data = {
      city: place.name,
      temp: w.current.temperature_2m,
      feels: w.current.apparent_temperature,
      code: w.current.weather_code,
      isDay: !!w.current.is_day,
      humidity: w.current.relative_humidity_2m,
      wind: w.current.wind_speed_10m,
      days: w.daily.time.map((t, i) => ({
        date: t, code: w.daily.weather_code[i], max: w.daily.temperature_2m_max[i], min: w.daily.temperature_2m_min[i]
      }))
    };
    weatherCache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return hit ? hit.data : { error: 'Bağlantı yok' };
  }
}

/* ---------- registry tweaks ---------- */
function setTaskbarAlign(align) {
  if (!isWin) return;
  execFile('reg.exe', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced',
    '/v', 'TaskbarAl', '/t', 'REG_DWORD', '/d', align === 'left' ? '0' : '1', '/f'], { windowsHide: true }, () => {});
}

module.exports = {
  isWin, Helper, loadWallpaper, listBundledWallpapers, bundledWallpaperPath, systemStats, weather, setTaskbarAlign
};
