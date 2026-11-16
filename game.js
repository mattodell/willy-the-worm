// Willy the Worm - a modern browser take on Alan Farmer's 1985 DOS platformer.
(() => {
'use strict';
const WW = window.WW, S = WW.sprites, { W, H, TIERS, LEVELS, build, fromMap, validateLevel } = WW.level;
const CELL = S.CELL, HUDH = 48, PW = W * CELL, PH = H * CELL + HUDH;
const DT = 1 / 120;
const GRAV = 60, JUMP = 15.5, SPEED = 7, CLIMB = 5, BOUNCE = 24.5, AIR = 5;
const FONT = '"Trebuchet MS","Segoe UI",system-ui,sans-serif';

// ---------------------------------------------------------------- canvas
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 3);
cv.width = PW * dpr; cv.height = PH * dpr;

let bgCanvas = null, theme = S.THEMES[0];
function setTheme(i) {
  theme = S.THEMES[i % S.THEMES.length];
  bgCanvas = document.createElement('canvas');
  bgCanvas.width = PW * dpr; bgCanvas.height = H * CELL * dpr;
  const b = bgCanvas.getContext('2d'); b.scale(dpr, dpr);
  S.paintBg(b, PW, H * CELL, theme);
}

// ---------------------------------------------------------------- sound (soft tones, no assets)
let ac = null, muted = false;
function tone(f, d = 0.1, type = 'triangle', vol = 0.07, slide = 0, delay = 0) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.02);
  } catch (e) {}
}
const sfx = {
  jump:  () => tone(330, 0.16, 'triangle', 0.07, 330),
  land:  () => tone(140, 0.06, 'sine', 0.06),
  boing: () => { tone(220, 0.35, 'sine', 0.09, 700); tone(440, 0.3, 'triangle', 0.04, 500, 0.02); },
  gift:  () => { tone(784, 0.08, 'triangle', 0.07); tone(1175, 0.14, 'triangle', 0.07, 0, 0.07); },
  hop:   () => tone(880, 0.07, 'triangle', 0.05),
  crack: () => { tone(180, 0.09, 'sawtooth', 0.04, -80); },
  boom:  () => tone(120, 0.12, 'sine', 0.05, -40),
  die:   () => { tone(520, 0.8, 'sawtooth', 0.06, -420); },
  win:   () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.08, 0, i * 0.1)),
};

// ---------------------------------------------------------------- state
const BUILTIN = LEVELS.map((_, i) => ({ builtin: i }));     // the campaign
let playlist = BUILTIN, worldName = '', testMode = false, menuItems = null, menuSel = 0, menuStart = 0;
let state = 'title', level = 0, lives = 3, score = 0, hi = 0, paused = false;
let grid, tacks, gifts, springs, bell, spawns, rate, ballSpeed, levelName = '';
let balls = [], pops = [], parts = [], crumbling = [], willy, tm = 0, stT = 0, anim = 0, shake = 0, clearBonus = 0, perfect = false;
const keys = { l: false, r: false, u: false, d: false };
let jumpQ = false;
try { hi = +localStorage.getItem('willy-hi') || 0; } catch (e) {}

const gAt = (c, r) => (r >= 0 && r < H && c >= 0 && c < W) ? grid[r][c] : ' ';
const floorTile = t => t === '=' || t === '-';
// Ground = either kind of floor, or the top cell of a ladder (so you can stand on it).
const landOn = (c, r) => { const t = gAt(c, r); return floorTile(t) || (t === 'H' && gAt(c, r - 1) !== 'H'); };
const bonus = () => Math.max(0, 1000 - Math.floor(tm * 10));
const pad = (n, w) => String(n).padStart(w, '0');

function newWilly(start) {
  return { x: start.c, y: start.r, vx: 0, vy: 0, st: 'ground', face: 1, cTop: 0, cBot: 0, anim: 0, step: null, moving: false };
}
function loadLevel() {
  const e = playlist[level], d = e.builtin != null ? build(e.builtin) : fromMap(e.def);
  grid = d.g; tacks = d.tacks; gifts = d.gifts; springs = d.springs; bell = d.bell; spawns = d.spawns;
  rate = d.rate; ballSpeed = d.speed; levelName = d.name;
  balls = []; pops = []; parts = []; crumbling = []; willy = newWilly(d.start); tm = 0; stT = 0; perfect = false;
  setTheme(d.theme);
}
function startGame(list = BUILTIN, idx = 0, wname = '') { playlist = list; worldName = wname; score = 0; lives = 3; level = idx; loadLevel(); state = 'intro'; stT = 0; }
function saveHi() { if (score > hi) { hi = score; try { localStorage.setItem('willy-hi', hi); } catch (e) {} } }
function addScore(n, x, y) { score += n; pops.push({ x, y, s: '+' + n, life: 1 }); }
function die() { if (state !== 'play') return; state = 'dying'; stT = 0; shake = 0.35; sfx.die(); burst(willy.x + 0.5, willy.y + 0.5, 18, ['#7ed957', '#d4f79a', '#fff'], 9, 0.9); }

