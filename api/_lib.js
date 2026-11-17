// Shared helpers for the Vercel functions that store worlds in Upstash Redis.
// Files starting with "_" are not routes. No npm packages: Upstash is called over its REST API.
const crypto = require('crypto');

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const RESERVED = new Set(['index']);
const CHARS = new Set(' =-H^*SBW<>');
const W = 40, H = 22;
const MAX_BODY = 256 * 1024;       // bytes per world
const MAX_WORLDS = 150;            // total in the library (keeps the list response well under Vercel's 4.5 MB cap)
const LIST_BYTES = 3.5 * 1024 * 1024;
const WRITES_PER_HOUR = 30;        // per IP
const IDS = 'willy:ids', KEY = id => 'willy:world:' + id;

function validateLevel(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'not an object';
  if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 40) return 'name must be 1-40 characters';
  if (!Number.isInteger(d.theme) || d.theme < 0 || d.theme > 7) return 'theme must be 0-7';
  for (const [k, lo, hi] of [['rate', 0.8, 8], ['speed', 2, 9]]) {
    const v = d[k]; if (typeof v !== 'number' || !(v >= lo && v <= hi)) return k + ' must be ' + lo + '-' + hi;
  }
  if (!Array.isArray(d.map) || d.map.length !== H) return 'map must have ' + H + ' rows';
  for (const row of d.map) {
    if (typeof row !== 'string' || row.length !== W) return 'every map row must be ' + W + ' characters';
    for (const c of row) if (!CHARS.has(c)) return 'unknown map character';
  }
  const flat = d.map.join('');
  if (flat.split('W').length !== 2) return 'needs exactly one worm start';
  if (flat.split('B').length !== 2) return 'needs exactly one bell';
  return null;
}
function validateWorld(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return 'not an object';
  if (typeof w.name !== 'string' || !w.name.trim() || w.name.length > 40) return 'world name must be 1-40 characters';
  const author = w.author === undefined ? '' : w.author, desc = w.description === undefined ? '' : w.description;
  if (typeof author !== 'string' || author.length > 30) return 'author must be at most 30 characters';
  if (typeof desc !== 'string' || desc.length > 200) return 'description must be at most 200 characters';
  if (!Array.isArray(w.levels) || w.levels.length < 1 || w.levels.length > 30) return 'a world needs 1-30 levels';
  for (let i = 0; i < w.levels.length; i++) { const e = validateLevel(w.levels[i]); if (e) return 'level ' + (i + 1) + ': ' + e; }
  return null;
}
const validId = s => typeof s === 'string' && ID_RE.test(s) && !RESERVED.has(s);

// ---- Upstash (Vercel's Marketplace integration sets KV_REST_API_*; Upstash's own uses UPSTASH_REDIS_REST_*)
const cfg = () => ({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});
const configured = () => { const c = cfg(); return !!(c.url && c.token); };
async function redis(...cmd) {
  const c = cfg();
  const r = await fetch(c.url, { method: 'POST', headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('storage error: ' + (j.error || r.status));
  return j.result;
}

// ---- tokens: the server makes one when a world is created and only keeps its hash
const newToken = () => crypto.randomBytes(24).toString('hex');
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function tokenOk(req, stored) {
  const m = /^Bearer ([0-9a-f]{48})$/.exec(req.headers.authorization || '');
  if (!m || !stored) return false;
  return crypto.timingSafeEqual(Buffer.from(hash(m[1])), Buffer.from(stored));
}

// ---- request guards
function send(res, code, obj) { res.setHeader('Cache-Control', 'no-store'); res.status(code).json(obj); }
function sameSite(req) {                       // refuse writes that other websites trigger from a visitor's browser
  const o = req.headers.origin; if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}
function clientIp(req) {
  return String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
}
async function rateLimited(req) {
  const key = 'willy:rl:' + hash(clientIp(req)).slice(0, 16) + ':' + Math.floor(Date.now() / 3600000);
  const n = await redis('INCR', key);
  if (n === 1) await redis('EXPIRE', key, 3700);
  return n > WRITES_PER_HOUR;
}
function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { if (b.length > MAX_BODY) return { error: 'too large' }; try { b = JSON.parse(b); } catch (e) { return { error: 'invalid JSON' }; } }
  if (!b || typeof b !== 'object') return { error: 'invalid JSON' };
  if (JSON.stringify(b).length > MAX_BODY) return { error: 'too large' };
  return { body: b };
}
const clean = (id, d, now) => ({
  id, name: d.name.trim(), author: (d.author || '').trim(), description: (d.description || '').trim(),
  levels: d.levels.map(l => ({ name: l.name, theme: l.theme, rate: l.rate, speed: l.speed, map: l.map })), updated: now,
});

module.exports = { validateWorld, validId, configured, redis, newToken, hash, tokenOk, send, sameSite, rateLimited, readBody, clean,
  IDS, KEY, MAX_WORLDS, LIST_BYTES };
