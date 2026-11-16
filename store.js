// Where worlds live.
//  - Run `python3 server.py` and each world is a JSON file in ./worlds (the real "database").
//  - Open the page any other way and worlds are saved in this browser (localStorage) instead.
// Either way, Export/Import in the editor moves them around as plain .json files.
(function () {
  const WW = window.WW = window.WW || {};
  const LS = 'willy-worlds', LEGACY = 'willy-levels';
  let mode = null;

  async function detect() {
    if (mode) return mode;
    try {
      const r = await fetch('api/worlds', { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) { await r.json(); return (mode = 'server'); }
    } catch (e) {}
    return (mode = 'browser');
  }
  const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } };
  const lsWrite = o => localStorage.setItem(LS, JSON.stringify(o));
  const ok = w => !WW.level.validateWorld(w);

  // One-time: levels saved by the earlier single-level version become a world called "My levels".
  function migrateBrowser() {
    try {
      if (localStorage.getItem('willy-legacy-migrated')) return;
      localStorage.setItem('willy-legacy-migrated', '1');
      const old = Object.values(JSON.parse(localStorage.getItem(LEGACY) || '{}')).filter(l => !WW.level.validateLevel(l));
      if (!old.length) return;
      const all = lsRead();
      if (!all['my-levels']) {
        all['my-levels'] = { id: 'my-levels', name: 'My levels', author: '', description: 'Levels saved before worlds existed.',
          levels: old.map(({ name, theme, rate, speed, map }) => ({ name, theme, rate, speed, map })), updated: Date.now() };
        lsWrite(all);
      }
    } catch (e) {}
  }

  // Worlds that ship with the site (static hosting): worlds/index.json lists them, worlds/<id>.json holds each.
  // They are read-only here; opening one in the editor and saving makes your own copy.
  const BUNDLED_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/;
  async function bundled() {
    try {
      const m = await (await fetch('worlds/index.json', { cache: 'no-cache' })).json();
      const ids = (Array.isArray(m.worlds) ? m.worlds : []).filter(i => typeof i === 'string' && BUNDLED_ID.test(i) && i !== 'index');
      const got = await Promise.all(ids.map(async id => {
        try {
          const r = await fetch('worlds/' + id + '.json', { cache: 'no-cache' }); if (!r.ok) return null;
          const w = await r.json(); if (!ok(w)) return null;
          return { ...w, id, author: w.author || '', description: w.description || '', bundled: true };
        } catch (e) { return null; }
      }));
      return got.filter(Boolean);
    } catch (e) { return []; }
  }

  async function list() {
    if (await detect() === 'server') {                      // running server.py: the worlds/ folder is the truth
      const r = await fetch('api/worlds', { cache: 'no-store' });
      return (await r.json()).filter(ok);
    }
    migrateBrowser();                                       // static hosting: bundled worlds + this browser's own
    const mine = Object.values(lsRead()).filter(ok).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    return (await bundled()).concat(mine);
  }
  async function save(world) {
    const err = WW.level.validateWorld(world);
    if (err) throw new Error(err);
    if (await detect() === 'server') {
      const r = await fetch('api/worlds/' + encodeURIComponent(world.id), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(world),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'save failed (' + r.status + ')');
      return r.json();
    }
    const all = lsRead(); all[world.id] = { ...world, updated: Date.now() }; lsWrite(all);
    return all[world.id];
  }
  async function remove(id) {
    if (await detect() === 'server') {
      const r = await fetch('api/worlds/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed (' + r.status + ')');
      return;
    }
    const all = lsRead(); delete all[id]; lsWrite(all);
  }
  const slug = name => (String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'world';
  async function uniqueId(name) {
    const have = new Set((await list()).map(w => w.id).concat(['index'])), base = slug(name);   // never clash with a bundled world
    let id = base, n = 2;
    while (have.has(id)) id = base + '-' + n++;
    return id;
  }

  WW.store = { mode: detect, list, save, remove, slug, uniqueId };
})();