// ---------------------------------------------------------------- particles
function burst(x, y, n, cols, spd, life, grav = 25) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = spd * (0.3 + Math.random() * 0.7);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.3, life, max: life, col: cols[i % cols.length], s: 0.07 + Math.random() * 0.08, g: grav });
  }
}
function dust(x, y, dir = 0) { for (let i = 0; i < 4; i++) parts.push({ x: x + 0.5 + (Math.random() - 0.5) * 0.4, y: y + 0.95, vx: (Math.random() - 0.5) * 2 + dir, vy: -Math.random() * 1.5, life: 0.35, max: 0.35, col: 'rgba(255,255,255,.7)', s: 0.09, g: 3 }); }

// ---------------------------------------------------------------- crumbling planks
function crumbleStart(s) {
  if (gAt(s.c, s.r) === '-' && !crumbling.some(k => k.c === s.c && k.r === s.r)) crumbling.push({ c: s.c, r: s.r, t: 0.28, max: 0.28 });
}
function updateCrumble(dt) {
  for (const k of crumbling) {
    k.t -= dt;
    if (k.t <= 0) {
      grid[k.r][k.c] = ' ';
      burst(k.c + 0.5, k.r + 0.2, 7, ['#e0c18a', '#a07d45', '#c9a468'], 5, 0.7, 40); sfx.crack();
    }
  }
  crumbling = crumbling.filter(k => k.t > 0);
}

// ---------------------------------------------------------------- willy
function updateWilly(dt) {
  const w = willy, dir = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
  if (dir) w.face = dir;
  w.moving = false;

  if (w.st === 'climb') {
    const dy = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    w.y += dy * CLIMB * dt; w.anim += Math.abs(dy) * dt * 0.8;
    if (w.y <= w.cTop) { w.y = w.cTop; if (dy < 0) w.st = 'ground'; }
    if (w.y >= w.cBot) { w.y = w.cBot; if (dy > 0) w.st = 'ground'; }
    if (w.st === 'climb' && dir) {                    // step off the ladder to either side
      if (w.y <= w.cTop + 0.3) { w.y = w.cTop; w.st = 'ground'; }                     // near the top: onto the platform
      else if (w.y >= w.cBot - 0.3) { w.y = w.cBot; w.st = 'ground'; }                // near the bottom: onto the floor
      else { w.st = 'air'; w.vx = dir * SPEED * 0.7; w.vy = 0; w.noGrab = 0.25; return; }   // mid-ladder: drop to the nearest ground
    }
    if (w.st !== 'climb') { w.y = Math.round(w.y); w.vx = 0; w.vy = 0; }
    return;
  }
  if (w.noGrab > 0) w.noGrab -= dt;                   // brief lockout so you don't instantly re-grab the ladder you just left

  // grab a ladder
  const c = Math.round(w.x);
  if ((keys.u || keys.d) && Math.abs(w.x - c) <= 0.45 && !(w.noGrab > 0)) {
    let rr = -1;
    if (keys.u && gAt(c, Math.floor(w.y + 0.5)) === 'H') rr = Math.floor(w.y + 0.5);
    else if (keys.d && w.st === 'ground' && gAt(c, Math.round(w.y) + 1) === 'H') rr = Math.round(w.y) + 1;
    if (rr >= 0) {
      let top = rr, bot = rr;
      while (gAt(c, top - 1) === 'H') top--;
      while (gAt(c, bot + 1) === 'H') bot++;
      w.cTop = top - 1; w.cBot = bot;
      w.y = Math.max(w.cTop, Math.min(w.cBot, w.y));
      w.x = c; w.vx = 0; w.vy = 0; w.st = 'climb';
      return;
    }
  }

  if (w.st === 'ground') {
    w.vx = dir * SPEED;
    if (jumpQ) { w.vy = -JUMP; w.st = 'air'; sfx.jump(); dust(w.x, w.y, -w.vx * 0.2); }
  } else {
    w.vx += (dir * SPEED - w.vx) * Math.min(1, AIR * dt);       // a little air control
  }
  if (w.vx) {
    const nx = Math.max(0, Math.min(W - 1, w.x + w.vx * dt));
    if (w.st === 'ground') { w.anim += Math.abs(nx - w.x); w.moving = Math.abs(w.vx) > 0.1; }
    w.x = nx;
  }
  if (w.st === 'ground') {
    const r = Math.round(w.y) + 1;
    if (!landOn(Math.floor(w.x + 0.2), r) && !landOn(Math.floor(w.x + 0.8), r)) { w.st = 'air'; w.vy = 0; }
  }
  if (w.st === 'air') {
    w.vy += GRAV * dt;
    const prev = w.y + 1;
    w.y += w.vy * dt;
    if (w.vy > 0) {
      const r = Math.floor(w.y + 1);
      if (prev <= r + 0.001 && (landOn(Math.floor(w.x + 0.2), r) || landOn(Math.floor(w.x + 0.8), r))) {
        if (w.vy > 9) { dust(w.x, r - 1); sfx.land(); }
        w.y = r - 1; w.vy = 0; w.st = 'ground';
      }
    }
    if (w.y > H + 1) die();
  }

  // springs
  for (const s of springs) {
    if (Math.abs(w.x - s.c) < 0.6 && w.y + 1 >= s.r + 0.55 && w.y + 1 <= s.r + 1.3 && w.vy >= 0) {
      w.vy = -BOUNCE; w.st = 'air'; s.t = 0.4; sfx.boing();
      burst(s.c + 0.5, s.r + 0.9, 6, ['#fff', '#ffd166'], 4, 0.4, 5);
    }
  }

  // single-line planks crumble once you step off them
  if (w.st === 'ground') {
    const cc = Math.floor(w.x + 0.5), r = Math.round(w.y) + 1;
    if (gAt(cc, r) === '-') { if (w.step && w.step.c !== cc) crumbleStart(w.step); w.step = { c: cc, r }; }
    else if (w.step) { crumbleStart(w.step); w.step = null; }
  } else if (w.step) { crumbleStart(w.step); w.step = null; }
}

