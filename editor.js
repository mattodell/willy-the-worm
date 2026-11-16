// World + level editor for Willy the Worm.
// A world is a named, ordered list of levels saved together as one file.
(() => {
'use strict';
const WW = window.WW, S = WW.sprites, L = WW.level, store = WW.store;
const { W, H } = L, CELL = S.CELL;
const $ = id => document.getElementById(id);
const THEME_NAMES = ['Garden shed', 'Tack room', 'Cellar', 'Attic', 'Cannon alley', 'Greenhouse', 'Sunset', 'Night'];
const MAX_LEVELS = 30;

// ---------------------------------------------------------------- tools
const TOOLS = [
  { ch: '=', label: 'Solid floor',   key: '1' },
  { ch: '-', label: 'Crumbling',     key: '2' },
  { ch: 'H', label: 'Ladder',        key: '3' },
  { ch: '^', label: 'Tack',          key: '4' },
  { ch: '*', label: 'Present',       key: '5' },
  { ch: 'S', label: 'Spring',        key: '6' },
  { ch: 'B', label: 'Bell (exit)',   key: '7' },
  { ch: 'W', label: 'Worm start',    key: '8' },
  { ch: '<', label: 'Cannon ◀',      key: '9' },
  { ch: '>', label: 'Cannon ▶',      key: '0' },
  { ch: ' ', label: 'Eraser',        key: 'x' },
];
let tool = TOOLS[0];

// ---------------------------------------------------------------- state
let world = null;        // { id, name, author, description, levels: [ {name, theme, rate, speed, map:[22 strings]} ] }
let cur = 0;             // which level is being edited
let map = [];            // working copy of that level (arrays of chars)
let meta = { name: '', theme: 0, rate: 3.2, speed: 4.5 };
let dirty = false, undo = [], showGrid = true, hover = null, painting = null, last = null;
let savedWorlds = [];

const rows = () => map.map(r => r.join(''));
const clone = o => JSON.parse(JSON.stringify(o));
const snapshot = () => JSON.stringify(map);
const levelOf = d => ({ name: d.name, theme: d.theme, rate: d.rate, speed: d.speed, map: d.map.slice() });

function commit() {                          // working level -> world
  if (!world) return;
  world.levels[cur] = { name: meta.name.trim() || 'Untitled room', theme: meta.theme, rate: meta.rate, speed: meta.speed, map: rows() };
}
function loadWorking() {                      // world.levels[cur] -> working level
  const l = world.levels[cur];
  meta = { name: l.name, theme: l.theme, rate: l.rate, speed: l.speed };
  map = l.map.map(r => r.split(''));
  undo = [];
  syncLevelControls(); renderChips(); render();
}
function openLevel(i) { commit(); cur = i; loadWorking(); }
function setWorld(w, index = 0) {
  world = clone(w); world.author = world.author || ''; world.description = world.description || '';
  cur = Math.max(0, Math.min(world.levels.length - 1, index));
  dirty = false; syncWorldControls(); loadWorking();
}
function worldObj() {                          // clean copy for saving / drafts / export
  commit();
  return { id: world.id || null, name: world.name.trim() || 'Untitled world', author: world.author.trim(), description: world.description.trim(),
           levels: world.levels.map(levelOf) };
}

// ---------------------------------------------------------------- canvas
const cv = $('grid'), ctx = cv.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 3);
cv.width = W * CELL * dpr; cv.height = H * CELL * dpr;
let bg = null, bgTheme = -1;
function ensureBg() {
  if (bgTheme === meta.theme) return;
  bg = document.createElement('canvas'); bg.width = W * CELL * dpr; bg.height = H * CELL * dpr;
  const b = bg.getContext('2d'); b.scale(dpr, dpr); S.paintBg(b, W * CELL, H * CELL, S.THEMES[meta.theme]); bgTheme = meta.theme;
}
function drawChar(ch, c, r, theme, ladderTop, giftIdx) {
  switch (ch) {
    case '=': S.solid(ctx, c, r, theme); break;
    case '-': S.crumble(ctx, c, r, theme, false, 1); break;
    case 'H': S.ladder(ctx, c, r, ladderTop); break;
    case '^': S.tack(ctx, c, r); break;
    case '*': S.gift(ctx, c, r, 0, giftIdx || 0); break;
    case 'S': S.spring(ctx, c, r, 0); break;
    case 'B': S.bell(ctx, c, r, 0, false); break;
    case 'W': S.worm(ctx, c, r, { face: 1, st: 'ground', anim: 0, moving: false, t: 0 }); break;
    case '<': S.cannon(ctx, c, r, -1, 0); break;
    case '>': S.cannon(ctx, c, r, 1, 0); break;
  }
}
function render() {
  if (!map.length) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ensureBg();
  ctx.drawImage(bg, 0, 0, W * CELL, H * CELL);
  const theme = S.THEMES[meta.theme];
  for (const pass of [['=', '-'], ['H'], ['<', '>', 'S', '^', '*', 'B', 'W']]) {
    let gi = 0;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const ch = map[r][c];
      if (!pass.includes(ch)) continue;
      drawChar(ch, c, r, theme, ch === 'H' && (r === 0 || map[r - 1][c] !== 'H'), ch === '*' ? gi++ : 0);
    }
  }
  if (showGrid) {
    ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let c = 1; c < W; c++) { ctx.moveTo(c * CELL + .5, 0); ctx.lineTo(c * CELL + .5, H * CELL); }
    for (let r = 1; r < H; r++) { ctx.moveTo(0, r * CELL + .5); ctx.lineTo(W * CELL, r * CELL + .5); }
    ctx.stroke();
  }
  if (hover) {
    const c = hover[0], r = tool.ch === ' ' ? hover[1] : placeRow(hover[0], hover[1], tool.ch);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    if (tool.ch !== ' ') { ctx.globalAlpha = 0.6; drawChar(tool.ch, c, r, theme, true, 0); ctx.globalAlpha = 1; }
    else { ctx.strokeStyle = '#ff8a8a'; ctx.lineWidth = 2; ctx.strokeRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4); }
  }
  updateNotes();
}

