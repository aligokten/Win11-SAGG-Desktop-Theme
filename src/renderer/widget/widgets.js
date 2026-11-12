'use strict';
// Widget implementations. Each factory(el, getCfg, api) returns { refresh(), destroy() }.
// Used by the real widget windows and by the live preview in the settings window.
(function () {
  const TR = 'tr-TR';
  const pad2 = (n) => String(n).padStart(2, '0');
  const DOW_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

  /* ---------- clock ---------- */
  function clock(el, getCfg) {
    let timer = null;
    let built = '';

    function build(cfg) {
      el.className = 'content w-clock';
      if (cfg.style === 'digital') {
        el.innerHTML = '<div class="clock-digital"><div class="time"></div><div class="date"></div></div>';
        return;
      }
      let ticks = '';
      for (let i = 0; i < 60; i++) {
        const major = i % 5 === 0;
        const a = (i * 6 * Math.PI) / 180;
        const r1 = major ? 40.5 : 42.5;
        ticks += `<line class="clock-tick${major ? ' major' : ''}" x1="${50 + Math.sin(a) * r1}" y1="${50 - Math.cos(a) * r1}" x2="${50 + Math.sin(a) * 45}" y2="${50 - Math.cos(a) * 45}"/>`;
      }
      let nums = '';
      for (const n of [12, 3, 6, 9]) {
        const a = (n * 30 * Math.PI) / 180;
        nums += `<text class="clock-num" x="${50 + Math.sin(a) * 33}" y="${50 - Math.cos(a) * 33}">${n}</text>`;
      }
      el.innerHTML = `<svg viewBox="0 0 100 100"><circle class="clock-face" cx="50" cy="50" r="48"/>${ticks}${nums}
        <line class="hand h" x1="50" y1="50" x2="50" y2="26"/><line class="hand m" x1="50" y1="50" x2="50" y2="13"/>
        <line class="hand s" x1="50" y1="58" x2="50" y2="10"/><circle class="clock-cap" cx="50" cy="50" r="2.4"/></svg>`;
    }

    function refresh() {
      const cfg = getCfg();
      const key = cfg.style + '|' + cfg.seconds;
      if (key !== built) { built = key; build(cfg); }
      const now = new Date();
      const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
      if (cfg.style === 'digital') {
        const hh = cfg.hour24 ? pad2(h) : String(h % 12 || 12);
        const suffix = cfg.hour24 ? '' : `<small>${h < 12 ? 'ÖÖ' : 'ÖS'}</small>`;
        el.querySelector('.time').innerHTML = `${hh}:${pad2(m)}${cfg.seconds ? ':' + pad2(s) : ''}${suffix}`;
        el.querySelector('.time').style.fontSize = cfg.seconds ? '36px' : '46px';
        el.querySelector('.date').textContent = now.toLocaleDateString(TR, { weekday: 'long', day: 'numeric', month: 'long' });
        return;
      }
      const rot = (sel, deg) => el.querySelector(sel).setAttribute('transform', `rotate(${deg} 50 50)`);
      rot('.hand.h', (h % 12) * 30 + m * 0.5);
      rot('.hand.m', m * 6 + s * 0.1);
      rot('.hand.s', s * 6);
      el.querySelector('.hand.s').style.display = cfg.seconds ? '' : 'none';
    }

    timer = setInterval(refresh, 1000);
    refresh();
    return { refresh, destroy: () => clearInterval(timer) };
  }

  /* ---------- calendar ---------- */
  function calendar(el, getCfg) {
    let lastKey = '';
    function refresh() {
      const cfg = getCfg();
      const now = new Date();
      const key = now.toDateString() + '|' + cfg.weekStart;
      if (key === lastKey) return;
      lastKey = key;
      const ws = cfg.weekStart === 0 ? 0 : 1;
      const y = now.getFullYear(), mo = now.getMonth();
      const first = new Date(y, mo, 1);
      const offset = (first.getDay() - ws + 7) % 7;
      const dim = new Date(y, mo + 1, 0).getDate();
      const prevDim = new Date(y, mo, 0).getDate();
      const rows = Math.ceil((offset + dim) / 7);
      let cells = '';
      for (let i = 0; i < 7; i++) cells += `<div class="hd">${DOW_SHORT[(i + ws) % 7][0]}</div>`;
      for (let i = 0; i < rows * 7; i++) {
        const d = i - offset + 1;
        const dow = (i + ws) % 7;
        let cls = 'd', label = d;
        if (d < 1) { cls += ' out'; label = prevDim + d; }
        else if (d > dim) { cls += ' out'; label = d - dim; }
        else if (d === now.getDate()) cls += ' today';
        else if (dow === 0 || dow === 6) cls += ' we';
        cells += `<div class="${cls}">${label}</div>`;
      }
      el.className = 'content w-calendar';
      el.innerHTML = `<div class="cal-today"><div class="dow">${now.toLocaleDateString(TR, { weekday: 'long' })}</div>
        <div class="day">${now.getDate()}</div><div class="mon">${now.toLocaleDateString(TR, { month: 'long', year: 'numeric' })}</div></div>
        <div class="cal-grid">${cells}</div>`;
    }
    const timer = setInterval(refresh, 30000);
    refresh();
    return { refresh, destroy: () => clearInterval(timer) };
  }

  /* ---------- weather ---------- */
  const svg = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const CLOUD = '<path d="M7 18.5h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.5 11.3 3.6 3.6 0 0 0 7 18.5z" fill="currentColor" fill-opacity=".22"/>';
  const CLOUD_HI = '<path d="M7 15.5h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.5 8.3 3.6 3.6 0 0 0 7 15.5z" fill="currentColor" fill-opacity=".22"/>';
  const WX = {
    sun: svg('<circle cx="12" cy="12" r="4.2" fill="#ffd60a" stroke="#ffd60a"/><g stroke="#ffd60a"><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/></g>'),
    moon: svg('<path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7z" fill="currentColor" fill-opacity=".3"/>'),
    partly: svg('<circle cx="8" cy="8" r="3.2" fill="#ffd60a" stroke="#ffd60a"/><g stroke="#ffd60a"><path d="M8 2v1.3M2 8h1.3M3.8 3.8l.9.9M12.2 3.8l-.9.9"/></g>' + CLOUD),
    cloud: svg(CLOUD),
    fog: svg(CLOUD_HI + '<path d="M5 18.5h14M7.5 21h9"/>'),
    rain: svg(CLOUD_HI + '<g stroke="#64b5ff"><path d="M8.5 18l-.8 2.6M12.3 18l-.8 2.6M16.1 18l-.8 2.6"/></g>'),
    snow: svg(CLOUD_HI + '<g fill="currentColor" stroke="none"><circle cx="8.2" cy="19.2" r="1"/><circle cx="12" cy="20.6" r="1"/><circle cx="15.8" cy="19.2" r="1"/></g>'),
    storm: svg(CLOUD_HI + '<path d="M12.6 16.5l-2.2 3h3l-1.8 2.8" stroke="#ffd60a"/>')
  };
  function wxInfo(code, isDay) {
    if (code === 0) return { icon: isDay ? 'sun' : 'moon', text: 'Açık' };
    if (code <= 2) return { icon: isDay ? 'partly' : 'cloud', text: 'Parçalı Bulutlu' };
    if (code === 3) return { icon: 'cloud', text: 'Bulutlu' };
    if (code <= 48) return { icon: 'fog', text: 'Sisli' };
    if (code <= 57) return { icon: 'rain', text: 'Çisenti' };
    if (code <= 67) return { icon: 'rain', text: 'Yağmurlu' };
    if (code <= 77) return { icon: 'snow', text: 'Karlı' };
    if (code <= 82) return { icon: 'rain', text: 'Sağanak' };
    if (code <= 86) return { icon: 'snow', text: 'Kar Sağanağı' };
    return { icon: 'storm', text: 'Fırtına' };
  }

  function weather(el, getCfg, api) {
    let lastKey = '';
    let alive = true;
    let retry = null;
    function draw(data) {
      el.className = 'content w-weather';
      if (!data || data.error) {
        el.innerHTML = `<div class="wx-msg">${Icons.esc((data && data.error) || 'Hava durumu yükleniyor…')}</div>`;
        return;
      }
      const cur = wxInfo(data.code, data.isDay);
      const r = Math.round;
      el.innerHTML = `<div class="wx-top"><div><div class="wx-city">${Icons.esc(data.city)}</div><div class="wx-temp">${r(data.temp)}°</div></div>
        <div class="wx-right">${WX[cur.icon]}<div class="cond">${cur.text}</div><div>Y: ${r(data.days[0].max)}°  D: ${r(data.days[0].min)}°</div></div></div>
        <div class="wx-days">${data.days.slice(0, 5).map((d, i) => {
          const dt = new Date(d.date + 'T12:00:00');
          return `<div><div class="dn">${i === 0 ? 'Bugün' : DOW_SHORT[dt.getDay()]}</div>${WX[wxInfo(d.code, true).icon]}<div>${r(d.max)}°<span class="lo">${r(d.min)}°</span></div></div>`;
        }).join('')}</div>`;
    }
    async function load(force) {
      const cfg = getCfg();
      const key = cfg.city + '|' + cfg.unit;
      if (!force && key === lastKey) return;
      if (key !== lastKey) draw(null);
      lastKey = key;
      const data = await api.invoke('weather:get', cfg.city, cfg.unit);
      if (!alive || key !== lastKey) return;
      draw(data);
      clearTimeout(retry);
      if (!data || data.error) retry = setTimeout(() => load(true), 30000);
    }
    const timer = setInterval(() => load(true), 10 * 60 * 1000);
    load(true);
    return { refresh: () => load(false), destroy: () => { alive = false; clearInterval(timer); clearTimeout(retry); } };
  }

  /* ---------- system ---------- */
  function system(el, getCfg, api) {
    const C = 2 * Math.PI * 24;
    const gb = (b) => (b / 1073741824).toFixed(b > 107374182400 ? 0 : 1);
    const ring = (id, label, color) => `<div class="ring" data-id="${id}" style="--c:${color}"><svg viewBox="0 0 58 58">
      <circle class="track" cx="29" cy="29" r="24"/><circle class="val" cx="29" cy="29" r="24" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>
      <div class="pct">–</div><div class="lbl">${label}</div><div class="sub">&nbsp;</div></div>`;
    el.className = 'content w-system';
    el.innerHTML = `<div class="w-title">Sistem</div><div class="sys-rings">${ring('cpu', 'İşlemci', '#ff453a')}${ring('mem', 'Bellek', '#30d158')}${ring('disk', 'Disk', '#0a84ff')}${ring('bat', 'Pil', '#ffd60a')}</div>`;
    let battery = null;
    if (navigator.getBattery) navigator.getBattery().then((b) => { battery = b; }).catch(() => {});

    function set(id, frac, sub) {
      const n = el.querySelector(`[data-id="${id}"]`);
      if (!n) return;
      const ok = Number.isFinite(frac);
      n.querySelector('.val').setAttribute('stroke-dashoffset', ok ? C * (1 - Math.max(0, Math.min(1, frac))) : C);
      n.querySelector('.pct').textContent = ok ? Math.round(frac * 100) + '%' : '–';
      n.querySelector('.sub').innerHTML = sub || '&nbsp;';
    }
    let alive = true;
    async function refresh() {
      const st = await api.invoke('sys:stats');
      if (!alive || !st) return;
      set('cpu', st.cpu);
      set('mem', st.mem.used / st.mem.total, `${gb(st.mem.used)} / ${gb(st.mem.total)} GB`);
      if (st.disk) set('disk', st.disk.used / st.disk.total, `${gb(st.disk.total - st.disk.used)} GB boş`); else set('disk', NaN);
      if (battery) set('bat', battery.level, battery.charging ? 'Şarj oluyor' : 'Pilde'); else set('bat', NaN, 'Yok');
    }
    const timer = setInterval(refresh, 2000);
    refresh();
    return { refresh: () => {}, destroy: () => { alive = false; clearInterval(timer); } };
  }

  /* ---------- notes ---------- */
  function notes(el, getCfg, api) {
    el.className = 'content w-notes';
    el.innerHTML = '<div class="w-title">Notlar</div><textarea spellcheck="false" placeholder="Bir not yazın…"></textarea>';
    const ta = el.querySelector('textarea');
    ta.value = getCfg().text || '';
    let t = null;
    ta.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { t = null; api.invoke('settings:set', 'widgets.items.notes.text', ta.value); }, 500);
    });
    return {
      refresh: () => { if (document.activeElement !== ta && !t) ta.value = getCfg().text || ''; },
      destroy: () => clearTimeout(t)
    };
  }

  window.Widgets = {
    factories: { clock, calendar, weather, system, notes },
    names: { clock: 'Saat', calendar: 'Takvim', weather: 'Hava Durumu', system: 'Sistem', notes: 'Notlar' },
    sizes: { clock: [180, 180], calendar: [330, 180], weather: [330, 180], system: [330, 180], notes: [250, 250] }
  };
})();