// ---------------------------------------------------------------- cannonballs
function updateSpawns(dt) {
  for (const s of spawns) {
    s.kick = Math.max(0, s.kick - dt * 6);
    s.timer -= dt;
    if (s.timer <= 0) {
      s.timer = rate * (0.8 + Math.random() * 0.4); s.kick = 1; sfx.boom();
      balls.push({ x: s.c, y: s.r, dir: s.dir, st: 'roll', vy: 0, hv: 0, dec: {}, skip: -1, jumped: false, rot: 0 });
      burst(s.c + 0.5 + s.dir * 0.6, s.r + 0.5, 5, ['#fff', '#cfd4dc'], 3, 0.4, 0);
    }
  }
}
function updateBalls(dt) {
  for (const b of balls) {
    if (b.st === 'roll') {
      b.x += b.dir * ballSpeed * dt; b.rot += b.dir * ballSpeed * dt / 0.4;
      const c = Math.floor(b.x + 0.5), r = Math.round(b.y) + 1, t = gAt(c, r);
      if (t === 'H') {                                    // sometimes roll down a ladder
        const key = c + ',' + r;
        if (!(key in b.dec)) b.dec[key] = Math.random() < 0.4;
        if (b.dec[key]) { b.x = c; b.st = 'fall'; b.vy = 0; b.hv = 0; b.skip = r; }
      } else if (!floorTile(t)) {                         // rolled off an edge, a hole, or a crumbled plank
        b.st = 'fall'; b.vy = 0; b.hv = b.dir * ballSpeed * 0.5; b.skip = -1;
      }
    } else {
      b.vy += GRAV * 0.7 * dt; b.rot += b.dir * dt * 4;
      const prev = b.y + 1;
      b.y += b.vy * dt; b.x += b.hv * dt;
      const r = Math.floor(b.y + 1), c = Math.floor(b.x + 0.5);
      if (r > b.skip) b.skip = -1;
      if (r !== b.skip && prev <= r + 0.001 && landOn(c, r)) { b.y = r - 1; b.st = 'roll'; b.dir = -b.dir; b.vy = 0; b.hv = 0; if (state === 'play') dust(b.x, b.y); }
    }
  }
  balls = balls.filter(b => b.x > -1.5 && b.x < W + 0.5 && b.y < H + 1);
}