// ---------------------------------------------------------------- painting
// Items (tack, present, spring, bell, start, cannons) sit ON a floor. Clicking a floor tile with an
// item tool puts the item on the tile above it, instead of punching a hole in the floor.
const ITEMS = '^*SBW<>';
const isFloor = t => t === '=' || t === '-';
const placeRow = (c, r, ch) => (ITEMS.includes(ch) && r > 0 && map[r] && isFloor(map[r][c])) ? r - 1 : r;

function setCell(c, r, ch) {
  if (c < 0 || c >= W || r < 0 || r >= H) return;
  r = placeRow(c, r, ch);
  if (map[r][c] === ch) return;
  if (ch === 'W' || ch === 'B') for (const row of map) for (let i = 0; i < W; i++) if (row[i] === ch) row[i] = ' ';   // only one of each
  map[r][c] = ch; markDirty();
}
function line(c0, r0, c1, r1, ch) {                 // Bresenham, so fast drags leave no gaps
  const dc = Math.abs(c1 - c0), dr = -Math.abs(r1 - r0), sc = c0 < c1 ? 1 : -1, sr = r0 < r1 ? 1 : -1;
  let err = dc + dr, c = c0, r = r0;
  for (;;) {
    setCell(c, r, ch);
    if (c === c1 && r === r1) break;
    const e2 = 2 * err;
    if (e2 >= dr) { err += dr; c += sc; }
    if (e2 <= dc) { err += dc; r += sr; }
  }
}
const cellAt = e => {
  const rc = cv.getBoundingClientRect();
  return [Math.max(0, Math.min(W - 1, Math.floor((e.clientX - rc.left) / rc.width * W))),
          Math.max(0, Math.min(H - 1, Math.floor((e.clientY - rc.top) / rc.height * H)))];
};
function stroke(e) {
  const [c, r] = cellAt(e), ch = painting === 'erase' ? ' ' : tool.ch;
  if (last && ch !== 'W' && ch !== 'B') line(last[0], last[1], c, r, ch); else setCell(c, r, ch);
  last = [c, r]; render();
}
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); cv.setPointerCapture(e.pointerId);
  undo.push(snapshot()); if (undo.length > 100) undo.shift();
  painting = (e.button === 2 || e.shiftKey) ? 'erase' : 'paint'; last = null; stroke(e);
});
cv.addEventListener('pointermove', e => { hover = cellAt(e); if (painting) stroke(e); else render(); });
const endStroke = () => { painting = null; last = null; };
cv.addEventListener('pointerup', endStroke); cv.addEventListener('pointercancel', endStroke);
cv.addEventListener('pointerleave', () => { hover = null; if (!painting) render(); });
cv.addEventListener('contextmenu', e => e.preventDefault());

