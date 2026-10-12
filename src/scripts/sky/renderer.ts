/**
 * The sky over Amman, drawn on one canvas. Runs in a Web Worker on an OffscreenCanvas when the
 * browser supports it, or on the page otherwise.
 *
 * A still, real sky: stars to magnitude 5, the naked-eye planets and the Milky Way where they are
 * over Amman right now (or tonight at 21:00 in daylight), with shooting stars on top. Stars
 * twinkle; planets shine steadily, as they do in the real sky.
 *
 * Scrolling never moves anything in the sky, so text stays easy to read. It only changes the
 * atmosphere (dusk at the top, deep midnight while reading, dawn at the end), how bright the
 * sky is, and how many shooting stars fall. Clicking empty sky makes a wish: a shooting star
 * launches from that point.
 *
 * Reduced motion: a still sky with no twinkle, no shooting stars and no wishes.
 * Calm (article pages): a dimmer midnight sky with rare shooting stars.
 */
import { PLANETS, night, planets, siderealTime } from './astro';
import { named, projectOne, starColor, starMag, stars, type View } from './catalog';
import { createMeteors } from './meteors';
import { drawMilkyWay } from './milky-way';

export type SkyMessage =
  | {
      type: 'init';
      canvas?: OffscreenCanvas;
      width: number;
      height: number;
      dpr: number;
      reducedMotion: boolean;
      calm?: boolean;
    }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'scroll'; progress: number }
  | { type: 'motion'; reduced: boolean }
  | { type: 'visible'; visible: boolean }
  | { type: 'pointer'; x: number; y: number }
  | { type: 'pointer-leave' }
  | { type: 'wish'; x: number; y: number };

/**
 * What the pointer is over: a star (index into `starNames`) or a planet (index into `PLANETS`),
 * with its screen position; `index: -1` hides the label.
 */
export type SkyEvent = { type: 'hover'; kind: 'star' | 'planet'; index: number; x: number; y: number };

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const STAR_COLORS = ['#b4c6ff', '#f2f4ff', '#fff3df', '#ffd3a3'];
const PLANET_COLORS: Record<(typeof PLANETS)[number], string> = {
  mercury: '#d9d4cc',
  venus: '#fff6dc',
  mars: '#ff9a6b',
  jupiter: '#ffe9c9',
  saturn: '#f5dca0',
};
const MINUTE = 60_000;

/**
 * The atmosphere along the page: [scroll position, sky color at the top, color at the bottom].
 * Dusk afterglow at the top, deep midnight while reading, then pre-dawn and dawn at the end.
 */
const ATMOSPHERE: [number, number[], number[]][] = [
  [0, [12, 18, 46], [44, 32, 82]],
  [0.12, [7, 11, 26], [22, 28, 64]],
  [0.75, [6, 9, 22], [18, 24, 56]],
  [0.9, [10, 14, 34], [58, 40, 74]],
  [1, [16, 24, 56], [118, 74, 70]],
];

function atmosphere(p: number) {
  let i = 1;
  while (i < ATMOSPHERE.length - 1 && ATMOSPHERE[i][0] < p) i++;
  const [p0, top0, low0] = ATMOSPHERE[i - 1];
  const [p1, top1, low1] = ATMOSPHERE[i];
  const t = Math.min(1, Math.max(0, (p - p0) / (p1 - p0)));
  const mix = (a: number[], b: number[], k: number) => a.map((v, j) => Math.round(v + (b[j] - v) * k));
  const top = mix(top0, top1, t);
  const low = mix(low0, low1, t);
  return { top: `rgb(${top})`, mid: `rgb(${mix(top, low, 0.25)})`, low: `rgb(${low})` };
}

const raf: (cb: (t: number) => void) => number =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame.bind(globalThis)
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
const caf: (id: number) => void =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame.bind(globalThis) : clearTimeout;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function makeCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

