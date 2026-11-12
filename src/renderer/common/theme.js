'use strict';
// Shared by every window: loads settings/env, sets CSS variables and aligns the
// blurred wallpaper layers of each .glass element with the real desktop behind the window.
(function () {
  const root = document.documentElement;
  const PAD = 100; // must match .glass-bg inset
  const RIM_ZOOM = 1.07;
  const T = { settings: null, env: null, bounds: null, fixedChrome: false, onChange: null };

  const LAYERS = '<div class="glass-layers"><div class="glass-bg"></div><div class="glass-rim"></div><div class="glass-tint"></div><div class="glass-shine"></div></div>';

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = m ? parseInt(m[1], 16) : 0x0a84ff;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  T.isDark = () => {
    const m = T.settings.appearance.mode;
    return m === 'dark' || (m !== 'light' && !!T.env.dark);
  };

  // scale < 1 is used by the miniature preview in the settings window
  T.applyVars = (el, a, scale) => {
    const k = scale || 1;
    const s = el.style;
    s.setProperty('--blur', (a.blur * k).toFixed(2) + 'px');
    s.setProperty('--tint', a.tint);
    s.setProperty('--sat', a.saturation + '%');
    s.setProperty('--bright', a.brightness + '%');
    s.setProperty('--radius', (a.radius * k).toFixed(2) + 'px');
    s.setProperty('--spec', a.specular);
    s.setProperty('--shadow', a.shadow);
    el.classList.toggle('no-refraction', !a.refraction);
  };

  let wallStyle = null;
  let lastWall;
  function applyWallpaper() {
    const url = T.env.wallpaper;
    if (url === lastWall) return;
    lastWall = url;
    if (!wallStyle) {
      wallStyle = document.createElement('style');
      document.head.appendChild(wallStyle);
    }
    wallStyle.textContent = url
      ? `.glass-bg,.glass-rim,.wallpaper{background-image:url("${url}")}`
      : '.glass-rim{background-image:linear-gradient(135deg,#3a7bd5,#9d50bb 55%,#ff7e5f)}';
  }

  T.apply = () => {
    if (!T.settings || !T.env) return;
    const a = T.settings.appearance;
    root.dataset.mode = T.isDark() ? 'dark' : 'light';
    root.style.setProperty('--accent', a.accent);
    root.style.setProperty('--accent-rgb', hexToRgb(a.accent).join(', '));
    root.style.setProperty('--icon-shape', (T.settings.icons.shape ?? 24) + '%');
    if (!T.fixedChrome) T.applyVars(root, a);
    applyWallpaper();
    T.layout();
  };

  T.glassify = (el) => {
    if (!el.querySelector(':scope > .glass-layers')) el.insertAdjacentHTML('afterbegin', LAYERS);
    return el;
  };

  function place(el) {
    const layers = el.firstElementChild;
    if (!layers || !layers.classList.contains('glass-layers')) return;
    const bg = layers.children[0];
    const rim = layers.children[1];
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let ox, oy, sw, sh;
    const scope = el.closest('[data-glass-scope]');
    if (scope) {
      const s = scope.getBoundingClientRect();
      ox = r.left - s.left; oy = r.top - s.top; sw = s.width; sh = s.height;
    } else if (T.bounds) {
      const b = T.bounds;
      const z = b.zoom || 1;
      ox = (b.x - b.display.x) / z + r.left;
      oy = (b.y - b.display.y) / z + r.top;
      sw = b.display.width / z; sh = b.display.height / z;
    } else {
      ox = r.left; oy = r.top; sw = window.innerWidth; sh = window.innerHeight;
    }
    bg.style.backgroundSize = `${sw}px ${sh}px`;
    bg.style.backgroundPosition = `${PAD - ox}px ${PAD - oy}px`;
    rim.style.backgroundSize = `${sw * RIM_ZOOM}px ${sh * RIM_ZOOM}px`;
    rim.style.backgroundPosition =
      `${r.width / 2 - (ox + r.width / 2) * RIM_ZOOM}px ${r.height / 2 - (oy + r.height / 2) * RIM_ZOOM}px`;
  }

  T.layout = (only) => {
    if (only) return place(only);
    document.querySelectorAll('.glass').forEach((el) => { T.glassify(el); place(el); });
  };

  T.init = async (opts) => {
    Object.assign(T, opts || {});
    const api = window.sagg;
    [T.settings, T.env] = await Promise.all([api.invoke('settings:get'), api.invoke('env:get')]);
    api.on('settings:changed', (s) => { T.settings = s; T.apply(); if (T.onChange) T.onChange('settings'); });
    api.on('env:changed', (e) => { T.env = e; T.apply(); if (T.onChange) T.onChange('env'); });
    api.on('win:bounds', (b) => { T.bounds = b; T.layout(); });
    window.addEventListener('resize', () => T.layout());
    T.apply();
    api.invoke('win:info');
    return T;
  };

  window.Theme = T;
})();