function doUndo() { const s = undo.pop(); if (!s) return; map = JSON.parse(s); markDirty(); render(); }
function markDirty() {
  dirty = true;
  clearTimeout(markDirty.t); markDirty.t = setTimeout(() => { saveDraft(); renderChips(); }, 300);
}
function saveDraft() {                                  // so Test play / reloading never loses work
  try { localStorage.setItem('willy-draft', JSON.stringify({ world: worldObj(), cur })); } catch (e) {}
}

// ---------------------------------------------------------------- UI
function buildTools() {
  const box = $('tools'); box.innerHTML = '<h2>Tools</h2>';
  TOOLS.forEach(t => {
    const b = document.createElement('button'); b.className = 'tool'; b.type = 'button'; b.title = t.label + ' (' + t.key + ')';
    const c = document.createElement('canvas'); c.width = c.height = 88;
    const x = c.getContext('2d');
    if (t.ch === ' ') {
      x.strokeStyle = '#ff8a8a'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.moveTo(24, 24); x.lineTo(64, 64); x.moveTo(64, 24); x.lineTo(24, 64); x.stroke();
    } else { x.scale(88 / CELL, 88 / CELL); drawIcon(x, t.ch); }
    b.append(c, Object.assign(document.createElement('span'), { textContent: t.label }), Object.assign(document.createElement('kbd'), { textContent: t.key.toUpperCase() }));
    b.onclick = () => pick(t); b.dataset.ch = t.ch; box.append(b);
  });
  pick(TOOLS[0]);
}
function drawIcon(x, ch) {
  const th = S.THEMES[0], y = ch === '=' || ch === '-' ? 0.35 : 0;
  switch (ch) {
    case '=': S.solid(x, 0, y, th); S.solid(x, 1, y, th); break;
    case '-': S.crumble(x, 0, y, th, false, 1); S.crumble(x, 1, y, th, false, 1); break;
    case 'H': S.ladder(x, 0, 0, false); break;
    case '^': S.tack(x, 0, 0); break;
    case '*': S.gift(x, 0, 0, 0, 1); break;
    case 'S': S.spring(x, 0, 0, 0); break;
    case 'B': S.bell(x, 0, 0, 0, false); break;
    case 'W': S.worm(x, 0, 0, { face: 1, st: 'ground', anim: 0, moving: false, t: 0 }); break;
    case '<': S.cannon(x, 0, 0, -1, 0); break;
    case '>': S.cannon(x, 0, 0, 1, 0); break;
  }
}
function pick(t) {
  tool = t;
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.ch === t.ch));
  render();
}

