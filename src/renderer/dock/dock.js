'use strict';
(async function () {
  const api = window.sagg;
  const dock = document.getElementById('dock');
  const panel = document.getElementById('panel');
  const itemsEl = document.getElementById('items');

  let els = [];          // .dock-item elements
  let scales = [];       // current scale per item
  let targets = [];      // target scale per item
  let running = [];
  let animating = false;
  let inside = false;
  let ignoring = null;
  let hideTimer = null;
  let itemsKey = '';

  const T = await window.Theme.init({ onChange: () => render() });
  const cfg = () => T.settings.dock;

  function setIgnore(v) {
    if (ignoring === v) return;
    ignoring = v;
    api.send('dock:ignore', v);
  }

  function render() {
    const d = cfg();
    const pad = Math.round(d.iconSize * 0.16);
    dock.style.setProperty('--size', d.iconSize + 'px');
    dock.style.setProperty('--pad', pad + 'px');
    dock.style.setProperty('--margin', d.margin + 'px');
    document.body.classList.toggle('no-labels', !d.showLabels);

    const key = JSON.stringify([d.items, T.settings.icons]);
    if (key !== itemsKey) {
      itemsKey = key;
      itemsEl.innerHTML = d.items.map((it) => {
        if (it.kind === 'separator') return '<div class="dock-sep"></div>';
        return `<div class="dock-item" data-id="${Icons.esc(it.id)}">` +
          `<div class="dock-label">${Icons.esc(it.name || '')}</div>${Icons.render(it.icon, T.settings.icons)}<div class="dock-dot"></div></div>`;
      }).join('');
      els = [...itemsEl.querySelectorAll('.dock-item')];
      scales = els.map(() => 1);
      targets = els.map(() => 1);
    }
    markRunning();
    applyScales();
    updateHidden();
    T.layout(panel);
  }

  function markRunning() {
    const d = cfg();
    const set = new Set(running);
    for (const el of els) {
      const it = d.items.find((i) => i.id === el.dataset.id);
      el.classList.toggle('running', !!(d.showRunning && it && it.exe && set.has(it.exe)));
    }
  }

  function applyScales() {
    const size = cfg().iconSize;
    els.forEach((el, i) => {
      const px = (size * scales[i]).toFixed(2) + 'px';
      el.style.width = px;
      el.style.height = px;
    });
  }

  function tick() {
    let moving = false;
    for (let i = 0; i < scales.length; i++) {
      const diff = targets[i] - scales[i];
      if (Math.abs(diff) > 0.004) { scales[i] += diff * 0.34; moving = true; } else scales[i] = targets[i];
    }
    applyScales();
    T.layout(panel);
    if (moving) requestAnimationFrame(tick); else animating = false;
  }

  function kick() {
    if (!animating) { animating = true; requestAnimationFrame(tick); }
  }

  function magnify(x) {
    const d = cfg();
    const max = d.magnify ? d.magnifyScale : 1;
    const range = d.iconSize * 2.6;
    let hover = null;
    els.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (x === null) { targets[i] = 1; return; }
      const dist = Math.abs(x - (r.left + r.width / 2));
      targets[i] = dist < range ? 1 + (max - 1) * Math.pow(Math.cos((dist / range) * Math.PI / 2), 2) : 1;
      if (x >= r.left - 2 && x <= r.right + 2) hover = el;
    });
    els.forEach((el) => el.classList.toggle('hover', el === hover));
    kick();
  }

  function updateHidden() {
    const hidden = cfg().autoHide && !inside;
    if (hidden) {
      if (!hideTimer && !dock.classList.contains('hidden')) {
        hideTimer = setTimeout(() => { hideTimer = null; if (cfg().autoHide && !inside) dock.classList.add('hidden'); }, 700);
      }
    } else {
      clearTimeout(hideTimer);
      hideTimer = null;
      dock.classList.remove('hidden');
    }
  }

  // The window is wider/taller than the panel; only the panel zone should catch the mouse.
  function hitTest(x, y) {
    const d = cfg();
    const r = panel.getBoundingClientRect();
    if (dock.classList.contains('hidden')) {
      return y >= window.innerHeight - 3 && x >= r.left - 40 && x <= r.right + 40;
    }
    const grow = inside && d.magnify ? d.iconSize * (d.magnifyScale - 1) + 8 : 4;
    return x >= r.left - 8 && x <= r.right + 8 && y >= r.top - grow;
  }

  function onMove(e) {
    const now = hitTest(e.clientX, e.clientY);
    if (now !== inside) {
      inside = now;
      setIgnore(!inside);
      updateHidden();
      if (!inside) magnify(null);
    }
    if (inside) magnify(e.clientX);
  }

  window.addEventListener('mousemove', onMove);
  document.addEventListener('mouseleave', () => {
    inside = false;
    setIgnore(true);
    magnify(null);
    updateHidden();
  });

  itemsEl.addEventListener('click', (e) => {
    const el = e.target.closest('.dock-item');
    if (!el) return;
    el.classList.remove('bounce');
    void el.offsetWidth;
    el.classList.add('bounce');
    api.invoke('dock:launch', el.dataset.id);
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const el = e.target.closest('.dock-item');
    api.invoke('dock:contextMenu', el ? el.dataset.id : null);
  });

  api.on('dock:running', (list) => { running = list || []; markRunning(); });
  running = (await api.invoke('dock:running')) || [];

  setIgnore(true);
  render();
})();
