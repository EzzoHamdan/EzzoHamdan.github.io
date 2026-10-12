/**
 * The sky over Amman, drawn on one canvas. Runs in a Web Worker on an OffscreenCanvas when the
 * browser supports it, or on the page otherwise.
 *
 * Layers, back to front:
 * 1. Real stars to magnitude 5 and constellation lines, positioned for Amman at the moment from
 *    `skyMoment()` and projected like an astrolabe (stereographic, zenith at the center, north
 *    up, east on the left as when looking up). Scrolling the page advances the night by 6 hours.
 * 2. Shooting stars in the original style: colored heads with a two-ring glow and a fading
 *    trail, travelling down-left at 45°. On meteor-shower nights they also radiate from the
 *    shower's real radiant.
 *
 * Reduced motion: a still sky with no shooting stars and no twinkle.
 */
import sky from '../data/sky.json';
import { showers } from '../data/star-names';
import { AMMAN, siderealTime, skyMoment } from './sky-time';

export type SkyMessage =
  | { type: 'init'; canvas?: OffscreenCanvas; width: number; height: number; dpr: number; reducedMotion: boolean }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'scroll'; progress: number }
  | { type: 'motion'; reduced: boolean }
  | { type: 'visible'; visible: boolean }
  | { type: 'intro'; x: number; y: number }
  | { type: 'pointer'; x: number; y: number }
  | { type: 'pointer-leave' };

/** Index into `starNames`, with screen position; `index: -1` hides the label. */
export type SkyEvent = { type: 'hover'; index: number; x: number; y: number };

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const RAD = Math.PI / 180;
const SIN_LAT = Math.sin(AMMAN.lat * RAD);
const COS_LAT = Math.cos(AMMAN.lat * RAD);
const NIGHT_SPAN = 6 * 3_600_000;

const STAR_COLORS = ['#b4c6ff', '#f2f4ff', '#fff3df', '#ffd3a3'];
const METEOR_COLORS = ['255,255,255', '190,210,255', '201,161,91', '150,220,240', '225,160,210'];
const BRASS = 'rgba(201,161,91,';
const DIR = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
const SPRITE = 64;

interface Meteor {
  x: number; y: number; vx: number; vy: number; dx: number; dy: number;
  age: number; life: number; trail: number; size: number; depth: number; sprite: number;
}

const raf: (cb: (t: number) => void) => number =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame.bind(globalThis)
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
const caf: (id: number) => void =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame.bind(globalThis) : clearTimeout;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Opacity envelope of the original CSS keyframes: in by 40%, out by 85%. */
const envelope = (p: number) => (p < 0.4 ? p / 0.4 : p < 0.85 ? 1 - (p - 0.4) / 0.45 : 0);

function canvas2d(size: number): [Canvas, Ctx] {
  const c: Canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size });
  return [c, c.getContext('2d') as Ctx];
}