// ---------------------------------------------------------------- collisions
const hit = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
function checks() {
  const w = willy;
  for (const b of balls) {
    if (hit(w.x + 0.25, w.y + 0.25, 0.5, 0.7, b.x + 0.2, b.y + 0.25, 0.6, 0.7)) return die();
    if (w.st === 'air' && b.st === 'roll' && !b.jumped && Math.abs(b.x - w.x) < 0.6 && w.y + 1 <= b.y + 0.45 && b.y - w.y < 2.6) {
      b.jumped = true; addScore(20, b.x, b.y - 0.6); sfx.hop();
    }
  }
  for (const t of tacks) if (hit(w.x + 0.25, w.y + 0.25, 0.5, 0.7, t.c + 0.25, t.r + 0.45, 0.5, 0.55)) return die();
  gifts.forEach((g, i) => {
    if (!g.got && Math.abs(w.x - g.c) < 0.7 && Math.abs(w.y - g.r) < 0.8) {
      g.got = true; addScore(100, g.c, g.r - 0.4); sfx.gift();
      burst(g.c + 0.5, g.r + 0.5, 14, ['#ffd166', '#ff5d73', '#4dabf7', '#69db7c', '#f783ac'], 7, 0.8);
    }
  });
  if (Math.abs(w.x - bell.c) < 0.8 && Math.abs(w.y - bell.r) < 0.9) {
    perfect = gifts.every(g => g.got);
    clearBonus = bonus() + (perfect ? 300 : 0);
    score += clearBonus; state = 'clear'; stT = 0; sfx.win(); saveHi();
    burst(bell.c + 0.5, bell.r + 0.5, 40, ['#ffd166', '#ff5d73', '#4dabf7', '#69db7c', '#f783ac', '#fff'], 12, 1.4);
  }
}

// ---------------------------------------------------------------- update loop
function update(dt) {
  if (paused) { jumpQ = false; return; }
  anim += dt; shake = Math.max(0, shake - dt);
  for (const s of springs) s.t = Math.max(0, s.t - dt);
  if (state === 'intro') {
    stT += dt; willy.anim += 0;
    if (stT > 1.5) { state = 'play'; stT = 0; }
  } else if (state === 'play') {
    tm += dt;
    updateWilly(dt);
    if (state === 'play') { updateCrumble(dt); updateSpawns(dt); updateBalls(dt); checks(); }
  } else if (state === 'dying') {
    stT += dt;
    if (stT > 1.5) {
      lives--;
      if (lives <= 0) { state = 'over'; saveHi(); } else { loadLevel(); state = 'intro'; stT = 0; }
    }
  } else if (state === 'clear') {
    stT += dt;
    if (stT > 3) {
      level++;
      if (level >= playlist.length) { state = 'win'; saveHi(); } else { loadLevel(); state = 'intro'; stT = 0; }
    }
  }
  for (const p of parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter(p => p.life > 0);
  for (const p of pops) p.life -= dt;
  pops = pops.filter(p => p.life > 0);
  jumpQ = false;
}

// ---------------------------------------------------------------- drawing helpers
function txt(s, x, y, o = {}) {
  ctx.font = `${o.weight || 800} ${o.size || 16}px ${FONT}`;
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle';
  if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.lw || 6; ctx.strokeStyle = o.stroke; ctx.strokeText(s, x, y); }
  ctx.fillStyle = o.color || '#fff'; ctx.fillText(s, x, y);
}
function panel(w, h, y) {
  const x = (PW - w) / 2;
  S.rrect(ctx, x, y, w, h, 18); ctx.fillStyle = 'rgba(24,20,48,.88)'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke();
}
const GRAD = (y0, y1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#d9ff8f'); g.addColorStop(1, '#5fcf3e'); return g; };

function drawWorld() {
  ctx.drawImage(bgCanvas, 0, 0, PW, H * CELL);
  const px = c => c * CELL;
  // floors
  const cr = new Map(); crumbling.forEach(k => cr.set(k.r * 100 + k.c, k));
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = grid[r][c];
    if (ch === '=') S.solid(ctx, c, r, theme);
    else if (ch === '-') { const k = cr.get(r * 100 + c); S.crumble(ctx, c, r, theme, !!k, k ? Math.max(0.35, k.t / k.max) : 1); }
  }
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (grid[r][c] === 'H') S.ladder(ctx, c, r, gAt(c, r - 1) !== 'H');
  for (const s of spawns) S.cannon(ctx, s.c, s.r, s.dir, s.kick);
  for (const s of springs) S.spring(ctx, s.c, s.r, s.t > 0 ? Math.sin(Math.min(1, s.t / 0.4) * Math.PI) : 0);
  for (const t of tacks) S.tack(ctx, t.c, t.r);
  gifts.forEach((g, i) => { if (!g.got) S.gift(ctx, g.c, g.r, anim, i); });
  S.bell(ctx, bell.c, bell.r, anim, state === 'clear');
  for (const b of balls) S.ball(ctx, b.x, b.y, b.rot);

  const w = willy;
  const o = { face: w.face, st: w.st, anim: w.anim, moving: w.moving, vy: w.vy, t: anim, dead: state === 'dying' };
  if (state === 'dying') {
    ctx.save(); const cx = (w.x + 0.5) * CELL, cy = (w.y + 0.5) * CELL - Math.sin(Math.min(stT / 0.7, 1) * Math.PI) * CELL * 1.6;
    ctx.translate(cx, cy); ctx.rotate(stT * 9); ctx.translate(-cx, -cy);
    S.worm(ctx, w.x, w.y - Math.sin(Math.min(stT / 0.7, 1) * Math.PI) * 1.6, { ...o, st: 'air', vy: 0 });
    ctx.restore();
  } else {
    S.worm(ctx, w.x, w.y, o);
  }

  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5)); ctx.fillStyle = p.col;
    ctx.fillRect((p.x - p.s / 2) * CELL, (p.y - p.s / 2) * CELL, p.s * CELL, p.s * CELL);
  }
  ctx.globalAlpha = 1;
  for (const p of pops) txt(p.s, (p.x + 0.5) * CELL, (p.y - (1 - p.life) * 1.4) * CELL, { size: 15, color: '#fff', stroke: '#3b2a6b', lw: 4, align: 'center' });
}

