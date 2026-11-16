// Procedural vector sprites. All coordinates are in cell units (1 cell = CELL px).
(function () {
  const WW = window.WW = window.WW || {};
  const CELL = 24, TAU = Math.PI * 2;

  const THEMES = [
    { bg: ['#cfeaff', '#f2f8dc'], deco: 'planks',  solid: ['#d9a46a', '#a56f3f', '#6b4423'], crumble: ['#f0d9a6', '#a07d45'] },
    { bg: ['#f6e8cc', '#ebd1a0'], deco: 'dots',    solid: ['#b4bdca', '#7f8998', '#4a5260'], crumble: ['#ecd09a', '#9c7a45'] },
    { bg: ['#3d3760', '#241f3c'], deco: 'bricks',  dark: true, solid: ['#b9a2dd', '#8a72b3', '#54417a'], crumble: ['#e2d2ac', '#8d7852'] },
    { bg: ['#ffe5f0', '#ffd2e2'], deco: 'stripes', solid: ['#f59cc0', '#d66c98', '#97406a'], crumble: ['#fff0c9', '#b98a5a'] },
    { bg: ['#34415a', '#1d2635'], deco: 'bricks',  dark: true, solid: ['#ccd3dc', '#98a1ae', '#5d6573'], crumble: ['#e6d3a8', '#947c52'] },
    { bg: ['#d9f6ef', '#bfe8d8'], deco: 'panes',   solid: ['#8ed092', '#5aa565', '#33703d'], crumble: ['#f0e2b0', '#a08a50'] },
    { bg: ['#ffd9a3', '#ff9f73'], deco: 'stripes', solid: ['#c97a4a', '#9c5530', '#64311a'], crumble: ['#ffe9b8', '#b08040'] },
    { bg: ['#40306f', '#190f3f'], deco: 'stars',   dark: true, solid: ['#ffd96a', '#e3a935', '#8e6212'], crumble: ['#f3e3b5', '#a58a4f'] },
  ];

  function at(ctx, x, y, fn) { ctx.save(); ctx.translate(x * CELL, y * CELL); ctx.scale(CELL, CELL); fn(); ctx.restore(); }
  function circle(ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 0.04; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const INK = '#25301f';

  // ---------------------------------------------------------------- the worm
  const N = 6;
  function wormPose(o) {
    const f = o.face || 1, pts = [];
    for (let i = 0; i < N; i++) {
      const r = i === 0 ? 0.215 : 0.185 - 0.014 * i;
      let x, y;
      if (o.st === 'climb') {
        x = 0.5 + Math.sin(o.anim * 8 - i * 0.9) * 0.05; y = 0.24 + i * 0.135;
      } else if (o.st === 'air') {
        const t = i / (N - 1), tilt = Math.max(-1, Math.min(1, (o.vy || 0) / 20));
        const hx = 0.5 + f * 0.13, hy = 0.30 + tilt * 0.12, tx = 0.5 - f * 0.17, ty = 0.80 - tilt * 0.10;
        x = hx + (tx - hx) * t + f * Math.sin(t * Math.PI) * 0.07;
        y = hy + (ty - hy) * t - Math.sin(t * Math.PI) * 0.04;
      } else {
        const bump = o.moving ? 0.065 * (1 + Math.sin(o.anim * 8 - i * 0.9))
                              : 0.014 * Math.sin((o.t || 0) * 2.2 - i * 0.7);
        x = 0.5 + f * (0.30 - i * 0.12) * (o.moving ? 1 - 0.1 * Math.sin(o.anim * 8) : 1);
        y = 1 - r - bump - (i < 3 ? (3 - i) * 0.05 : 0);
      }
      pts.push({ x, y, r });
    }
    return pts;
  }

  function wormFace(ctx, hx, hy, o) {
    const f = o.face || 1, dead = o.dead, climbing = o.st === 'climb';
    const blink = !dead && ((o.t || 0) % 3.3) < 0.13;
    const eyes = climbing ? [[hx - 0.075, hy - 0.04], [hx + 0.075, hy - 0.04]]
                          : [[hx + f * 0.015, hy - 0.05], [hx + f * 0.115, hy - 0.05]];
    ctx.lineCap = 'round';
    eyes.forEach(([ex, ey], k) => {
      if (dead) {
        ctx.strokeStyle = INK; ctx.lineWidth = 0.035;
        ctx.beginPath(); ctx.moveTo(ex - 0.04, ey - 0.04); ctx.lineTo(ex + 0.04, ey + 0.04);
        ctx.moveTo(ex + 0.04, ey - 0.04); ctx.lineTo(ex - 0.04, ey + 0.04); ctx.stroke();
      } else if (blink) {
        ctx.strokeStyle = INK; ctx.lineWidth = 0.035; ctx.beginPath();
        ctx.moveTo(ex - 0.05, ey); ctx.lineTo(ex + 0.05, ey); ctx.stroke();
      } else {
        circle(ctx, ex, ey, k ? 0.068 : 0.06, '#fff', INK, 0.025);
        circle(ctx, ex + (climbing ? 0 : f * 0.02), ey + (climbing ? -0.012 : 0.008), 0.03, INK);
      }
    });
    // smile
    ctx.strokeStyle = INK; ctx.lineWidth = 0.03; ctx.beginPath();
    const mx = climbing ? hx : hx + f * 0.075, my = hy + 0.06;
    if (dead) { ctx.arc(mx, my + 0.05, 0.05, Math.PI * 1.1, Math.PI * 1.9); }
    else { ctx.arc(mx, my, 0.05, Math.PI * 0.12, Math.PI * 0.88); }
    ctx.stroke();
    // cheek
    ctx.fillStyle = 'rgba(255,120,140,.45)';
    ctx.beginPath(); ctx.ellipse(climbing ? hx - 0.12 : hx - f * 0.06, hy + 0.07, 0.035, 0.02, 0, 0, TAU); ctx.fill();
  }

  function worm(ctx, x, y, o) {
    at(ctx, x, y, () => {
      ctx.fillStyle = 'rgba(0,0,0,.16)';
      if (o.st === 'ground') { ctx.beginPath(); ctx.ellipse(0.5, 0.985, 0.38, 0.045, 0, 0, TAU); ctx.fill(); }
      const pts = wormPose(o);
      for (let i = N - 1; i >= 0; i--) {
        const p = pts[i];
        const g = ctx.createRadialGradient(p.x - 0.05, p.y - 0.07, 0.02, p.x, p.y, p.r * 1.05);
        g.addColorStop(0, '#d4f79a'); g.addColorStop(1, i % 2 ? '#62c23f' : '#78d44c');
        circle(ctx, p.x, p.y, p.r, g, '#2c6b28', 0.04);
      }
      // little belly-segment lines on the body
      ctx.strokeStyle = 'rgba(40,100,40,.35)'; ctx.lineWidth = 0.025;
      for (let i = 1; i < N - 1; i++) {
        const p = pts[i]; ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.7, o.st === 'climb' ? 0.2 : Math.PI * 0.55, o.st === 'climb' ? 1.2 : Math.PI * 0.95); ctx.stroke();
      }
      wormFace(ctx, pts[0].x, pts[0].y, o);
    });
  }
  function wormIcon(ctx, x, y) {   // just the head, for lives
    at(ctx, x, y, () => {
      const g = ctx.createRadialGradient(0.45, 0.42, 0.03, 0.5, 0.5, 0.4);
      g.addColorStop(0, '#d4f79a'); g.addColorStop(1, '#78d44c');
      circle(ctx, 0.5, 0.52, 0.38, g, '#2c6b28', 0.06);
      [0.36, 0.64].forEach(ex => { circle(ctx, ex, 0.46, 0.1, '#fff', INK, 0.03); circle(ctx, ex, 0.47, 0.045, INK); });
      ctx.strokeStyle = INK; ctx.lineWidth = 0.05; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0.5, 0.58, 0.11, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    });
  }

  // ---------------------------------------------------------------- things
  function ball(ctx, x, y, rot) {
    at(ctx, x, y, () => {
      const cx = 0.5, cy = 0.6, r = 0.4;
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(cx, 0.985, 0.3, 0.04, 0, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(cx - 0.14, cy - 0.16, 0.03, cx, cy, r);
      g.addColorStop(0, '#9aa1ae'); g.addColorStop(0.55, '#3c414d'); g.addColorStop(1, '#13151a');
      circle(ctx, cx, cy, r, g, '#0a0b0e', 0.045);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, -0.5, 1.0); ctx.stroke();
      circle(ctx, r * 0.62, 0, 0.045, 'rgba(255,255,255,.35)');
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(cx - 0.15, cy - 0.18, 0.08, 0.045, -0.6, 0, TAU); ctx.fill();
    });
  }

  const GIFT = [['#ff5d73', '#ffd166'], ['#4dabf7', '#ffe066'], ['#9775fa', '#69db7c'], ['#ffa94d', '#ff6b6b'], ['#38d9a9', '#f783ac']];
  function gift(ctx, x, y, t, ci, alpha) {
    const [c1, c2] = GIFT[ci % GIFT.length], bob = Math.sin(t * 3 + ci) * 0.04;
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    at(ctx, x, y + bob, () => {
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(0.5, 0.97 - bob, 0.28, 0.04, 0, 0, TAU); ctx.fill();
      rrect(ctx, 0.2, 0.44, 0.6, 0.5, 0.05); ctx.fillStyle = c1; ctx.fill(); ctx.lineWidth = 0.035; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
      rrect(ctx, 0.15, 0.34, 0.7, 0.17, 0.04); ctx.fillStyle = c1; ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(0.2, 0.52, 0.6, 0.06);
      ctx.fillStyle = c2; ctx.fillRect(0.45, 0.34, 0.1, 0.6); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 0.025; ctx.strokeRect(0.45, 0.34, 0.1, 0.6);
      [[0.37, -0.4], [0.63, 0.4]].forEach(([bx, rot]) => {
        ctx.save(); ctx.translate(bx, 0.27); ctx.rotate(rot); ctx.beginPath(); ctx.ellipse(0, 0, 0.11, 0.065, 0, 0, TAU);
        ctx.fillStyle = c2; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 0.03; ctx.stroke(); ctx.restore();
      });
      circle(ctx, 0.5, 0.31, 0.045, c2, 'rgba(0,0,0,.5)', 0.025);
      const s = 0.5 + 0.5 * Math.sin(t * 4 + ci * 2);   // sparkle
      ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.5 * s) + ')';
      ctx.save(); ctx.translate(0.84, 0.2); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-0.012, -0.06 * (0.4 + s), 0.024, 0.12 * (0.4 + s)); ctx.fillRect(-0.06 * (0.4 + s), -0.012, 0.12 * (0.4 + s), 0.024);
      ctx.restore();
    });
    ctx.restore();
  }

  function tack(ctx, x, y) {
    at(ctx, x, y, () => {
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(0.5, 0.985, 0.3, 0.035, 0, 0, TAU); ctx.fill();
      const g = ctx.createLinearGradient(0.38, 0, 0.62, 0);
      g.addColorStop(0, '#f4f6f8'); g.addColorStop(0.45, '#b4bcc4'); g.addColorStop(1, '#6e7781');
      ctx.beginPath(); ctx.moveTo(0.4, 0.88); ctx.lineTo(0.5, 0.28); ctx.lineTo(0.6, 0.88); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 0.03; ctx.strokeStyle = '#444c55'; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0.5, 0.9, 0.27, 0.085, 0, 0, TAU);
      ctx.fillStyle = '#e03131'; ctx.fill(); ctx.strokeStyle = '#7a1010'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0.43, 0.88, 0.1, 0.025, 0, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill();
    });
  }

  function bell(ctx, x, y, t, ring) {
    at(ctx, x, y, () => {
      const glow = ctx.createRadialGradient(0.5, 0.5, 0.1, 0.5, 0.5, 0.95);
      const a = 0.22 + 0.12 * Math.sin(t * 3);
      glow.addColorStop(0, 'rgba(255,225,90,' + a + ')'); glow.addColorStop(1, 'rgba(255,225,90,0)');
      ctx.fillStyle = glow; ctx.fillRect(-0.6, -0.6, 2.2, 2.2);
      const sw = Math.sin(t * (ring ? 14 : 2.2)) * (ring ? 0.32 : 0.1);
      ctx.save(); ctx.translate(0.5, 0.1); ctx.rotate(sw); ctx.translate(-0.5, -0.1);
      const g = ctx.createLinearGradient(0.2, 0, 0.8, 0);
      g.addColorStop(0, '#ffe066'); g.addColorStop(0.45, '#f5b700'); g.addColorStop(1, '#c78500');
      ctx.beginPath(); ctx.moveTo(0.38, 0.2); ctx.bezierCurveTo(0.38, 0.5, 0.22, 0.58, 0.14, 0.80);
      ctx.lineTo(0.86, 0.80); ctx.bezierCurveTo(0.78, 0.58, 0.62, 0.5, 0.62, 0.2);
      ctx.quadraticCurveTo(0.5, 0.1, 0.38, 0.2); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 0.04; ctx.strokeStyle = '#7a4d00'; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.04; ctx.beginPath();
      ctx.moveTo(0.42, 0.3); ctx.bezierCurveTo(0.42, 0.52, 0.3, 0.6, 0.24, 0.72); ctx.stroke();
      circle(ctx, 0.5, 0.1, 0.06, '#c78500', '#7a4d00', 0.03);
      circle(ctx, 0.5 - sw * 0.2, 0.88, 0.075, '#b87a00', '#7a4d00', 0.03);
      ctx.restore();
    });
  }

  function spring(ctx, x, y, squish) {
    at(ctx, x, y, () => {
      const top = 0.38 + squish * 0.28;
      rrect(ctx, 0.2, 0.91, 0.6, 0.09, 0.03); ctx.fillStyle = '#adb5bd'; ctx.fill(); ctx.lineWidth = 0.03; ctx.strokeStyle = '#495057'; ctx.stroke();
      ctx.strokeStyle = '#e03131'; ctx.lineWidth = 0.075; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); const segs = 5, y0 = 0.91, y1 = top + 0.09;
      ctx.moveTo(0.5, y0);
      for (let i = 0; i < segs; i++) { const yy = y0 + (y1 - y0) * (i + 1) / segs; ctx.lineTo(i % 2 ? 0.3 : 0.7, yy - (y0 - y1) / segs * 0.5); }
      ctx.lineTo(0.5, y1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.025; ctx.stroke();
      rrect(ctx, 0.15, top, 0.7, 0.1, 0.04); ctx.fillStyle = '#ff6b6b'; ctx.fill(); ctx.lineWidth = 0.03; ctx.strokeStyle = '#7a1010'; ctx.stroke();
    });
  }

  function ladder(ctx, c, r, top) {
    at(ctx, c, r, () => {
      const y0 = top ? -0.16 : -0.01;
      ctx.fillStyle = '#b9793a'; ctx.strokeStyle = '#5e3a1b'; ctx.lineWidth = 0.035;
      [0.15, 0.75].forEach(rx => { ctx.fillRect(rx, y0, 0.1, 1.02 - y0); ctx.strokeRect(rx, y0, 0.1, 1.02 - y0); });
      ctx.fillStyle = '#e0aa6a';
      [0.22, 0.72].forEach(ry => { ctx.fillRect(0.15, ry, 0.7, 0.08); ctx.strokeRect(0.15, ry, 0.7, 0.08); });
    });
  }

  function solid(ctx, c, r, th) {
    at(ctx, c, r, () => {
      const [lip, body, line] = th.solid;
      ctx.fillStyle = body; ctx.fillRect(0, 0, 1.01, 0.6);
      ctx.fillStyle = lip;  ctx.fillRect(0, 0, 1.01, 0.15);
      ctx.fillStyle = line; ctx.fillRect(0, 0.15, 1.01, 0.04);
      ctx.fillRect(0, 0.34, 1.01, 0.04); ctx.fillRect(0, 0.49, 1.01, 0.04);     // the "double line"
      ctx.fillRect(((c * 7) % 3) / 3 + 0.1, 0.19, 0.03, 0.15);
      ctx.fillRect(((c * 5) % 3) / 3 + 0.35, 0.38, 0.03, 0.11);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0.6, 1.01, 0.05);
    });
  }
  function crumble(ctx, c, r, th, shake, alpha) {
    ctx.save(); ctx.globalAlpha = alpha;
    at(ctx, c + (shake ? (Math.random() - 0.5) * 0.08 : 0), r + (shake ? Math.random() * 0.04 : 0), () => {
      const [plank, line] = th.crumble;
      ctx.fillStyle = plank; ctx.fillRect(0, 0, 1.01, 0.2);
      ctx.fillStyle = line; ctx.fillRect(0, 0.2, 1.01, 0.035); ctx.fillRect(0, 0, 1.01, 0.025);
      ctx.fillRect(0.32 + ((c * 3) % 2) * 0.2, 0.03, 0.025, 0.15);
      ctx.fillRect(0.74, 0.05, 0.025, 0.12);
      ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(0, 0.235, 1.01, 0.03);
    });
    ctx.restore();
  }

  function cannon(ctx, x, y, dir, kick) {
    at(ctx, x, y, () => {
      ctx.save(); ctx.translate(0.5, 0.62); ctx.scale(dir, 1); ctx.rotate(-0.3); ctx.translate(-(kick || 0) * 0.12, 0);
      rrect(ctx, -0.12, -0.15, 0.7, 0.3, 0.1); ctx.fillStyle = '#2f323b'; ctx.fill(); ctx.lineWidth = 0.04; ctx.strokeStyle = '#0c0d10'; ctx.stroke();
      rrect(ctx, 0.44, -0.2, 0.13, 0.4, 0.04); ctx.fillStyle = '#4b505c'; ctx.fill(); ctx.stroke();
      ctx.restore();
      circle(ctx, 0.5, 0.78, 0.2, '#8a5a2b', '#3d2410', 0.04);
      ctx.strokeStyle = '#3d2410'; ctx.lineWidth = 0.03;
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(0.5 + Math.cos(a) * 0.2, 0.78 + Math.sin(a) * 0.2); ctx.lineTo(0.5 - Math.cos(a) * 0.2, 0.78 - Math.sin(a) * 0.2); ctx.stroke(); }
      circle(ctx, 0.5, 0.78, 0.04, '#3d2410');
    });
  }

  // ---------------------------------------------------------------- backgrounds
  function paintBg(ctx, w, h, th) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const dark = !!th.dark;
    const ink = dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.055)';
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = 2;
    if (th.deco === 'stripes') { for (let x = 0; x < w; x += CELL * 2) ctx.fillRect(x, 0, CELL, h); }
    else if (th.deco === 'planks') { for (let x = 0; x < w; x += CELL * 3) { ctx.fillRect(x, 0, 2, h); } }
    else if (th.deco === 'dots') { for (let y = CELL; y < h; y += CELL * 2) for (let x = CELL; x < w; x += CELL * 2) { ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); } }
    else if (th.deco === 'bricks') {
      for (let y = 0, row = 0; y < h; y += CELL, row++) {
        ctx.fillRect(0, y, w, 1.5);
        for (let x = (row % 2) * CELL * 1.5; x < w; x += CELL * 3) ctx.fillRect(x, y, 1.5, CELL);
      }
    } else if (th.deco === 'panes') {
      for (let x = 0; x < w; x += CELL * 4) ctx.fillRect(x, 0, 3, h);
      for (let y = 0; y < h; y += CELL * 4) ctx.fillRect(0, y, w, 3);
    } else if (th.deco === 'stars') {
      let s = 7; for (let i = 0; i < 90; i++) { s = (s * 9301 + 49297) % 233280; const x = s / 233280 * w; s = (s * 9301 + 49297) % 233280; const y = s / 233280 * h;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + (i % 5) * 0.08) + ')'; ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3) * 0.7, 0, TAU); ctx.fill(); }
    }
  }

  WW.sprites = { CELL, THEMES, worm, wormIcon, ball, gift, tack, bell, spring, ladder, solid, crumble, cannon, paintBg, rrect, circle };
})();