function syncLevelControls() {
  $('name').value = meta.name; $('theme').value = meta.theme;
  $('rate').value = meta.rate; $('speed').value = meta.speed;
  $('rateOut').textContent = (+meta.rate).toFixed(1) + ' s'; $('speedOut').textContent = (+meta.speed).toFixed(1);
}
const ownIndex = () => savedWorlds.findIndex(w => w.id === world.id && !w.bundled);   // which saved world is open (-1 = none)
function syncWorldControls() {
  $('wName').value = world.name; $('wAuthor').value = world.author; $('wDesc').value = world.description;
  $('bDelWorld').disabled = !world.id;
  if ($('worldSel').options.length) $('worldSel').value = world.id && ownIndex() >= 0 ? String(ownIndex()) : '';
}
function renderChips() {
  const box = $('chips'); box.innerHTML = '';
  world.levels.forEach((l, i) => {
    const lv = i === cur ? { name: meta.name || 'Untitled room', map: rows() } : l;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip' + (i === cur ? ' on' : '') + (L.problems(lv.map).errors.length ? ' bad' : '');
    b.textContent = (i + 1) + '. ' + lv.name; b.title = lv.name;
    b.onclick = () => openLevel(i); box.append(b);
  });
  $('bLeft').disabled = cur === 0; $('bRight').disabled = cur === world.levels.length - 1;
  $('bDelLevel').disabled = world.levels.length <= 1;
  $('bAdd').disabled = world.levels.length >= MAX_LEVELS;
}
function status(msg, kind) { const s = $('status'); s.textContent = msg; s.className = kind || ''; }
function updateNotes() {
  const p = L.problems(rows()), ul = $('notes'); ul.innerHTML = '';
  p.errors.forEach(t => ul.append(Object.assign(document.createElement('li'), { className: 'e', textContent: t })));
  p.warnings.forEach(t => ul.append(Object.assign(document.createElement('li'), { className: 'w', textContent: t })));
  $('bTest').disabled = p.errors.length > 0;
}

async function refreshWorlds() {
  try { savedWorlds = await store.list(); } catch (e) { savedWorlds = []; }
  const sel = $('worldSel'); sel.innerHTML = '';
  const add = (v, t) => sel.append(Object.assign(document.createElement('option'), { value: v, textContent: t }));
  add('', world && world.id ? '— choose a world —' : '(this world is not saved yet)');
  savedWorlds.forEach((w, i) => add(String(i), w.name + (w.author ? '  ·  ' + w.author : '') + '  (' + w.levels.length + ')' + (w.bundled ? '  [bundled]' : '')));
  sel.value = world && world.id && ownIndex() >= 0 ? String(ownIndex()) : '';
}
function fillBuiltins() {
  const sel = $('builtinSel'); sel.innerHTML = '<option value="">— choose —</option>';
  L.LEVELS.forEach((l, i) => sel.append(Object.assign(document.createElement('option'), { value: i, textContent: (i + 1) + '. ' + l.name })));
}
const okToLeave = () => !dirty || confirm('Discard your unsaved changes?');

// ---------------------------------------------------------------- level operations
function openSaved(w) {
  setWorld(w);
  if (w.bundled) {            // ships with the site, so it can't be overwritten from here: you get your own copy
    world.id = null; syncWorldControls(); refreshWorlds();
    status('“' + world.name + '” is a bundled world (read-only). Rename it if you like, then Save world to keep your own copy.');
  } else status('Opened “' + world.name + '”.');
  saveDraft();
}
function addLevel(l) {
  if (world.levels.length >= MAX_LEVELS) return status('A world can have at most ' + MAX_LEVELS + ' levels.', 'err');
  commit(); const nl = l || (() => { const b = L.blankLevel(); delete b.id; return b; })();
  world.levels.push(levelOf(nl)); cur = world.levels.length - 1; loadWorking(); markDirty();
  status('Added level ' + (cur + 1) + '.', 'ok');
}
function dupLevel() {
  if (world.levels.length >= MAX_LEVELS) return status('A world can have at most ' + MAX_LEVELS + ' levels.', 'err');
  commit(); const c = clone(world.levels[cur]); c.name = (c.name + ' (copy)').slice(0, 40);
  world.levels.splice(cur + 1, 0, c); cur++; loadWorking(); markDirty();
}
function delLevel() {
  if (world.levels.length <= 1) return status('A world needs at least one level.', 'err');
  if (!confirm('Delete level ' + (cur + 1) + ' “' + meta.name + '”?')) return;
  world.levels.splice(cur, 1); cur = Math.min(cur, world.levels.length - 1); loadWorking(); markDirty();
}
function moveLevel(d) {
  const j = cur + d; if (j < 0 || j >= world.levels.length) return;
  commit(); [world.levels[cur], world.levels[j]] = [world.levels[j], world.levels[cur]]; cur = j; renderChips(); markDirty();
}