function drawHUD() {
  const y0 = H * CELL, mid = y0 + HUDH / 2;
  ctx.fillStyle = '#1b1a2e'; ctx.fillRect(0, y0, PW, HUDH);
  ctx.fillStyle = '#35335c'; ctx.fillRect(0, y0, PW, 2);
  txt('SCORE', 18, y0 + 14, { size: 11, color: '#9b98c9' });   txt(pad(score, 6), 18, y0 + 33, { size: 20 });
  txt('BEST', 128, y0 + 14, { size: 11, color: '#9b98c9' });    txt(pad(Math.max(hi, score), 6), 128, y0 + 33, { size: 20, color: '#c7c4ee' });
  txt('PRESENTS', 250, y0 + 14, { size: 11, color: '#9b98c9' });
  gifts.forEach((g, i) => S.gift(ctx, (246 + i * 27) / CELL, (y0 + 20) / CELL - 0.5, 0, i, g.got ? 1 : 0.22));
  txt('BONUS', 410, y0 + 14, { size: 11, color: '#9b98c9' });   txt(pad(bonus(), 4), 470, y0 + 14, { size: 11, color: '#ffd166' });
  S.rrect(ctx, 410, y0 + 25, 150, 11, 5); ctx.fillStyle = '#34325a'; ctx.fill();
  const bw = Math.max(0, 150 * bonus() / 1000);
  if (bw > 2) { S.rrect(ctx, 410, y0 + 25, bw, 11, 5); const g = ctx.createLinearGradient(410, 0, 560, 0); g.addColorStop(0, '#ffd166'); g.addColorStop(1, '#ff8a3d'); ctx.fillStyle = g; ctx.fill(); }
  txt('LIVES', 600, y0 + 14, { size: 11, color: '#9b98c9' });
  const shown = Math.max(0, lives - ((state === 'play' || state === 'intro' || state === 'clear') ? 0 : 1));
  for (let i = 0; i < Math.min(5, shown); i++) S.wormIcon(ctx, (598 + i * 26) / CELL, (y0 + 18) / CELL);
  txt(testMode ? 'TEST PLAY' : 'ROOM ' + (level + 1) + ' / ' + playlist.length, PW - 18, y0 + 14, { size: 11, color: '#9b98c9', align: 'right' });
  txt(levelName, PW - 18, y0 + 32, { size: 17, align: 'right', color: '#fff' });
}

