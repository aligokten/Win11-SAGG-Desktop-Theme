'use strict';
// Built-in icon pack: original glyphs on gradient squircle tiles.
(function () {
  const g = (inner, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra || ''}>${inner}</svg>`;
  const sq = (x, y) => `<rect x="${x}" y="${y}" width="4.6" height="4.6" rx="1.3" fill="currentColor" stroke="none"/>`;

  const PACK = {
    launchpad: {
      bg: 'linear-gradient(160deg,#8f9bff,#5b5ff0 55%,#3b36c9)',
      glyph: g([3.2, 9.7, 16.2].map((y) => [3.2, 9.7, 16.2].map((x) => sq(x, y)).join('')).join(''))
    },
    files: {
      bg: 'linear-gradient(160deg,#7fd4ff,#2f9bff 55%,#0a6fe0)',
      glyph: g('<path d="M3 7.2A2.2 2.2 0 0 1 5.2 5h3.6c.6 0 1.2.25 1.6.7l1 1.1h7.4A2.2 2.2 0 0 1 21 9v8.3a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 17.3z" fill="currentColor" fill-opacity=".28"/><path d="M3 10.5h18"/>')
    },
    browser: {
      bg: 'linear-gradient(160deg,#6ff3d6,#19c3c9 50%,#0a84c7)',
      glyph: g('<circle cx="12" cy="12" r="8.6"/><path d="M15.6 8.4l-2.2 5-5 2.2 2.2-5z" fill="currentColor" fill-opacity=".35"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>')
    },
    mail: {
      bg: 'linear-gradient(160deg,#6cc8ff,#1f8bff 55%,#0a5fe0)',
      glyph: g('<rect x="3" y="5.5" width="18" height="13" rx="2.6" fill="currentColor" fill-opacity=".25"/><path d="M3.8 7.5l7 5.4a2 2 0 0 0 2.4 0l7-5.4"/>')
    },
    store: {
      bg: 'linear-gradient(160deg,#ff8fb0,#ff4d7a 55%,#e0245e)',
      glyph: g('<path d="M5 8.5h14l-1 10a2 2 0 0 1-2 1.8H8a2 2 0 0 1-2-1.8z" fill="currentColor" fill-opacity=".28"/><path d="M8.8 8.5V7.2a3.2 3.2 0 0 1 6.4 0v1.3"/>')
    },
    photos: {
      bg: 'linear-gradient(160deg,#ffd166,#ff8a4c 45%,#f0457a 80%,#b44ee0)',
      glyph: g('<rect x="3.2" y="4.8" width="17.6" height="14.4" rx="2.8"/><circle cx="8.6" cy="9.6" r="1.6" fill="currentColor" stroke="none"/><path d="M3.8 16.6l4.6-4 3.4 3 3-2.8 5.4 4.6" />')
    },
    calculator: {
      bg: 'linear-gradient(160deg,#6b6b73,#3a3a40 55%,#1f1f24)',
      glyph: g('<rect x="5.2" y="3.2" width="13.6" height="17.6" rx="2.8"/><rect x="7.8" y="5.8" width="8.4" height="3.4" rx="1" fill="#ff9f0a" stroke="none"/>' +
        [12, 15, 18].map((y) => [8.6, 12, 15.4].map((x) => `<circle cx="${x}" cy="${y - 0.2}" r=".95" fill="currentColor" stroke="none"/>`).join('')).join(''))
    },
    notes: {
      bg: 'linear-gradient(180deg,#ffd84d 0 26%,#fffdf2 26% 100%)',
      fg: '#8a6a00',
      glyph: g('<path d="M6 11h12M6 14.5h12M6 18h7"/>')
    },
    terminal: {
      bg: 'linear-gradient(160deg,#4a4d57,#22242b 55%,#0e0f13)',
      glyph: g('<path d="M6 8.5l4 3.5-4 3.5" stroke="#5dff9c"/><path d="M12.5 16h5.5"/>')
    },
    settings: {
      bg: 'linear-gradient(160deg,#c9ccd6,#8b8f9c 55%,#5b5f6b)',
      glyph: g('<circle cx="12" cy="12" r="6.4" stroke-width="3.4" stroke-dasharray="2.6 2.43" stroke-linecap="butt"/><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.9" fill="currentColor" fill-opacity=".35"/>')
    },
    theme: {
      bg: 'linear-gradient(160deg,#7df3ff,#6a8bff 45%,#b45cf5 85%)',
      glyph: g('<path d="M12 3.4c3.2 3.9 5.6 6.6 5.6 10a5.6 5.6 0 0 1-11.2 0c0-3.4 2.4-6.1 5.6-10z" fill="currentColor" fill-opacity=".3"/><path d="M9.4 14.2a2.8 2.8 0 0 0 2.4 2.6"/>')
    },
    trash: {
      bg: 'linear-gradient(160deg,#f1f3f8,#c4c8d4 55%,#9a9fae)',
      fg: '#4d5261',
      glyph: g('<path d="M4.5 7h15"/><path d="M9.5 7V5.4a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/><path d="M6.4 7l.9 11.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.6 7" fill="currentColor" fill-opacity=".2"/><path d="M10.2 10.5v6M13.8 10.5v6"/>')
    },
    app: {
      bg: 'linear-gradient(160deg,#a6b4ff,#6d7cf0 55%,#4a52c9)',
      glyph: g('<rect x="3.5" y="5" width="17" height="14" rx="2.8" fill="currentColor" fill-opacity=".22"/><path d="M3.5 9h17"/><circle cx="6.4" cy="7" r=".5" fill="currentColor"/><circle cx="8.4" cy="7" r=".5" fill="currentColor"/>')
    }
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ref: "pack:<name>" or an image data URL. opts: settings.icons
  function render(ref, opts) {
    const o = opts || {};
    const gloss = o.gloss !== false ? ' icon-gloss' : '';
    const palette = o.palette === 'clear' || o.palette === 'tinted' ? ' ' + o.palette : '';
    if (typeof ref === 'string' && ref.startsWith('pack:')) {
      const p = PACK[ref.slice(5)] || PACK.app;
      return `<span class="icon"><span class="icon-tile${gloss}${palette}" style="background:${p.bg};color:${p.fg || '#fff'}">${p.glyph}</span></span>`;
    }
    const src = /^data:image\//.test(ref || '') ? esc(ref) : '';
    if (!src) return render('pack:app', o);
    if (o.style === 'plain') return `<span class="icon"><img class="icon-plain" src="${src}" alt="" draggable="false"></span>`;
    return `<span class="icon"><span class="icon-tile clear${gloss}"><img src="${src}" alt="" draggable="false"></span></span>`;
  }

  window.Icons = { PACK, render, esc };
})();