// ---------------------------------------------------------------- saving
async function save(asCopy) {
  const w = worldObj();
  for (let i = 0; i < w.levels.length; i++) {                  // every level must be playable
    const err = L.problems(w.levels[i].map).errors[0];
    if (err) { openLevel(i); return status('Level ' + (i + 1) + ' “' + w.levels[i].name + '”: ' + err, 'err'); }
  }
  const bad = L.validateWorld(w); if (bad) return status('Cannot save: ' + bad, 'err');
  if (!w.id || asCopy) { if (asCopy) w.name = (w.name + ' (copy)').slice(0, 40); w.id = await store.uniqueId(w.name); }
  try {
    await store.save(w);
    world.id = w.id; world.name = w.name; dirty = false; saveDraft(); syncWorldControls();
    await refreshWorlds();
    status('Saved “' + w.name + '” (' + w.levels.length + ' level' + (w.levels.length === 1 ? '' : 's') + ') ' +
      ((await store.mode()) === 'server' ? '→ worlds/' + w.id + '.json' : 'in this browser'), 'ok');
  } catch (e) { status('Could not save: ' + e.message, 'err'); }
}
function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function testPlay() {
  if (L.problems(rows()).errors.length) return;
  saveDraft(); location.href = 'index.html?test=1';           // plays the level you are looking at
}