function drawTitle() {
  ctx.drawImage(bgCanvas, 0, 0, PW, H * CELL);
  ctx.fillStyle = '#1b1a2e'; ctx.fillRect(0, H * CELL, PW, HUDH);
  // demo strip: a worm hops a rolling ball, with a tack, a spring, a present and the bell
  const row = 10;
  for (let c = 0; c < W; c++) S.solid(ctx, c, row + 1, theme);
  const bx = W - ((anim * 7) % (W + 8)), d = bx - 18, lift = Math.abs(d) < 3.6 ? 1.9 * (1 - (d / 3.6) ** 2) : 0;
  S.tack(ctx, 9, row); S.tack(ctx, 10, row);
  S.spring(ctx, 27, row, 0); S.gift(ctx, 31, row, anim, 2); S.bell(ctx, 36, row, anim, false);
  S.ball(ctx, bx, row, anim * 5);
  S.worm(ctx, 18, row - lift, { face: 1, st: lift > 0 ? 'air' : 'ground', vy: d < 0 ? -8 : 8, anim: anim * 1.5, moving: false, t: anim });
  // title
  txt('Willy', PW / 2, 88, { size: 104, align: 'center', stroke: '#2c6b28', lw: 16, color: GRAD(30, 130) });
  txt('the Worm', PW / 2, 168, { size: 62, align: 'center', stroke: '#2c6b28', lw: 12, color: GRAD(130, 200) });
  // how to play
  panel(760, 138, 322);
  const L = [
    'Arrow keys / WASD to run and climb ladders  ·  Space to jump',
    'Ring the bell to escape each room',
    'Dodge cannonballs and tacks  ·  Hop a ball for +20  ·  Grab presents',
    'Springs bounce you up  ·  Thin planks crumble once you step off them!',
  ];
  L.forEach((s, i) => txt(s, PW / 2, 352 + i * 30, { size: 17, align: 'center', weight: 700, color: i === 1 ? '#ffd166' : '#fff' }));
  if (Math.floor(anim * 1.6) % 2 === 0) txt('Press SPACE or tap to start', PW / 2, 492, { size: 26, align: 'center', stroke: '#2c6b28', lw: 7 });
  txt('BEST ' + pad(hi, 6), 18, H * CELL + HUDH / 2, { size: 16, color: '#c7c4ee' });
  txt('L  Worlds      E  Level editor', 170, H * CELL + HUDH / 2, { size: 15, color: '#ffd166' });
  txt('Inspired by Willy the Worm (1985) by Alan Farmer', PW - 18, H * CELL + HUDH / 2, { size: 12, color: '#9b98c9', align: 'right', weight: 600 });
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, PW, PH);
  if (state === 'title') return drawTitle();
  if (state === 'menu') return drawMenu();
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 18, (Math.random() - 0.5) * shake * 18);
  drawWorld();
  ctx.restore();
  drawHUD();
  if (testMode && state !== 'title') {                       // always-visible way back to the editor
    S.rrect(ctx, PW / 2 - 95, 8, 190, 26, 13); ctx.fillStyle = 'rgba(24,20,48,.78)'; ctx.fill();
    txt('E  ·  back to the editor', PW / 2, 21, { size: 13, align: 'center', color: '#ffd166', weight: 700 });
  }
  if (state === 'intro') {
    panel(520, 110, 190);
    txt(testMode ? 'TEST PLAY' : (worldName ? worldName + '  ·  ' : '') + 'ROOM ' + (level + 1), PW / 2, 224, { size: 22, align: 'center', color: '#9b98c9' });
    txt(levelName, PW / 2, 268, { size: 44, align: 'center', stroke: '#2c6b28', lw: 8, color: GRAD(240, 290) });
  } else if (state === 'clear') {
    panel(520, 190, 150);
    txt('Room clear!', PW / 2, 196, { size: 46, align: 'center', stroke: '#2c6b28', lw: 8, color: GRAD(170, 220) });
    txt('Time bonus  +' + (clearBonus - (perfect ? 300 : 0)), PW / 2, 256, { size: 22, align: 'center' });
    txt(perfect ? 'All presents!  +300' : 'Presents ' + gifts.filter(g => g.got).length + ' / ' + gifts.length, PW / 2, 290, { size: 20, align: 'center', color: perfect ? '#ffd166' : '#9b98c9' });
  } else if (state === 'over') {
    panel(520, 220, 140);
    txt('Game over', PW / 2, 190, { size: 52, align: 'center', stroke: '#6b2a2a', lw: 9, color: '#ff8a8a' });
    txt('Score ' + pad(score, 6), PW / 2, 252, { size: 26, align: 'center' });
    if (score > 0 && score >= hi) txt('New best!', PW / 2, 286, { size: 20, align: 'center', color: '#ffd166' });
    if (Math.floor(anim * 1.6) % 2 === 0) txt('Press SPACE' + (testMode ? '  ·  E: back to editor' : ''), PW / 2, 322, { size: 20, align: 'center', color: '#ffd166' });
  } else if (state === 'win') {
    panel(560, 240, 130);
    txt(testMode ? 'Level complete!' : worldName ? 'World complete!' : 'You escaped!', PW / 2, 184, { size: 52, align: 'center', stroke: '#2c6b28', lw: 9, color: GRAD(150, 210) });
    txt(testMode ? levelName : (worldName ? worldName + '  ·  ' : '') + 'All ' + playlist.length + ' rooms cleared', PW / 2, 240, { size: 22, align: 'center' });
    txt('Final score ' + pad(score, 6), PW / 2, 278, { size: 28, align: 'center', color: '#ffd166' });
    if (Math.floor(anim * 1.6) % 2 === 0) txt('Press SPACE to play again' + (testMode ? '  ·  E: back to editor' : ''), PW / 2, 330, { size: 20, align: 'center' });
  }
  if (paused) { panel(300, 90, 220); txt('Paused', PW / 2, 265, { size: 36, align: 'center' }); }
}

