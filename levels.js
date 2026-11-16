// Level data + builder. No DOM access, so it can be tested headlessly.
//
// Every room is five platforms ("tiers", bottom to top) joined by four "links".
// A link is a ladder column (number) or a spring ('s26' = spring at column 26).
// links[k] joins tier k to tier k+1. Tier 0 is the floor; the bell sits on tier 4.
//
// Floor tiles:  '=' solid (double-line)   '-' crumbles after Willy steps off it   ' ' gap
(function () {
  const WW = window.WW = window.WW || {};
  const W = 40, H = 22, TIERS = [21, 17, 13, 9, 5], START_COL = 2;

  const LEVELS = [
    { name: 'The Garden Shed', gap: 4, links: [12, 28, 10, 30], bell: 6,
      tacks: [0, 0, 0, 0, 0], holes: [[1, 21, 2]], crumble: [],
      spawns: [[36, 4, -1]], rate: 3.6, speed: 3.8 },

    { name: 'Tack Room', gap: 4, links: [14, 26, 8, 32], bell: 6,
      tacks: [0, 1, 1, 1, 1], holes: [[3, 18, 2]], crumble: [],
      spawns: [[38, 4, -1]], rate: 3.2, speed: 4.2 },

    { name: 'Crumbly Cellar', gap: 4, links: [10, 30, 12, 28], bell: 8,
      tacks: [1, 1, 0, 1, 1], holes: [], crumble: [[1, 14, 26], [3, 16, 26]],
      spawns: [[38, 4, -1]], rate: 3.0, speed: 4.4 },

    { name: 'Bouncy Attic', gap: 4, links: [12, 's26', 10, 's30'], bell: 6,
      tacks: [0, 1, 1, 1, 1], holes: [], crumble: [], springs: [[0, 24]],
      spawns: [[38, 4, -1]], rate: 2.9, speed: 4.6 },

    { name: 'Cannon Alley', gap: 4, links: [16, 28, 10, 32], bell: 6,
      tacks: [1, 1, 1, 2, 2], holes: [[1, 22, 2]], crumble: [[2, 12, 26]],
      spawns: [[38, 4, -1], [38, 2, -1]], rate: 2.8, speed: 5.0 },

    { name: 'The Greenhouse', gap: 4, links: [18, 's32', 6, 28], bell: 8,
      tacks: [1, 1, 2, 2, 2], holes: [[3, 16, 3]], crumble: [[2, 10, 28], [4, 12, 24]],
      spawns: [[38, 4, -1], [38, 2, -1]], rate: 2.5, speed: 5.3 },

    { name: 'The Long Drop', gap: 6, links: [10, 's28', 12, 30], bell: 8,
      tacks: [1, 1, 2, 2, 2], holes: [[1, 20, 3], [3, 20, 3]], crumble: [[2, 10, 26]],
      spawns: [[38, 4, -1], [38, 2, -1], [2, 3, 1]], rate: 2.3, speed: 5.6 },

    { name: 'The Final Bell', gap: 4, links: [14, 's26', 8, 's32'], bell: 6,
      tacks: [2, 2, 2, 3, 3], holes: [[1, 20, 3], [2, 18, 2], [3, 18, 2]], crumble: [[4, 10, 28]],
      spawns: [[38, 4, -1], [38, 2, -1], [2, 3, 1]], rate: 1.9, speed: 6.0 },
  ];

  const parseLink = l => typeof l === 'string' ? { spring: true, c: +l.slice(1) } : { spring: false, c: l };

  function build(i) {
    const L = LEVELS[i], gap = L.gap;
    const g = Array.from({ length: H }, () => Array(W).fill(' '));
    const range = t => t === 0 ? [0, W - 1] : (t % 2 ? [0, W - 1 - gap] : [gap, W - 1]);
    TIERS.forEach((row, t) => { const [a, b] = range(t); for (let c = a; c <= b; c++) g[row][c] = '='; });
    const links = L.links.map(parseLink);

    // columns that must stay solid: arrival/departure points, bell, cannons, springs
    const prot = TIERS.map(() => new Set());
    const protect = (t, c) => { for (let d = -1; d <= 1; d++) prot[t].add(c + d); };
    protect(0, START_COL);
    links.forEach((k, t) => { protect(t, k.c); protect(t + 1, k.c); });
    protect(4, L.bell);
    L.spawns.forEach(([c, t]) => protect(t, c));
    (L.springs || []).forEach(([t, c]) => protect(t, c));

    (L.holes || []).forEach(([t, c, w]) => {
      for (let k = 0; k < w; k++) {
        if (prot[t].has(c + k)) throw new Error(`level ${i + 1}: hole at tier ${t} col ${c + k} hits a protected column`);
        g[TIERS[t]][c + k] = ' ';
      }
    });
    (L.crumble || []).forEach(([t, from, to]) => {
      for (let c = from; c <= to; c++) if (g[TIERS[t]][c] === '=' && !prot[t].has(c)) g[TIERS[t]][c] = '-';
    });

    const springs = [];
    links.forEach((k, t) => {
      if (k.spring) {
        springs.push({ c: k.c, r: TIERS[t] - 1, link: true, t: 0 });
        for (let d = -1; d <= 1; d++) if (g[TIERS[t + 1]][k.c + d] === ' ') throw new Error(`level ${i + 1}: nothing above spring at col ${k.c}`);
      } else {
        for (let r = TIERS[t + 1]; r <= TIERS[t + 1] + 3; r++) g[r][k.c] = 'H';
      }
    });
    (L.springs || []).forEach(([t, c]) => springs.push({ c, r: TIERS[t] - 1, link: false, t: 0 }));

    // tacks + presents along each tier's walking path
    const starts = [START_COL, ...links.map(k => k.c)], ends = [...links.map(k => k.c), L.bell];
    const tacks = [], gifts = [];
    const solid = (t, c) => g[TIERS[t]][c] === '=';
    const nearGap = (t, c) => { for (let d = -2; d <= 2; d++) if (g[TIERS[t]][c + d] === ' ' || g[TIERS[t]][c + d] === 'H') return true; return false; };
    for (let t = 0; t < 5; t++) {
      const a = starts[t], b = ends[t], lo = Math.min(a, b), hi = Math.max(a, b), row = TIERS[t] - 1;
      const n = Math.min(L.tacks[t], Math.floor((hi - lo) / 6));
      const mine = [];
      for (let k = 1; k <= n; k++) {
        const want = Math.round(a + (b - a) * k / (n + 1));
        for (const d of [0, 1, -1, 2, -2, 3, -3]) {
          const c = want + d;
          if (c < lo + 3 || c > hi - 3) continue;
          if (!solid(t, c) || nearGap(t, c) || prot[t].has(c)) continue;
          if (mine.some(o => Math.abs(o - c) < 4)) continue;
          mine.push(c); tacks.push({ c, r: row }); break;
        }
      }
      const want = Math.round(a + (b - a) * 0.5 / (mine.length + 1));
      for (const d of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
        const c = want + d;
        if (c < lo + 1 || c > hi - 1 || g[TIERS[t]][c] === ' ' || g[TIERS[t]][c] === 'H') continue;
        if (mine.some(o => Math.abs(o - c) < 2)) continue;
        gifts.push({ c, r: row, got: false }); break;
      }
    }

    return {
      g, tacks, gifts, springs,
      bell: { c: L.bell, r: TIERS[4] - 1 },
      spawns: L.spawns.map(([c, t, dir], k) => ({ c, r: TIERS[t] - 1, dir, timer: 1.4 + k * 0.9, kick: 0 })),
      rate: L.rate, speed: L.speed, name: L.name, links, theme: i,
      start: { c: START_COL, r: TIERS[0] - 1 },
    };
  }

  // ------------------------------------------------------------ custom levels (text maps)
  // A custom level is { id, name, theme, rate, speed, map } where map is 22 strings of 40 chars:
  //   ' ' empty  '=' solid floor  '-' crumbling plank  'H' ladder  '^' tack  '*' present
  //   'S' spring  'B' bell  'W' worm start  '<' '>' cannon facing left / right
  const CHARS = ' =-H^*SBW<>';

  function validateLevel(d) {
    if (!d || typeof d !== 'object') return 'not an object';
    if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 40) return 'name must be 1-40 characters';
    if (!Number.isInteger(d.theme) || d.theme < 0 || d.theme > 7) return 'theme must be 0-7';
    if (typeof d.rate !== 'number' || !(d.rate >= 0.8 && d.rate <= 8)) return 'rate must be 0.8-8';
    if (typeof d.speed !== 'number' || !(d.speed >= 2 && d.speed <= 9)) return 'speed must be 2-9';
    if (!Array.isArray(d.map) || d.map.length !== H) return 'map must have ' + H + ' rows';
    for (const row of d.map) {
      if (typeof row !== 'string' || row.length !== W) return 'every map row must be ' + W + ' characters';
      for (const ch of row) if (!CHARS.includes(ch)) return 'unknown map character ' + JSON.stringify(ch);
    }
    return null;
  }

  // Parse a text map into the same shape build() returns. Missing bell/start come back null.
  function fromMap(def) {
    const g = Array.from({ length: H }, () => Array(W).fill(' '));
    const tacks = [], gifts = [], springs = [], spawns = [];
    let bell = null, start = null;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const ch = (def.map[r] && def.map[r][c]) || ' ';
      if (ch === '=' || ch === '-' || ch === 'H') g[r][c] = ch;
      else if (ch === '^') tacks.push({ c, r });
      else if (ch === '*') gifts.push({ c, r, got: false });
      else if (ch === 'S') springs.push({ c, r, link: false, t: 0 });
      else if (ch === 'B') bell = { c, r };
      else if (ch === 'W') start = { c, r };
      else if (ch === '<' || ch === '>') spawns.push({ c, r, dir: ch === '<' ? -1 : 1, timer: 1.4 + spawns.length * 0.9, kick: 0 });
    }
    return { g, tacks, gifts, springs, bell, start, spawns,
      rate: def.rate, speed: def.speed, name: def.name, theme: def.theme };
  }

  // Turn a built-in room into a map, so it can be opened in the editor.
  function toMap(b) {
    const rows = b.g.map(r => r.slice());
    b.tacks.forEach(t => rows[t.r][t.c] = '^');
    b.gifts.forEach(t => rows[t.r][t.c] = '*');
    b.springs.forEach(t => rows[t.r][t.c] = 'S');
    b.spawns.forEach(t => rows[t.r][t.c] = t.dir < 0 ? '<' : '>');
    rows[b.bell.r][b.bell.c] = 'B';
    rows[b.start.r][b.start.c] = 'W';
    return rows.map(r => r.join(''));
  }
  function builtinAsLevel(i) {
    const b = build(i);
    return { id: null, name: b.name, theme: b.theme, rate: b.rate, speed: b.speed, map: toMap(b) };
  }

  // A world is a named, ordered set of levels in one self-contained file:
  //   { id, name, author, description, levels: [ {name, theme, rate, speed, map}, ... ] }
  function validateWorld(w) {
    if (!w || typeof w !== 'object') return 'not an object';
    if (typeof w.name !== 'string' || !w.name.trim() || w.name.length > 40) return 'world name must be 1-40 characters';
    if (w.author != null && (typeof w.author !== 'string' || w.author.length > 30)) return 'author must be at most 30 characters';
    if (w.description != null && (typeof w.description !== 'string' || w.description.length > 200)) return 'description must be at most 200 characters';
    if (!Array.isArray(w.levels) || w.levels.length < 1 || w.levels.length > 30) return 'a world needs 1-30 levels';
    for (let i = 0; i < w.levels.length; i++) {
      const e = validateLevel(w.levels[i]) || problems(w.levels[i].map).errors[0];   // every level must be playable
      if (e) return 'level ' + (i + 1) + ': ' + e;
    }
    return null;
  }
  function blankWorld() {
    const l = blankLevel(); delete l.id;
    return { id: null, name: 'My World', author: '', description: '', levels: [l] };
  }

  function blankLevel() {
    const rows = Array.from({ length: H }, () => Array(W).fill(' '));
    for (let c = 0; c < W; c++) rows[21][c] = '=';
    rows[20][2] = 'W'; rows[20][37] = 'B';
    return { id: null, name: 'Untitled room', theme: 0, rate: 3.2, speed: 4.5, map: rows.map(r => r.join('')) };
  }

  // Things the editor should warn about (errors block saving/testing; warnings don't).
  function problems(map) {
    const errors = [], warnings = [];
    const count = {}, floating = { '^': 0, S: 0, '<': 0, '>': 0, W: 0 };
    const supported = (r, c) => { const t = map[r + 1] && map[r + 1][c]; return t === '=' || t === '-' || t === 'H'; };
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const ch = map[r][c];
      count[ch] = (count[ch] || 0) + 1;
      if (ch in floating && !supported(r, c)) floating[ch]++;
    }
    if ((count.W || 0) !== 1) errors.push('Place exactly one worm start.');
    if ((count.B || 0) !== 1) errors.push('Place exactly one bell.');
    if (floating.W) warnings.push('Willy starts with nothing under him, so he will fall.');
    const fl = floating['^'] + floating.S + floating['<'] + floating['>'];
    if (fl) warnings.push(fl + ' tack/spring/cannon piece' + (fl > 1 ? 's have' : ' has') + ' nothing underneath.');
    if (!(count['<'] || count['>'])) warnings.push('No cannons, so nothing will roll at you.');
    return { errors, warnings };
  }

  WW.level = { W, H, TIERS, START_COL, LEVELS, build, CHARS, validateLevel, fromMap, toMap, builtinAsLevel, blankLevel, blankWorld, validateWorld, problems };
})();