function softSprite(size: number, rgb: string, core = 0.2): Canvas {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d') as Ctx;
  const m = size / 2;
  const grad = g.createRadialGradient(m, m, 0, m, m, m);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(core, `rgba(${rgb},0.4)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
const starPhase = Float32Array.from({ length: stars.length }, () => Math.random() * Math.PI * 2);

export function createSky(canvas: Canvas, emit: (event: SkyEvent) => void = () => {}) {
  const ctx = canvas.getContext('2d') as Ctx;
  const milky = makeCanvas(1, 1);
  const mctx = milky.getContext('2d') as Ctx;
  const milkySprite = softSprite(128, '205,215,255', 0.35);
  const glows = STAR_COLORS.map((c) => softSprite(32, hex(c)));
  const planetGlows = Object.fromEntries(
    PLANETS.map((k) => [k, softSprite(48, hex(PLANET_COLORS[k]), 0.15)]),
  ) as Record<(typeof PLANETS)[number], Canvas>;
  const meteors = createMeteors(makeCanvas);

  let w = 0, h = 0, dpr = 1;
  let view: View = { cx: 0, cy: 0, R: 1 };
  let reduced = false, calm = false, visible = true, started = false;
  let moment = night();
  let projectedAt = 0;
  let target = 0, progress = 0;
  let frame = 0, last = 0, spawnDebt = 0, nextBolide = rand(6, 12);
  let hovered = { kind: 'star' as 'star' | 'planet', index: -1 };
  let planetsNow: { key: (typeof PLANETS)[number]; x: number; y: number; u: number; mag: number }[] = [];

  // Positions are for one moment; refresh each minute so a long visit stays "right now"
  function project() {
    moment = night();
    projectedAt = Date.now();
    const lst = siderealTime(moment.time);
    stars.project(lst, view);
    named.project(lst, view);
    planetsNow = planets(moment.time).map((pl) => ({ key: pl.key, mag: pl.mag, ...projectOne(pl.ra, pl.dec, lst, view) }));
    mctx.clearRect(0, 0, milky.width, milky.height);
    drawMilkyWay(mctx, milkySprite, lst, view, 0.5);
  }

  function drawStars(time: number, dim: number) {
    for (let i = 0; i < stars.length; i++) {
      const u = stars.u[i];
      if (u < 0) continue;
      const mag = starMag[i];
      const twinkle = reduced || mag < 1 ? 1 : 0.78 + 0.22 * Math.sin(time * (1.2 + (i % 7) * 0.25) + starPhase[i]);
      // Fainter near the horizon, as through more atmosphere
      const alpha = clamp(1.15 - 0.13 * mag, 0.3, 1) * smooth(0, 0.18, u) * twinkle * dim;
      if (alpha <= 0.01) continue;
      const r = Math.max(0.6, 2.3 - 0.34 * mag);
      const x = stars.x[i];
      const y = stars.y[i];
      ctx.globalAlpha = alpha;
      if (mag < 2.2) {
        const g = r * 8;
        ctx.drawImage(glows[starColor[i]], x - g / 2, y - g / 2, g, g);
      }
      ctx.fillStyle = STAR_COLORS[starColor[i]];
      if (r < 1) {
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Planets shine steadily (no twinkle), slightly larger and warmer than stars of equal brightness
  function drawPlanets(dim: number) {
    for (const pl of planetsNow) {
      if (pl.u < 0.02) continue;
      const alpha = Math.min(1, 1.1 - 0.12 * pl.mag) * Math.min(1, pl.u * 6) * dim;
      const r = Math.min(3.4, Math.max(1.6, 2.6 - 0.35 * pl.mag));
      const g = r * 9;
      ctx.globalAlpha = alpha * 0.8;
      ctx.drawImage(planetGlows[pl.key], pl.x - g / 2, pl.y - g / 2, g, g);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = PLANET_COLORS[pl.key];
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (Date.now() - projectedAt > MINUTE) project();
    // Ease the scroll position so dimming and fading never jump
    progress += (target - progress) * (1 - Math.exp(-dt * 6));
    const p = calm ? 0 : progress;
    // Full sky behind the hero, calmer behind reading sections, fading into the footer dawn
    const dim = calm ? 0.5 : (1 - 0.3 * smooth(0.04, 0.14, p)) * (1 - 0.65 * smooth(0.82, 1, p));

    // The atmosphere: dusk at the top of the page, midnight while reading, dawn at the end
    const air = atmosphere(calm ? 0.4 : p);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, air.top);
    sky.addColorStop(0.55, air.mid);
    sky.addColorStop(1, air.low);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.9 * dim;
    ctx.drawImage(milky, 0, 0, w, h);
    ctx.globalAlpha = 1;
    drawStars(now / 1000, dim);
    drawPlanets(dim);

    if (hovered.index >= 0) {
      const at = hovered.kind === 'star' ? { x: named.x[hovered.index], y: named.y[hovered.index] } : planetsNow[hovered.index];
      ctx.strokeStyle = 'rgba(201,161,91,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(at.x, at.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (reduced) return;
    const area = clamp((w * h) / (1440 * 900), 0.4, 1.5);
    const shower = moment.shower >= 0 ? 1.5 : 1;
    // Rare at the top, building toward the end of the page, over Amman
    const rate = calm ? 0.08 * area : (0.25 + 9 * smooth(0.5, 0.97, p) ** 1.5) * area * shower;
    spawnDebt += dt * rate;
    while (spawnDebt >= 1) {
      meteors.spawn(w, h);
      spawnDebt -= 1;
    }
    nextBolide -= dt;
    if (nextBolide <= 0 && !calm) {
      meteors.spawn(w, h, true);
      nextBolide = p > 0.7 ? rand(4, 8) : rand(9, 16);
    }
    meteors.update(dt);
    meteors.draw(ctx, calm ? 0.6 : 1);
  }

  function loop(now: number) {
    render(now);
    frame = raf(loop);
  }

  function sync() {
    caf(frame);
    if (!started) return;
    if (reduced || !visible) {
      meteors.clear();
      render(performance.now());
      return;
    }
    last = performance.now();
    frame = raf(loop);
  }

  function hover(x: number, y: number) {
    let best = { kind: 'star' as 'star' | 'planet', index: -1, x: 0, y: 0 };
    let bestDist = 22 * 22;
    for (let i = 0; i < named.length; i++) {
      if (named.u[i] < 0.03) continue;
      const d = (named.x[i] - x) ** 2 + (named.y[i] - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'star', index: i, x: named.x[i], y: named.y[i] };
      }
    }
    planetsNow.forEach((pl, i) => {
      if (pl.u < 0.03) return;
      const d = (pl.x - x) ** 2 + (pl.y - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'planet', index: i, x: pl.x, y: pl.y };
      }
    });
    if (best.kind === hovered.kind && best.index === hovered.index) return;
    hovered = { kind: best.kind, index: best.index };
    emit({ type: 'hover', ...best });
    if (reduced || !visible) render(performance.now());
  }

  return {
    handle(msg: SkyMessage) {
      switch (msg.type) {
        case 'init':
          reduced = msg.reducedMotion;
          calm = !!msg.calm;
        // falls through
        case 'resize':
          w = msg.width;
          h = msg.height;
          dpr = msg.dpr;
          // The horizon circle passes through the corners of the viewport
          view = { cx: w / 2, cy: h / 2, R: Math.hypot(w, h) / 2 };
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          milky.width = Math.max(1, Math.round(w / 2));
          milky.height = Math.max(1, Math.round(h / 2));
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          project();
          started = true;
          break;
        case 'scroll':
          target = clamp(msg.progress);
          if (reduced || !visible) {
            progress = target;
            render(performance.now());
          }
          return;
        case 'motion':
          reduced = msg.reduced;
          break;
        case 'visible':
          visible = msg.visible;
          if (visible) project();
          break;
        case 'pointer':
          hover(msg.x, msg.y);
          return;
        case 'pointer-leave':
          hover(-1e4, -1e4);
          return;
        case 'wish':
          if (!reduced && visible) meteors.launch(msg.x, msg.y);
          return;
      }
      sync();
    },
  };
}