// ---------------------------------------------------------------- input
const KEYMAP = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'd', s: 'd', S: 'd' };
function action() {
  if (state === 'title') { testMode = false; startGame(BUILTIN, 0, ''); }
  else if (state === 'over' || state === 'win') startGame(playlist, 0, worldName);       // same list again
  else if (state === 'play') jumpQ = true;
}

// ---- Worlds menu: the default campaign, then every installed world
function openMenu() {
  state = 'menu'; menuItems = null; menuSel = 0; menuStart = 0;
  WW.store.list().then(l => { menuItems = l; }).catch(() => { menuItems = []; });
}
function menuEntries() {
  if (!menuItems) return [];
  return [{ label: 'The original rooms', sub: 'the default world', desc: 'The classic 8-room campaign.', names: LEVELS.map(l => l.name), list: BUILTIN, name: '', def: true }]
    .concat(menuItems.map(w => ({ label: w.name, sub: w.author ? 'by ' + w.author : '', desc: w.description || '', names: w.levels.map(l => l.name),
      list: w.levels.map(def => ({ def })), name: w.name })));
}
function wrapLines(str, maxW, font) {
  ctx.font = font; const out = []; let line = '';
  for (const word of String(str).split(/\s+/)) {
    const t = line ? line + ' ' + word : word;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
function drawMenu() {
  ctx.drawImage(bgCanvas, 0, 0, PW, H * CELL);
  ctx.fillStyle = '#1b1a2e'; ctx.fillRect(0, H * CELL, PW, HUDH);
  txt('Worlds', PW / 2, 62, { size: 58, align: 'center', stroke: '#2c6b28', lw: 11, color: GRAD(26, 100) });
  panel(860, 372, 112);
  const e = menuEntries();
  if (!menuItems) { txt('Loading…', PW / 2, 290, { size: 22, align: 'center', color: '#9b98c9' }); }
  else {
    const rows = 8, top = Math.max(0, Math.min(menuSel - 3, e.length - rows));
    e.slice(top, top + rows).forEach((it, k) => {
      const i = top + k, y = 148 + k * 44, sel = i === menuSel;
      if (sel) { S.rrect(ctx, 66, y - 20, 400, 40, 10); ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill(); }
      txt((sel ? '▶ ' : '   ') + it.label, 84, y - (it.sub ? 6 : 0), { size: 19, color: it.def ? '#ffd166' : '#fff', weight: sel ? 800 : 600 });
      if (it.sub) txt('    ' + it.sub, 84, y + 12, { size: 12, color: '#9b98c9', weight: 600 });
    });
    if (e.length > rows) txt((menuSel + 1) + ' / ' + e.length, 460, 478, { size: 12, color: '#9b98c9', align: 'right' });
    if (e.length === 1) txt('No other worlds yet. Press E to make one!', 84, 150 + 44, { size: 15, color: '#c7c4ee', weight: 600 });
    // detail pane for the highlighted world
    const w = e[menuSel];
    if (w) {
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(492, 132, 2, 336);
      txt(w.label, 516, 148, { size: 22, color: '#fff' });
      let y = 176;
      wrapLines(w.desc || 'No description.', 380, '600 14px ' + FONT).slice(0, 3).forEach(l => { txt(l, 516, y, { size: 14, color: '#c7c4ee', weight: 600 }); y += 19; });
      y = Math.max(y + 12, 246);
      txt(w.names.length + (w.names.length === 1 ? ' room' : ' rooms') + (w.names.length > 1 ? '   ·   ← → choose where to start' : ''), 516, y, { size: 12, color: '#9b98c9' }); y += 24;
      const start = Math.min(menuStart, w.names.length - 1), win = 6, top = Math.max(0, Math.min(start - 2, w.names.length - win));
      w.names.slice(top, top + win).forEach((n, k) => {
        const i = top + k, on = i === start;
        txt((on ? '▶ ' : '   ') + (i + 1) + '. ' + n, 516, y + k * 24, { size: 15, color: on ? '#7ed957' : '#fff', weight: on ? 800 : 600 });
      });
    }
  }
  txt('↑ ↓ choose world   ·   Enter play   ·   E editor   ·   Esc back', PW / 2, 506, { size: 16, align: 'center', color: '#c7c4ee', weight: 700 });
  txt(WW.storeMode === 'server' ? 'Worlds are the files in the worlds/ folder' : 'Saved in this browser — run server.py to keep worlds as files', PW / 2, H * CELL + HUDH / 2, { size: 13, align: 'center', color: '#9b98c9', weight: 600 });
}
function menuKey(e) {
  const en = menuEntries(), k = e.key, cur = en[menuSel];
  if (k === 'ArrowUp' || k === 'w' || k === 'W') { menuSel = Math.max(0, menuSel - 1); menuStart = 0; }
  else if (k === 'ArrowDown' || k === 's' || k === 'S') { menuSel = Math.min(en.length - 1, menuSel + 1); menuStart = 0; }
  else if ((k === 'ArrowLeft' || k === 'a' || k === 'A') && cur) menuStart = Math.max(0, menuStart - 1);
  else if ((k === 'ArrowRight' || k === 'd' || k === 'D') && cur) menuStart = Math.min(cur.names.length - 1, menuStart + 1);
  else if ((k === 'Enter' || k === ' ') && cur) { testMode = false; startGame(cur.list, Math.min(menuStart, cur.list.length - 1), cur.name); }
  else if (k === 'Escape' || k === 'Backspace') state = 'title';
  else return false;
  return true;
}
const openEditor = () => { location.href = 'editor.html'; };
// the page's own "Worlds" / "Level editor" buttons use these
WW.ui = { openWorlds() { if (state === 'title' || state === 'over' || state === 'win') openMenu(); }, openEditor };
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (state === 'menu' && menuKey(e)) { e.preventDefault(); return; }
  const idle = state === 'title' || state === 'menu' || state === 'over' || state === 'win';
  if ((e.key === 'e' || e.key === 'E') && (idle || testMode)) { openEditor(); return; }
  if ((e.key === 'l' || e.key === 'L') && state === 'title') { openMenu(); return; }
  if (KEYMAP[e.key]) { keys[KEYMAP[e.key]] = true; e.preventDefault(); }
  else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) action(); }
  else if (e.key === 'p' || e.key === 'P') { if (state === 'play') paused = !paused; }
  else if (e.key === 'r' || e.key === 'R') { if (state === 'play' && !paused) die(); }   // stuck? costs a life
  else if (e.key === 'n' || e.key === 'N') muted = !muted;
});
window.addEventListener('keyup', e => { if (KEYMAP[e.key]) keys[KEYMAP[e.key]] = false; });
window.addEventListener('blur', () => { keys.l = keys.r = keys.u = keys.d = false; if (state === 'play') paused = true; });

