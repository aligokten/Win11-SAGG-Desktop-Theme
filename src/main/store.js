'use strict';
const fs = require('fs');
const path = require('path');
const { DEFAULTS } = require('./defaults');

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

// Deep-merge saved values over defaults so new keys appear after upgrades.
function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.data = clone(DEFAULTS);
    this.timer = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = merge(clone(DEFAULTS), raw);
    } catch {
      this.data = clone(DEFAULTS);
    }
    if (!Array.isArray(this.data.dock.items)) this.data.dock.items = clone(DEFAULTS.dock.items);
  }

  get() { return this.data; }

  // path like "dock.iconSize"
  set(keyPath, value) {
    const keys = String(keyPath).split('.');
    if (keys.some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return;
    let o = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!isObj(o[keys[i]])) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
    this.saveSoon();
  }

  replace(data) {
    this.data = merge(clone(DEFAULTS), data);
    this.saveSoon();
  }

  reset() {
    this.data = clone(DEFAULTS);
    this.data.general.firstRun = false;
    this.saveSoon();
  }

  saveSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), 300);
  }

  saveNow() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error('settings save failed', e);
    }
  }
}

module.exports = { Store, merge, clone };
