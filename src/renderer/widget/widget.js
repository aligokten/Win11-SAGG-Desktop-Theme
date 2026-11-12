'use strict';
(async function () {
  const api = window.sagg;
  const type = new URLSearchParams(location.search).get('type') || 'clock';
  const factory = window.Widgets.factories[type] || window.Widgets.factories.clock;
  const content = document.getElementById('content');
  let instance = null;

  const T = await window.Theme.init({
    onChange: () => {
      document.body.classList.toggle('locked', !!T.settings.widgets.locked);
      if (instance) instance.refresh();
    }
  });
  document.body.classList.toggle('locked', !!T.settings.widgets.locked);
  instance = factory(content, () => T.settings.widgets.items[type] || {}, api);

  // Only fires on non-draggable parts (and when locked); drag regions are handled by the main process.
  window.addEventListener('contextmenu', (e) => {
    if (e.target.closest('textarea')) return;
    e.preventDefault();
    api.invoke('widget:contextMenu');
  });
})();
