'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const INVOKE = new Set([
  'settings:get', 'settings:set', 'settings:presets', 'settings:applyPreset', 'settings:reset', 'settings:resetDock',
  'settings:export', 'settings:import',
  'env:get', 'win:info', 'win:minimize', 'win:close',
  'dock:launch', 'dock:running', 'dock:pickApps', 'dock:addPaths', 'dock:pickIcon', 'dock:contextMenu',
  'widget:contextMenu', 'widgets:resetPositions', 'widgets:raise',
  'sys:stats', 'weather:get', 'wallpapers:list', 'wallpapers:apply',
  'app:openSettings', 'app:quit'
]);
const SEND = new Set(['dock:ignore']);
const ON = new Set(['settings:changed', 'env:changed', 'win:bounds', 'dock:running', 'settings:navigate']);

contextBridge.exposeInMainWorld('sagg', {
  invoke: (channel, ...args) => {
    if (!INVOKE.has(channel)) return Promise.reject(new Error('blocked channel'));
    return ipcRenderer.invoke(channel, ...args);
  },
  send: (channel, ...args) => { if (SEND.has(channel)) ipcRenderer.send(channel, ...args); },
  on: (channel, fn) => {
    if (!ON.has(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } }
});