function meteorSprite(color: string): Canvas {
  const [c, g] = canvas2d(SPRITE);
  const m = SPRITE / 2;
  const glow = g.createRadialGradient(m, m, 0, m, m, m);
  glow.addColorStop(0, `rgba(${color},0.9)`);
  glow.addColorStop(0.25, `rgba(${color},0.35)`);
  glow.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = glow;
  g.fillRect(0, 0, SPRITE, SPRITE);
  g.fillStyle = `rgba(${color},0.1)`;
  for (const r of [10, 6]) {
    g.beginPath();
    g.arc(m, m, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = `rgb(${color})`;
  g.beginPath();
  g.arc(m, m, 3, 0, Math.PI * 2);
  g.fill();
  return c;
}

function starGlow(color: string): Canvas {
  const [c, g] = canvas2d(32);
  const glow = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, color);
  glow.addColorStop(0.2, color + '66');
  glow.addColorStop(1, color + '00');
  g.fillStyle = glow;
  g.fillRect(0, 0, 32, 32);
  return c;
}

// Catalog, prepared once: right ascension and the sine/cosine of declination
const N = sky.stars.length;
const starRa = new Float32Array(N);
const starSinDec = new Float32Array(N);
const starCosDec = new Float32Array(N);
const starMag = new Float32Array(N);
const starColor = new Uint8Array(N);
const starPhase = new Float32Array(N);
sky.stars.forEach(([ra, dec, mag, color], i) => {
  starRa[i] = ra * RAD;
  starSinDec[i] = Math.sin(dec * RAD);
  starCosDec[i] = Math.cos(dec * RAD);
  starMag[i] = mag;
  starColor[i] = color;
  starPhase[i] = Math.random() * Math.PI * 2;
});

export function createSky(canvas: Canvas, emit: (event: SkyEvent) => void = () => {}) {
  const ctx = canvas.getContext('2d') as Ctx;
  const meteorSprites = METEOR_COLORS.map(meteorSprite);
  const glows = STAR_COLORS.map(starGlow);

  let w = 0, h = 0, dpr = 1, cx = 0, cy = 0, R = 1;
  let reduced = false, visible = true, started = false;
  let frame = 0, last = 0, spawnDebt = 0, nextBolide = rand(6, 12);
  let progress = 0;
  let moment = skyMoment();
  let meteors: Meteor[] = [];
  let hovered = -1;

  // Projected positions; u is height above the horizon (sine of altitude)
  const sx = new Float32Array(N), sy = new Float32Array(N), su = new Float32Array(N);
  const named = sky.named.map(() => ({ x: 0, y: 0, u: -1 }));
  let lines: { x: number; y: number; u: number }[][] = [];
  let radiant = { x: 0, y: 0, u: -1 };

  function project(ra: number, sinDec: number, cosDec: number, lst: number) {
    const H = lst - ra;
    const cosH = Math.cos(H);
    const e = -cosDec * Math.sin(H);
    const n = sinDec * COS_LAT - cosDec * cosH * SIN_LAT;
    const u = sinDec * SIN_LAT + cosDec * cosH * COS_LAT;
    const k = R / (1 + u);
    return { x: cx - e * k, y: cy - n * k, u };
  }
  const projectDeg = (ra: number, dec: number, lst: number) =>
    project(ra * RAD, Math.sin(dec * RAD), Math.cos(dec * RAD), lst);

  function reproject() {
    const lst = siderealTime(moment.time + progress * NIGHT_SPAN);
    for (let i = 0; i < N; i++) {
      const p = project(starRa[i], starSinDec[i], starCosDec[i], lst);
      sx[i] = p.x;
      sy[i] = p.y;
      su[i] = p.u;
    }
    sky.named.forEach((s, i) => (named[i] = projectDeg(s.ra, s.dec, lst)));
    lines = sky.lines.map((flat) => {
      const pts = [];
      for (let j = 0; j < flat.length; j += 2) pts.push(projectDeg(flat[j], flat[j + 1], lst));
      return pts;
    });
    const shower = showers[moment.shower];
    radiant = shower ? projectDeg(shower.ra, shower.dec, lst) : { x: 0, y: 0, u: -1 };
  }

  function drawSky(t: number) {
    // Full sky behind the hero, calmer behind reading sections, fading at the footer dawn
    const dawn = (1 - 0.35 * smooth(0.04, 0.14, progress)) * (1 - 0.65 * smooth(0.82, 1, progress));

    ctx.lineWidth = 0.7;
    ctx.strokeStyle = `${BRASS}${0.075 * dawn})`;
    ctx.beginPath();
    for (const pts of lines) {
      for (let j = 1; j < pts.length; j++) {
        const a = pts[j - 1], b = pts[j];
        if (a.u < 0.02 || b.u < 0.02) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
    }
    ctx.stroke();

    for (let i = 0; i < N; i++) {
      const u = su[i];
      if (u < 0) continue;
      const mag = starMag[i];
      const twinkle = reduced || mag < 1 ? 1 : 0.78 + 0.22 * Math.sin(t * (1.2 + (i % 7) * 0.25) + starPhase[i]);
      // Fainter near the horizon, as through more atmosphere
      const alpha = Math.min(1, Math.max(0.3, 1.15 - 0.13 * mag)) * smooth(0, 0.18, u) * twinkle * dawn;
      if (alpha <= 0.01) continue;
      const r = Math.max(0.6, 2.3 - 0.34 * mag);
      ctx.globalAlpha = alpha;
      if (mag < 2.2) {
        const g = r * 8;
        ctx.drawImage(glows[starColor[i]], sx[i] - g / 2, sy[i] - g / 2, g, g);
      }
      ctx.fillStyle = STAR_COLORS[starColor[i]];
      if (r < 1) {
        ctx.fillRect(sx[i] - r, sy[i] - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(sx[i], sy[i], r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (hovered >= 0) {
      const s = named[hovered];
      ctx.strokeStyle = `${BRASS}0.9)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function spawn(opts: { bolide?: boolean; x?: number; y?: number; fromRadiant?: boolean } = {}) {
    const depth = opts.bolide ? 1.25 : rand(0.35, 1);
    const sprite = opts.bolide ? 0 : Math.floor(Math.random() * METEOR_COLORS.length);
    let x: number, y: number, dx = DIR.x, dy = DIR.y;
    if (opts.fromRadiant) {
      // Shower meteors start some distance from the radiant and fly straight away from it
      const angle = rand(0, Math.PI * 2);
      const dist = rand(40, Math.max(w, h) * 0.45);
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      x = radiant.x + dx * dist;
      y = radiant.y + dy * dist;
    } else {
      const fromTop = Math.random() < w / (w + h);
      x = opts.x ?? (fromTop ? rand(0.1 * w, 1.3 * w) : w + rand(0, 80));
      y = opts.y ?? (fromTop ? rand(-80, 0.25 * h) : rand(0, 0.6 * h));
    }
    const life = opts.bolide ? 2.4 : rand(1.2, 6) / (0.6 + depth * 0.6);
    const speed = (opts.bolide ? 900 : 1000 / life) * (0.6 + depth * 0.4);
    meteors.push({
      x, y, dx, dy,
      vx: dx * speed,
      vy: dy * speed,
      age: 0,
      life,
      trail: (opts.bolide ? 520 : 300) * (0.45 + depth * 0.55),
      size: (opts.bolide ? 44 : 30) * (0.45 + depth * 0.55),
      depth,
      sprite,
    });
  }

  function drawMeteors(dt: number) {
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.age += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const p = m.age / m.life;
      if (p >= 1) {
        meteors.splice(i, 1);
        continue;
      }
      const a = envelope(p) * (0.55 + m.depth * 0.45);
      if (a <= 0) continue;
      const color = METEOR_COLORS[m.sprite];
      const tx = m.x - m.dx * m.trail;
      const ty = m.y - m.dy * m.trail;
      const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
      grad.addColorStop(0, `rgba(${color},${a})`);
      grad.addColorStop(1, `rgba(${color},0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.6 + m.depth * 0.8;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.drawImage(meteorSprites[m.sprite], m.x - m.size / 2, m.y - m.size / 2, m.size, m.size);
      ctx.globalAlpha = 1;
    }
  }

  function render(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    ctx.clearRect(0, 0, w, h);
    drawSky(now / 1000);
    if (reduced) return;
    const shower = radiant.u > 0.05;
    const rate = Math.max(1.5, Math.min(8, 6.7 * ((w * h) / (1440 * 900)))) * (shower ? 2.5 : 1);
    spawnDebt += dt * rate;
    while (spawnDebt >= 1) {
      spawn({ fromRadiant: shower && Math.random() < 0.7 });
      spawnDebt -= 1;
    }
    nextBolide -= dt;
    if (nextBolide <= 0) {
      spawn({ bolide: true });
      nextBolide = rand(9, 16);
    }
    drawMeteors(dt);
  }

  function loop(now: number) {
    render(now);
    frame = raf(loop);
  }

  function sync() {
    caf(frame);
    if (!started) return;
    if (reduced || !visible) {
      meteors = [];
      render(performance.now());
      return;
    }
    last = performance.now();
    frame = raf(loop);
  }

  function updateHover(x: number, y: number) {
    let best = -1, bestDist = 22 * 22;
    named.forEach((s, i) => {
      if (s.u < 0.03) return;
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best === hovered) return;
    hovered = best;
    emit({ type: 'hover', index: best, x: best >= 0 ? named[best].x : 0, y: best >= 0 ? named[best].y : 0 });
    if (reduced || !visible) render(performance.now());
  }

  return {
    handle(msg: SkyMessage) {
      switch (msg.type) {
        case 'init':
          reduced = msg.reducedMotion;
        // falls through
        case 'resize':
          w = msg.width;
          h = msg.height;
          dpr = msg.dpr;
          cx = w / 2;
          cy = h / 2;
          // The horizon circle passes through the corners of the viewport
          R = Math.hypot(w, h) / 2;
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          moment = skyMoment();
          reproject();
          started = true;
          break;
        case 'scroll':
          if (reduced) return;
          progress = msg.progress;
          reproject();
          if (!visible) render(performance.now());
          return;
        case 'motion':
          reduced = msg.reduced;
          if (reduced) progress = 0;
          reproject();
          break;
        case 'visible':
          visible = msg.visible;
          if (visible) {
            moment = skyMoment();
            reproject();
          }
          break;
        case 'intro':
          if (!reduced) {
            // A bolide whose path crosses the given point about 0.7 s after it appears
            const lead = 0.7 * 900 * 1.1;
            spawn({ bolide: true, x: msg.x - DIR.x * lead, y: msg.y - DIR.y * lead });
          }
          return;
        case 'pointer':
          updateHover(msg.x, msg.y);
          return;
        case 'pointer-leave':
          updateHover(-1e4, -1e4);
          return;
      }
      sync();
    },
  };
}
