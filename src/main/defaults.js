'use strict';

// Built-in dock entries. `launch` is interpreted by main.js (launchItem).
const DEFAULT_DOCK_ITEMS = [
  { id: 'start', kind: 'builtin', name: 'Başlat', icon: 'pack:launchpad', launch: { type: 'start' } },
  { id: 'explorer', kind: 'builtin', name: 'Dosya Gezgini', icon: 'pack:files', launch: { type: 'exec', target: 'explorer.exe' }, exe: 'explorer.exe' },
  { id: 'browser', kind: 'builtin', name: 'Tarayıcı', icon: 'pack:browser', launch: { type: 'url', target: 'https://www.bing.com' } },
  { id: 'mail', kind: 'builtin', name: 'Posta', icon: 'pack:mail', launch: { type: 'url', target: 'mailto:' } },
  { id: 'store', kind: 'builtin', name: 'Microsoft Store', icon: 'pack:store', launch: { type: 'url', target: 'ms-windows-store:' } },
  { id: 'photos', kind: 'builtin', name: 'Fotoğraflar', icon: 'pack:photos', launch: { type: 'url', target: 'ms-photos:' } },
  { id: 'calculator', kind: 'builtin', name: 'Hesap Makinesi', icon: 'pack:calculator', launch: { type: 'url', target: 'calculator:' } },
  { id: 'notepad', kind: 'builtin', name: 'Not Defteri', icon: 'pack:notes', launch: { type: 'exec', target: 'notepad.exe' }, exe: 'notepad.exe' },
  { id: 'terminal', kind: 'builtin', name: 'Terminal', icon: 'pack:terminal', launch: { type: 'exec', target: 'wt.exe', fallback: 'cmd.exe' }, exe: 'windowsterminal.exe' },
  { id: 'winsettings', kind: 'builtin', name: 'Windows Ayarları', icon: 'pack:settings', launch: { type: 'url', target: 'ms-settings:' }, exe: 'systemsettings.exe' },
  { id: 'sep1', kind: 'separator' },
  { id: 'theme', kind: 'builtin', name: 'Tema Ayarları', icon: 'pack:theme', launch: { type: 'theme-settings' } },
  { id: 'trash', kind: 'builtin', name: 'Geri Dönüşüm Kutusu', icon: 'pack:trash', launch: { type: 'exec', target: 'explorer.exe', args: ['shell:RecycleBinFolder'] } }
];

const DEFAULTS = {
  version: 1,
  general: {
    autostart: true,
    firstRun: true
  },
  appearance: {
    preset: 'clear',
    mode: 'auto',          // auto | light | dark
    accent: '#0a84ff',
    blur: 26,              // px
    tint: 0.18,            // 0..0.8 tint layer opacity
    saturation: 170,       // %
    brightness: 105,       // %
    radius: 26,            // px, panel corner radius
    specular: 0.7,         // 0..1 edge highlight strength
    refraction: true,      // lens rim
    shadow: 0.35           // 0..1
  },
  dock: {
    enabled: true,
    iconSize: 52,
    magnify: true,
    magnifyScale: 1.55,
    autoHide: false,
    hideOnFullscreen: true,
    showRunning: true,
    showLabels: true,
    margin: 10,
    items: DEFAULT_DOCK_ITEMS
  },
  icons: {
    style: 'tile',         // tile: app icons sit on a glass squircle | plain: original icon as-is
    palette: 'color',      // color | clear (glass) | tinted (accent colour) - for the built-in pack
    shape: 24,             // % corner radius of icon tiles
    gloss: true
  },
  widgets: {
    enabled: true,
    alwaysOnTop: false,
    locked: false,
    scale: 1,
    items: {
      clock: { enabled: true, x: null, y: null, style: 'analog', seconds: true, hour24: true },
      calendar: { enabled: true, x: null, y: null, weekStart: 1 },
      weather: { enabled: true, x: null, y: null, city: 'İstanbul', unit: 'c' },
      system: { enabled: true, x: null, y: null },
      notes: { enabled: false, x: null, y: null, text: '' }
    }
  },
  windows: {
    taskbarAutoHide: false,
    taskbarAlign: 'center',   // center | left
    reserveDockSpace: false
  }
};

const PRESETS = {
  clear: { name: 'Berrak Cam', blur: 26, tint: 0.18, saturation: 170, brightness: 105, radius: 26, specular: 0.7, refraction: true, shadow: 0.35 },
  frosted: { name: 'Buzlu Cam', blur: 48, tint: 0.38, saturation: 140, brightness: 108, radius: 24, specular: 0.5, refraction: false, shadow: 0.3 },
  crystal: { name: 'Kristal', blur: 12, tint: 0.08, saturation: 190, brightness: 104, radius: 30, specular: 1, refraction: true, shadow: 0.4 },
  smoke: { name: 'Füme', blur: 34, tint: 0.5, saturation: 120, brightness: 92, radius: 22, specular: 0.45, refraction: true, shadow: 0.5 },
  vivid: { name: 'Canlı', blur: 30, tint: 0.14, saturation: 240, brightness: 110, radius: 28, specular: 0.8, refraction: true, shadow: 0.35 }
};

module.exports = { DEFAULTS, PRESETS, DEFAULT_DOCK_ITEMS };