document.querySelectorAll('#pad button').forEach(btn => {
  const k = btn.dataset.k;
  const on = e => { e.preventDefault(); if (k === 'j') action(); else keys[k] = true; };
  const off = e => { e.preventDefault(); if (k !== 'j') keys[k] = false; };
  btn.addEventListener('pointerdown', on);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, off));
});
cv.addEventListener('pointerdown', () => { if (state === 'menu') return; if (state !== 'play') action(); else if (paused) paused = false; });

// ---------------------------------------------------------------- main loop
loadLevel();          // so the title screen has a room behind it
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= DT) { update(DT); acc -= DT; }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ?room=N jumps straight into a room (handy for testing / screenshots)
try {
  const q = new URLSearchParams(location.search);
  if (q.get('room')) { startGame(BUILTIN, Math.min(LEVELS.length, Math.max(1, +q.get('room'))) - 1); state = 'play'; }
  else if (q.get('test')) {                       // the editor's "Test play": run the level being edited
    const d = JSON.parse(localStorage.getItem('willy-draft') || 'null');
    const lvl = d && d.world ? d.world.levels[d.cur] : d;       // (older drafts were a single level)
    if (lvl && !validateLevel(lvl) && !WW.level.problems(lvl.map).errors.length) { testMode = true; startGame([{ def: lvl }], 0); }
  } else if (q.get('play')) {                     // ?play=<world id>[&level=n] plays a saved world
    WW.store.list().then(l => { const w = l.find(x => x.id === q.get('play')); if (w) startGame(w.levels.map(def => ({ def })), Math.max(0, Math.min(w.levels.length - 1, (+q.get('level') || 1) - 1)), w.name); });
  }
} catch (e) {}
WW.store.mode().then(m => { WW.storeMode = m; });

// test hooks
window.WILLY = { LEVELS, buildLevel: build, keys, update,
  begin(lv) { playlist = BUILTIN; score = 0; lives = 3; level = lv; loadLevel(); state = 'play'; }, jump() { jumpQ = true; },
  get willy() { return willy; }, get state() { return state; }, get balls() { return balls; }, set balls(v) { balls = v; },
  get grid() { return grid; }, get tm() { return tm; }, get level() { return level; }, get worldName() { return worldName; }, get count() { return playlist.length; }, get levelName() { return levelName; }, get menu() { return menuEntries().map(e => e.label); }, get springs() { return springs; }, get crumbling() { return crumbling; } };
})();