// ---------------------------------------------------------------- wiring
function wire() {
  $('theme').innerHTML = THEME_NAMES.map((n, i) => '<option value="' + i + '">' + n + '</option>').join('');
  fillBuiltins();
  $('wName').oninput = e => { world.name = e.target.value; markDirty(); };
  $('wAuthor').oninput = e => { world.author = e.target.value; markDirty(); };
  $('wDesc').oninput = e => { world.description = e.target.value; markDirty(); };
  $('name').oninput = e => { meta.name = e.target.value; markDirty(); };
  $('theme').onchange = e => { meta.theme = +e.target.value; markDirty(); render(); };
  $('rate').oninput = e => { meta.rate = +e.target.value; $('rateOut').textContent = meta.rate.toFixed(1) + ' s'; markDirty(); };
  $('speed').oninput = e => { meta.speed = +e.target.value; $('speedOut').textContent = meta.speed.toFixed(1); markDirty(); };

  $('worldSel').onchange = e => {
    const w = savedWorlds[+e.target.value]; if (!w) return;
    if (!okToLeave()) { syncWorldControls(); return; }
    openSaved(w);
  };
  $('bNewWorld').onclick = () => { if (okToLeave()) { setWorld(L.blankWorld()); refreshWorlds(); saveDraft(); status('New world. Name it, build some levels, then Save world.'); } };
  $('bSave').onclick = () => save(false);
  $('bCopy').onclick = () => save(true);
  $('bDelWorld').onclick = async () => {
    if (!world.id || !confirm('Delete the world “' + world.name + '” and all its levels permanently?')) return;
    try { const n = world.name; await store.remove(world.id); world.id = null; dirty = true; await refreshWorlds(); syncWorldControls(); status('Deleted “' + n + '” from storage. It is still open here as an unsaved world.', 'ok'); }
    catch (e) { status('Could not delete: ' + e.message, 'err'); }
  };
  $('bAdd').onclick = () => addLevel();
  $('bDup').onclick = dupLevel; $('bDelLevel').onclick = delLevel;
  $('bLeft').onclick = () => moveLevel(-1); $('bRight').onclick = () => moveLevel(1);
  $('builtinSel').onchange = e => { if (e.target.value !== '') { const b = L.builtinAsLevel(+e.target.value); delete b.id; addLevel(b); } e.target.value = ''; };
  $('bUndo').onclick = doUndo;
  $('bClear').onclick = () => { if (confirm('Clear this whole level?')) { undo.push(snapshot()); map = Array.from({ length: H }, () => Array(W).fill(' ')); markDirty(); render(); } };
  $('bTest').onclick = testPlay;
  $('bExport').onclick = () => { const w = worldObj(); delete w.id; download(store.slug(w.name) + '.json', JSON.stringify(w, null, 1) + '\n'); };
  $('bImport').onclick = () => $('file').click();
  $('file').onchange = async e => {
    let nWorlds = 0, nLevels = 0, lastId = null; const bad = [];
    for (const f of e.target.files) {
      try {
        const d = JSON.parse(await f.text());
        if (Array.isArray(d.levels)) {                                  // a whole world
          const err = L.validateWorld(d); if (err) { bad.push(f.name + ': ' + err); continue; }
          const w = { id: await store.uniqueId(d.name), name: d.name.trim(), author: (d.author || '').trim(), description: (d.description || '').trim(), levels: d.levels.map(levelOf) };
          await store.save(w); nWorlds++; lastId = w.id;
        } else {                                                        // a single level -> add to the current world
          const err = L.validateLevel(d) || L.problems(d.map).errors[0]; if (err) { bad.push(f.name + ': ' + err); continue; }
          addLevel(levelOf(d)); nLevels++;
        }
      } catch (er) { bad.push(f.name + ': ' + er.message); }
    }
    e.target.value = '';
    await refreshWorlds();
    if (lastId && okToLeave()) { setWorld(savedWorlds.find(w => w.id === lastId && !w.bundled)); await refreshWorlds(); saveDraft(); }
    const parts = [];
    if (nWorlds) parts.push(nWorlds + ' world' + (nWorlds === 1 ? '' : 's') + ' imported');
    if (nLevels) parts.push(nLevels + ' level' + (nLevels === 1 ? '' : 's') + ' added to this world (Save world to keep)');
    if (!parts.length) parts.push('Nothing imported');
    status(parts.join(' · ') + (bad.length ? '. Skipped — ' + bad.join('; ') : '.'), bad.length ? 'err' : 'ok');
  };
  window.addEventListener('keydown', e => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && !(e.ctrlKey || e.metaKey)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = TOOLS.find(t => t.key === e.key.toLowerCase());
    if (t) pick(t);
    else if (e.key.toLowerCase() === 'g') { showGrid = !showGrid; render(); }
    else if (e.key.toLowerCase() === 't') testPlay();
  });
  window.addEventListener('beforeunload', () => { if (dirty) saveDraft(); });
}

// ---------------------------------------------------------------- start up
const looseWorld = w => w && typeof w === 'object' && Array.isArray(w.levels) && w.levels.length >= 1 && w.levels.every(l => !L.validateLevel(l));
(async function init() {
  buildTools(); wire();
  const q = new URLSearchParams(location.search);
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem('willy-draft') || 'null'); } catch (e) {}
  if (draft && looseWorld(draft.world)) { setWorld(draft.world, draft.cur || 0); dirty = true; }
  else if (draft && !L.validateLevel(draft)) {                                  // draft from the single-level editor
    const w = L.blankWorld(); w.levels = [levelOf(draft)]; setWorld(w); dirty = true;
  } else setWorld(L.blankWorld());
  const mode = await store.mode();
  $('mode').className = mode;
  $('mode').innerHTML = mode === 'server' ? 'Saving to the <b>worlds/</b> folder' : 'Saving <b>in this browser</b><br>run <code>python3 server.py</code> to save as files';
  await refreshWorlds();
  if (q.get('world')) { const w = savedWorlds.find(x => x.id === q.get('world')); if (w) openSaved(w); }
  syncWorldControls();
  render();
  window.EDITOR = { get map() { return rows(); }, get meta() { return meta; }, get world() { commit(); return world; }, get cur() { return cur; }, pick, TOOLS, save, setCell };
})();
})();
