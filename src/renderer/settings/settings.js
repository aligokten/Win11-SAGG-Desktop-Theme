'use strict';
(async function () {
  const api = window.sagg;
  const $ = (id) => document.getElementById(id);
  const esc = Icons.esc;
  const page = $('page');
  const preview = $('preview');

  const T = await window.Theme.init({ fixedChrome: true, onChange: onExternalChange });
  const presets = await api.invoke('settings:presets');
  let wallpapers = [];
  api.invoke('wallpapers:list').then((w) => { wallpapers = w || []; if (current === 'appearance') renderPage(); });
  const isWin = T.env.platform === 'win32';

  const get = (key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), T.settings);

  /* ---------- writes (coalesced per frame so sliders stay smooth) ---------- */
  const pending = new Map();
  let flushQueued = false;
  function set(key, value) {
    // optimistic local update
    const keys = key.split('.');
    let o = T.settings;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
    pending.set(key, value);
    if (/^appearance\.(blur|tint|saturation|brightness|radius|specular|refraction|shadow)$/.test(key) && T.settings.appearance.preset !== 'custom') {
      T.settings.appearance.preset = 'custom';
      pending.set('appearance.preset', 'custom');
    }
    if (!flushQueued) {
      flushQueued = true;
      requestAnimationFrame(() => {
        flushQueued = false;
        for (const [k, v] of pending) api.invoke('settings:set', k, v);
        pending.clear();
      });
    }
    T.apply();
    renderPreview();
    syncControls();
  }

  /* ---------- control builders ---------- */
  const row = (label, desc, ctl, cls) => `<div class="row ${cls || ''}"><div class="row-text"><div class="row-label">${label}</div>${desc ? `<div class="row-desc">${desc}</div>` : ''}</div><div class="row-ctl">${ctl}</div></div>`;
  const toggle = (key) => `<label class="switch"><input type="checkbox" data-key="${key}"><i></i></label>`;
  const slider = (key, min, max, step, fmt) => `<input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" data-fmt="${fmt}"><output data-out="${key}"></output>`;
  const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button type="button" data-value="${esc(v)}">${l}</button>`).join('')}</div>`;
  const text = (key, ph) => `<input type="text" data-key="${key}" placeholder="${esc(ph || '')}" spellcheck="false">`;
  const section = (title, body, cardCls) => `<div class="section">${title ? `<div class="card-title">${title}</div>` : ''}<div class="card ${cardCls || ''}">${body}</div></div>`;
  const badge = (t) => `<span class="badge">${t}</span>`;
  const winOnly = isWin ? '' : 'disabled';

  const fmt = {
    px: (v) => Math.round(v) + ' px',
    pct: (v) => Math.round(v) + '%',
    pct01: (v) => Math.round(v * 100) + '%',
    x: (v) => Number(v).toFixed(2) + '×'
  };

  const ACCENTS = ['#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#8e8e93'];
  const svgI = (d) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    up: svgI('<path d="M4 10l4-4 4 4"/>'), down: svgI('<path d="M4 6l4 4 4-4"/>'),
    x: svgI('<path d="M4 4l8 8M12 4l-8 8"/>'), img: svgI('<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M2.5 11l3.5-3 2.5 2 2-1.6 3 2.6"/>')
  };

  /* ---------- pages ---------- */
  const PAGES = {
    overview: {
      name: 'Genel Bakış', icon: 'theme', sub: 'Temanızı tek bakışta yönetin', preview: true,
      render: () => presetsSection() +
        section('Hızlı Ayarlar',
          row('Dock', 'Ekranın altında macOS stili uygulama çubuğu', toggle('dock.enabled')) +
          row('Widget\'lar', 'Masaüstünde saat, takvim, hava durumu ve sistem kartları', toggle('widgets.enabled')) +
          row('Windows görev çubuğunu gizle', 'Dock\'u görev çubuğunun yerine kullanın', toggle('windows.taskbarAutoHide'), winOnly) +
          row('Görünüm modu', '', seg('appearance.mode', [['auto', 'Otomatik'], ['light', 'Açık'], ['dark', 'Koyu']])))
    },
    appearance: {
      name: 'Görünüm', icon: 'photos', sub: 'Liquid Glass efektini ince ayarlayın', preview: true,
      render: () => presetsSection() +
        section('Renk',
          row('Görünüm modu', 'Otomatik, Windows uygulama modunu izler', seg('appearance.mode', [['auto', 'Otomatik'], ['light', 'Açık'], ['dark', 'Koyu']])) +
          row('Vurgu rengi', '', `<div class="swatches">${ACCENTS.map((c) => `<button type="button" class="swatch" data-accent="${c}" style="background:${c};color:${c}" title="${c}"></button>`).join('')}<input type="color" data-key="appearance.accent" title="Özel renk"></div>`)) +
        section('Cam Efekti',
          row('Bulanıklık', 'Arka planın ne kadar buzlu görüneceği', slider('appearance.blur', 0, 50, 1, 'px')) +
          row('Cam tonu', 'Camın üzerindeki açık/koyu katmanın yoğunluğu', slider('appearance.tint', 0, 0.6, 0.01, 'pct01')) +
          row('Doygunluk', 'Camın arkasındaki renklerin canlılığı', slider('appearance.saturation', 100, 260, 5, 'pct')) +
          row('Parlaklık', '', slider('appearance.brightness', 70, 130, 1, 'pct')) +
          row('Köşe yuvarlaklığı', '', slider('appearance.radius', 6, 40, 1, 'px')) +
          row('Kenar parlaması', 'Cam kenarlarındaki ışık yansıması', slider('appearance.specular', 0, 1, 0.05, 'pct01')) +
          row('Kenar kırılması', 'Kenarlarda mercek etkisi (Liquid Glass)', toggle('appearance.refraction')) +
          row('Gölge', '', slider('appearance.shadow', 0, 1, 0.05, 'pct01'))) +
        (wallpapers.length ? section('Duvar Kâğıtları',
          `<div class="card-pad"><div class="walls">${wallpapers.map((w) => `<button type="button" class="wall" data-wall="${esc(w.id)}"><img src="${w.thumb}" alt="">${esc(w.name)}</button>`).join('')}</div>
           <div class="note" style="margin-top:10px">${isWin ? 'Bir görsele tıklayarak Windows masaüstü arka planı olarak uygulayın. Cam efekti mevcut duvar kâğıdınızı otomatik izler.' : 'Duvar kâğıdı uygulama yalnızca Windows\'ta çalışır.'}</div></div>`) : '')
    },
    dock: {
      name: 'Dock', icon: 'launchpad', sub: 'Uygulama çubuğu', preview: true,
      render: () => section('Dock',
          row('Dock\'u göster', '', toggle('dock.enabled')) +
          row('Simge boyutu', '', slider('dock.iconSize', 36, 72, 1, 'px')) +
          row('Büyütme efekti', 'Fare üzerindeyken simgeler büyür', toggle('dock.magnify')) +
          row('Büyütme oranı', '', slider('dock.magnifyScale', 1.1, 2, 0.05, 'x')) +
          row('Alt boşluk', 'Dock ile ekran kenarı arasındaki mesafe', slider('dock.margin', 0, 30, 1, 'px'))) +
        section('Davranış',
          row('Otomatik gizle', 'Fare ekranın alt kenarına gelince görünür', toggle('dock.autoHide')) +
          row('Tam ekranda gizle', 'Oyun ve tam ekran videolarda dock kaybolur', toggle('dock.hideOnFullscreen')) +
          row('Çalışan uygulama göstergesi', 'Açık uygulamaların altında nokta', toggle('dock.showRunning')) +
          row('Uygulama adlarını göster', 'Simgenin üzerine gelince etiket', toggle('dock.showLabels'))) +
        `<div class="section"><div class="card-title">Dock Öğeleri</div><div class="card" id="dock-card"><div class="dock-list" id="dock-list"></div>
          <div class="drop-hint"><span>.exe veya kısayol dosyalarını buraya sürükleyip bırakabilirsiniz</span>
          <div class="btn-row"><button type="button" class="btn" data-act="add-sep">Ayırıcı Ekle</button><button type="button" class="btn" data-act="reset-dock">Varsayılan</button><button type="button" class="btn primary" data-act="add-app">Uygulama Ekle…</button></div></div></div></div>`,
      after: renderDockList
    },
    icons: {
      name: 'Simgeler', icon: 'app', sub: 'macOS stili simge karoları', preview: true,
      render: () => section('Simge Stili',
          row('Uygulama simgeleri', 'Eklediğiniz uygulamaların simgeleri', seg('icons.style', [['tile', 'Cam Karo'], ['plain', 'Orijinal']])) +
          row('Renk paleti', 'Yerleşik simge paketinin görünümü', seg('icons.palette', [['color', 'Renkli'], ['clear', 'Şeffaf Cam'], ['tinted', 'Vurgu Rengi']])) +
          row('Köşe şekli', 'Kareden daireye', slider('icons.shape', 0, 50, 1, 'pct')) +
          row('Parlak yüzey', 'Simgelerin üst yarısında cam parlaması', toggle('icons.gloss'))) +
        section('Simge Paketi', '<div class="card-pad"><div class="gallery" id="gallery"></div></div>'),
      after: renderGallery
    },
    widgets: {
      name: 'Widget\'lar', icon: 'notes', sub: 'Masaüstü kartları', preview: true,
      render: () => section('Genel',
          row('Widget\'ları göster', '', toggle('widgets.enabled')) +
          row('Boyut', '', slider('widgets.scale', 0.8, 1.4, 0.05, 'x')) +
          row('Her zaman üstte', 'Kapalıyken widget\'lar pencerelerin arkasında kalır', toggle('widgets.alwaysOnTop')) +
          row('Konumları kilitle', 'Sürükleyerek taşımayı kapatır', toggle('widgets.locked')) +
          row('Yerleşim', 'Widget\'ları masaüstünde sürükleyerek taşıyabilirsiniz', '<div class="btn-row"><button type="button" class="btn" data-act="raise">Öne Getir</button><button type="button" class="btn" data-act="reset-pos">Konumları Sıfırla</button></div>')) +
        section('Saat',
          row('Göster', '', toggle('widgets.items.clock.enabled')) +
          row('Stil', '', seg('widgets.items.clock.style', [['analog', 'Analog'], ['digital', 'Dijital']])) +
          row('Saniye', '', toggle('widgets.items.clock.seconds')) +
          row('24 saat biçimi', 'Dijital saat için', toggle('widgets.items.clock.hour24'))) +
        section('Takvim',
          row('Göster', '', toggle('widgets.items.calendar.enabled')) +
          row('Haftanın ilk günü', '', seg('widgets.items.calendar.weekStart', [['1', 'Pazartesi'], ['0', 'Pazar']]))) +
        section('Hava Durumu',
          row('Göster', '', toggle('widgets.items.weather.enabled')) +
          row('Şehir', 'Veriler Open-Meteo\'dan alınır; yalnızca şehir adı gönderilir', text('widgets.items.weather.city', 'İstanbul')) +
          row('Birim', '', seg('widgets.items.weather.unit', [['c', '°C'], ['f', '°F']]))) +
        section('Sistem', row('Göster', 'İşlemci, bellek, disk ve pil', toggle('widgets.items.system.enabled'))) +
        section('Notlar', row('Göster', 'Masaüstünde yapışkan not', toggle('widgets.items.notes.enabled')))
    },
    windows: {
      name: 'Windows', icon: 'settings', sub: 'Sistem entegrasyonu ve yedekleme', preview: false,
      render: () => section('Görev Çubuğu',
          row('Görev çubuğunu otomatik gizle', 'Uygulamadan çıktığınızda eski haline döner', toggle('windows.taskbarAutoHide'), winOnly) +
          row('Görev çubuğu hizalaması', '', seg('windows.taskbarAlign', [['center', 'Orta'], ['left', 'Sol']]), winOnly) +
          row('Dock için alan ayır' + badge('Deneysel'), 'Ekranı kaplayan pencereler dock\'un üzerine binmez. Görev çubuğu gizliyken kullanın.', toggle('windows.reserveDockSpace'), winOnly)) +
        section('Başlangıç', row('Windows ile birlikte başlat', 'Oturum açıldığında tema sessizce yüklenir', toggle('general.autostart'), winOnly)) +
        section('Yedekleme',
          row('Ayarlar', 'Tüm tema ayarlarınızı dosyaya kaydedin veya geri yükleyin', '<div class="btn-row"><button type="button" class="btn" data-act="export">Dışa Aktar…</button><button type="button" class="btn" data-act="import">İçe Aktar…</button></div>') +
          row('Fabrika ayarları', 'Her şeyi ilk kurulumdaki haline döndürür', '<button type="button" class="btn danger" data-act="reset-all">Sıfırla</button>')) +
        (isWin ? '' : section('', '<div class="card-pad note">Bu ekran Windows dışı bir sistemde önizleme modunda çalışıyor; sistem entegrasyonu devre dışı.</div>'))
    },
    about: {
      name: 'Hakkında', icon: 'browser', sub: '', preview: false,
      render: () => section('', `<div class="card-pad"><div class="about-head"><div class="big-icon">${Icons.render('pack:theme', { gloss: true })}</div>
          <div><h2>SAGG Desktop Theme</h2><div class="note">Sürüm ${esc(T.env.version)} · Windows 11 için Liquid Glass masaüstü teması</div></div></div></div>`) +
        section('Kısayollar ve İpuçları', `<div class="card-pad note">
          <p style="margin-top:0"><span class="kbd">Ctrl</span> + <span class="kbd">Alt</span> + <span class="kbd">W</span> — Widget'ları öne getirir.</p>
          <p>Dock'ta bir simgeye <b>sağ tıklayarak</b> kaldırabilir veya dock ayarlarına ulaşabilirsiniz.</p>
          <p>Widget'ları <b>sürükleyerek</b> taşıyın; sağ tıklayarak gizleyin veya kilitleyin.</p>
          <p style="margin-bottom:0">Bu pencereyi kapattığınızda tema <b>sistem tepsisinde</b> çalışmaya devam eder. Tamamen kapatmak için tepsi simgesine sağ tıklayıp <b>Çıkış</b>'ı seçin.</p></div>`) +
        section('Nasıl Çalışır', `<div class="card-pad note">Cam efekti, masaüstü duvar kâğıdınızın bulanıklaştırılmış bir kopyasını her panelin arkasına ekrandaki konumuyla hizalayarak oluşturulur.
          Bu yüzden paneller duvar kâğıdını kırıyormuş gibi görünür; açık pencerelerin içeriği cama yansımaz. Sistem dosyalarında değişiklik yapılmaz ve tüm Windows ayarları uygulamadan çıkınca geri alınır.</div>`) +
        section('', row('Uygulamadan çık', 'Dock ve widget\'lar kapanır, görev çubuğu geri gelir', '<button type="button" class="btn danger" data-act="quit">Çıkış</button>'))
    }
  };

  function presetsSection() {
    const wall = T.env.wallpaper ? `background-image:url(${T.env.wallpaper})` : 'background-image:linear-gradient(135deg,#3a7bd5,#9d50bb 55%,#ff7e5f)';
    return section('Hazır Stiller', `<div class="card-pad"><div class="presets">${Object.entries(presets).map(([id, p]) => {
      const dark = T.isDark();
      const tintA = Math.min(0.9, p.tint * 1.5 + (dark ? 0.16 : 0.1));
      const glass = `backdrop-filter:blur(${p.blur / 5}px) saturate(${p.saturation}%) brightness(${p.brightness}%);background:rgba(${dark ? '24,25,32' : '255,255,255'},${tintA});border-radius:${p.radius / 2.4}px`;
      return `<button type="button" class="preset" data-preset="${id}"><div class="preset-art" style="${wall}"><i style="${glass}"></i></div>${esc(p.name)}</button>`;
    }).join('')}</div></div>`);
  }

  /* ---------- dock list ---------- */
  let dockListKey = '';
  function renderDockList(force) {
    const list = $('dock-list');
    if (!list) return;
    const items = T.settings.dock.items;
    const key = JSON.stringify([items, T.settings.icons]);
    if (!force && key === dockListKey && list.childElementCount) return;
    if (list.contains(document.activeElement) && !force) return; // do not steal focus while renaming
    dockListKey = key;
    list.innerHTML = items.map((it, i) => {
      const moves = `<button type="button" class="icon-btn" data-item-act="up" title="Yukarı taşı" ${i === 0 ? 'disabled' : ''}>${I.up}</button>
        <button type="button" class="icon-btn" data-item-act="down" title="Aşağı taşı" ${i === items.length - 1 ? 'disabled' : ''}>${I.down}</button>`;
      if (it.kind === 'separator') {
        return `<div class="dock-row" data-id="${esc(it.id)}"><div class="sep-line"></div><div class="sep-label">Ayırıcı</div>${moves}<span class="icon-btn" style="visibility:hidden"></span><button type="button" class="icon-btn" data-item-act="remove" title="Kaldır">${I.x}</button></div>`;
      }
      return `<div class="dock-row" data-id="${esc(it.id)}"><div class="ico">${Icons.render(it.icon, T.settings.icons)}</div>
        <input type="text" data-item-name value="${esc(it.name || '')}" aria-label="Öğe adı">${moves}
        <button type="button" class="icon-btn" data-item-act="icon" title="Simgeyi değiştir">${I.img}</button>
        <button type="button" class="icon-btn" data-item-act="remove" title="Kaldır">${I.x}</button></div>`;
    }).join('');
  }

  function renderGallery() {
    const gEl = $('gallery');
    if (gEl) gEl.innerHTML = Object.keys(Icons.PACK).map((k) => `<div title="${k}">${Icons.render('pack:' + k, T.settings.icons)}</div>`).join('');
  }

  /* ---------- live preview ---------- */
  const pvWidgets = new Map();
  let pvDock = null;
  function renderPreview() {
    if ($('preview-wrap').classList.contains('off')) return;
    const s = T.settings;
    const disp = (T.bounds && T.bounds.display) || { width: 1920, height: 1080 };
    preview.style.aspectRatio = `${disp.width} / ${disp.height}`;
    const k = preview.clientWidth / disp.width;
    if (!k) return;
    T.applyVars(preview, s.appearance, k);
    preview.style.setProperty('--icon-shape', (s.icons.shape ?? 24) + '%');

    // widgets, laid out like the default desktop arrangement
    const ws = s.widgets.scale || 1;
    const gap = 16 * ws * k;
    const colW = 330 * ws * k;
    const rowH = 180 * ws * k;
    const right = preview.clientWidth - 38 * k - colW;
    const top = 38 * k;
    const slots = {
      weather: [right, top], calendar: [right, top + rowH + gap], system: [right, top + (rowH + gap) * 2],
      clock: [right - gap - 180 * ws * k, top], notes: [right - gap - 250 * ws * k, top + rowH + gap]
    };
    for (const type of Object.keys(Widgets.factories)) {
      const want = s.widgets.enabled && s.widgets.items[type] && s.widgets.items[type].enabled;
      let entry = pvWidgets.get(type);
      if (!want) {
        if (entry) { entry.inst.destroy(); entry.el.remove(); pvWidgets.delete(type); }
        continue;
      }
      if (!entry) {
        const el = document.createElement('div');
        el.className = 'pv-widget glass';
        el.innerHTML = '<div class="content"></div>';
        preview.appendChild(el);
        T.glassify(el);
        const inst = Widgets.factories[type](el.querySelector('.content'), () => T.settings.widgets.items[type] || {}, api);
        entry = { el, inst };
        pvWidgets.set(type, entry);
      } else {
        entry.inst.refresh();
      }
      const [w, h] = Widgets.sizes[type];
      const c = entry.el.querySelector('.content');
      entry.el.style.cssText = `left:${slots[type][0]}px;top:${slots[type][1]}px;width:${w * ws * k}px;height:${h * ws * k}px`;
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      c.style.zoom = ws * k;
    }

    // dock
    if (!pvDock) {
      pvDock = document.createElement('div');
      pvDock.className = 'pv-dock glass';
      pvDock.innerHTML = '<div class="pv-items"></div>';
      preview.appendChild(pvDock);
      T.glassify(pvDock);
    }
    const d = s.dock;
    const size = d.iconSize * k;
    const pad = Math.round(d.iconSize * 0.16) * k;
    pvDock.classList.toggle('hidden-dock', !d.enabled);
    pvDock.style.bottom = d.margin * k + 'px';
    pvDock.style.padding = pad + 'px';
    pvDock.style.borderRadius = `min(var(--radius), ${(size + pad * 2) / 2}px)`;
    const itemsEl = pvDock.querySelector('.pv-items');
    itemsEl.style.gap = size * 0.12 + 'px';
    const key = JSON.stringify([d.items, s.icons, size]);
    if (itemsEl.dataset.key !== key) {
      itemsEl.dataset.key = key;
      itemsEl.innerHTML = d.items.map((it) => it.kind === 'separator'
        ? `<div class="pv-sep" style="height:${size * 0.82}px;margin:0 ${size * 0.06}px ${size * 0.09}px"></div>`
        : `<div class="pv-item" style="width:${size}px;height:${size}px">${Icons.render(it.icon, s.icons)}</div>`).join('');
    }
    T.layout();
  }

  /* ---------- sync controls with settings ---------- */
  function syncControls() {
    document.querySelectorAll('[data-key]').forEach((el) => {
      const v = get(el.dataset.key);
      if (el.classList.contains('seg')) {
        el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(v) === b.dataset.value));
      } else if (el.type === 'checkbox') {
        el.checked = !!v;
      } else if (el.type === 'range') {
        if (document.activeElement !== el) el.value = v;
        const p = ((Number(el.value) - el.min) / (el.max - el.min)) * 100;
        el.style.setProperty('--p', p + '%');
        const out = document.querySelector(`[data-out="${el.dataset.key}"]`);
        if (out) out.textContent = fmt[el.dataset.fmt](Number(el.value));
      } else if (document.activeElement !== el) {
        el.value = v ?? '';
      }
    });
    document.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.accent.toLowerCase() === String(T.settings.appearance.accent).toLowerCase()));
    document.querySelectorAll('.preset').forEach((b) => b.classList.toggle('on', b.dataset.preset === T.settings.appearance.preset));
    const magRow = document.querySelector('[data-key="dock.magnifyScale"]');
    if (magRow) magRow.closest('.row').classList.toggle('disabled', !T.settings.dock.magnify);
  }

  /* ---------- navigation ---------- */
  let current = 'overview';
  $('brand-icon').innerHTML = Icons.render('pack:theme', { gloss: true });
  $('nav').innerHTML = Object.entries(PAGES).map(([id, p]) => `<button type="button" class="nav-item" data-page="${id}"><span class="nav-icon">${Icons.render('pack:' + p.icon, { gloss: false })}</span>${p.name}</button>`).join('');
  $('side-foot').textContent = 'Sürüm ' + T.env.version;

  function renderPage() {
    const p = PAGES[current];
    $('title').textContent = p.name;
    $('subtitle').textContent = p.sub;
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === current));
    $('preview-wrap').classList.toggle('off', !p.preview);
    page.innerHTML = p.render();
    dockListKey = '';
    if (p.after) p.after(true);
    syncControls();
    renderPreview();
  }

  function navigate(id) {
    if (!PAGES[id]) return;
    current = id;
    renderPage();
    $('scroll').scrollTop = 0;
  }

  function onExternalChange(kind) {
    if (kind === 'env' && (current === 'overview' || current === 'appearance')) return renderPage();
    syncControls();
    renderPreview();
    renderDockList(false);
    renderGallery();
  }

  let toastTimer = null;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------- events ---------- */
  $('nav').addEventListener('click', (e) => { const b = e.target.closest('.nav-item'); if (b) navigate(b.dataset.page); });
  $('btn-close').addEventListener('click', () => api.invoke('win:close'));
  $('btn-min').addEventListener('click', () => api.invoke('win:minimize'));
  api.on('settings:navigate', navigate);
  api.on('win:bounds', () => renderPreview());
  window.addEventListener('resize', renderPreview);

  page.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.key && el.type === 'range') set(el.dataset.key, Number(el.value));
    else if (el.dataset.key && el.type === 'color') set(el.dataset.key, el.value);
  });

  page.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.key && el.type === 'checkbox') set(el.dataset.key, el.checked);
    else if (el.dataset.key && el.type === 'text') { const v = el.value.trim(); if (v) set(el.dataset.key, v); }
    else if (el.hasAttribute('data-item-name')) {
      const id = el.closest('.dock-row').dataset.id;
      set('dock.items', T.settings.dock.items.map((i) => (i.id === id ? { ...i, name: el.value.trim() || i.name } : i)));
    }
  });
  page.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.type === 'text') e.target.blur(); });

  page.addEventListener('click', async (e) => {
    const segBtn = e.target.closest('.seg button');
    if (segBtn) {
      const key = segBtn.parentElement.dataset.key;
      let v = segBtn.dataset.value;
      if (key.endsWith('weekStart')) v = Number(v);
      return set(key, v);
    }
    const sw = e.target.closest('.swatch');
    if (sw) return set('appearance.accent', sw.dataset.accent);
    const pre = e.target.closest('.preset');
    if (pre) { await api.invoke('settings:applyPreset', pre.dataset.preset); return; }
    const wall = e.target.closest('.wall');
    if (wall) {
      const ok = await api.invoke('wallpapers:apply', wall.dataset.wall);
      return toast(ok ? 'Duvar kâğıdı uygulandı' : 'Duvar kâğıdı yalnızca Windows\'ta uygulanabilir');
    }
    const itemBtn = e.target.closest('[data-item-act]');
    if (itemBtn) {
      const id = itemBtn.closest('.dock-row').dataset.id;
      const items = T.settings.dock.items.slice();
      const i = items.findIndex((x) => x.id === id);
      const act = itemBtn.dataset.itemAct;
      if (i < 0) return;
      if (act === 'icon') { await api.invoke('dock:pickIcon', id); return; }
      if (act === 'remove') items.splice(i, 1);
      if (act === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
      if (act === 'down' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
      set('dock.items', items);
      return renderDockList(true);
    }
    const actBtn = e.target.closest('[data-act]');
    if (!actBtn) return;
    switch (actBtn.dataset.act) {
      case 'add-app': { const n = await api.invoke('dock:pickApps'); if (n) toast(n + ' uygulama eklendi'); break; }
      case 'add-sep': set('dock.items', [...T.settings.dock.items, { id: 'sep-' + Date.now().toString(36), kind: 'separator' }]); renderDockList(true); break;
      case 'reset-dock': await api.invoke('settings:resetDock'); toast('Dock öğeleri varsayılana döndü'); break;
      case 'raise': api.invoke('widgets:raise'); break;
      case 'reset-pos': await api.invoke('widgets:resetPositions'); toast('Widget konumları sıfırlandı'); break;
      case 'export': if (await api.invoke('settings:export')) toast('Ayarlar dışa aktarıldı'); break;
      case 'import': toast((await api.invoke('settings:import')) ? 'Ayarlar içe aktarıldı' : 'İçe aktarma yapılmadı'); break;
      case 'reset-all':
        if (actBtn.dataset.armed) { await api.invoke('settings:reset'); toast('Tüm ayarlar sıfırlandı'); renderPage(); }
        else { actBtn.dataset.armed = '1'; actBtn.textContent = 'Emin misiniz? Tekrar tıklayın'; setTimeout(() => { if (actBtn.isConnected) { delete actBtn.dataset.armed; actBtn.textContent = 'Sıfırla'; } }, 4000); }
        break;
      case 'quit': api.invoke('app:quit'); break;
    }
  });

  // drag & drop apps onto the dock list
  page.addEventListener('dragover', (e) => { const c = e.target.closest('#dock-card'); if (c) { e.preventDefault(); c.classList.add('dragover'); } });
  page.addEventListener('dragleave', (e) => { const c = e.target.closest('#dock-card'); if (c && !c.contains(e.relatedTarget)) c.classList.remove('dragover'); });
  page.addEventListener('drop', async (e) => {
    const c = e.target.closest('#dock-card');
    if (!c) return;
    e.preventDefault();
    c.classList.remove('dragover');
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    const n = paths.length ? await api.invoke('dock:addPaths', paths) : 0;
    toast(n ? n + ' uygulama eklendi' : 'Eklenecek uygun dosya bulunamadı');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  const initial = new URLSearchParams(location.search).get('section');
  navigate(PAGES[initial] ? initial : 'overview');
})();
