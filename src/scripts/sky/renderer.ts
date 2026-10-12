/**
 * The sky over Amman, drawn on one canvas. Runs in a Web Worker on an OffscreenCanvas when the
 * browser supports it, or on the page otherwise.
 *
 * A still, real sky: stars to magnitude 5 and the Milky Way where they are over Amman right now
 * (or tonight at 21:00 in daylight), twinkling, with shooting stars on top. Scrolling never moves
 * the stars, so text stays easy to read; it only dims them behind reading sections, fades them
 * toward the dawn footer, and brings more shooting stars toward the end of the page.
 *
 * Reduced motion: a still sky with no twinkle and no shooting stars.
 * Calm (article pages): a dimmer sky with rare shooting stars.
 */
import { night, siderealTime } from './astro';
import { named, starColor, starMag, stars, type View } from './catalog';
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
  | { type: 'pointer-leave' };

/** Index into `starNames`, with its screen position; `index: -1` hides the label. */
export type SkyEvent = { type: 'hover'; index: number; x: number; y: number };

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const STAR_COLORS = ['#b4c6ff', '#f2f4ff', '#fff3df', '#ffd3a3'];
const MINUTE = 60_000;

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
  const meteors = createMeteors(makeCanvas);

  let w = 0, h = 0, dpr = 1;
  let view: View = { cx: 0, cy: 0, R: 1 };
  let reduced = false, calm = false, visible = true, started = false;
  let moment = night();
  let projectedAt = 0;
  let target = 0, progress = 0;
  let frame = 0, last = 0, spawnDebt = 0, nextBolide = rand(6, 12);
  let hovered = -1;

  // Positions are for one moment; refresh each minute so a long visit stays "right now"
  function project() {
    moment = night();
    projectedAt = Date.now();
    const lst = siderealTime(moment.time);
    stars.project(lst, view);
    named.project(lst, view);
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

  function render(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (Date.now() - projectedAt > MINUTE) project();
    // Ease the scroll position so dimming and fading never jump
    progress += (target - progress) * (1 - Math.exp(-dt * 6));
    const p = calm ? 0 : progress;
    // Full sky behind the hero, calmer behind reading sections, fading into the footer dawn
    const dim = calm ? 0.5 : (1 - 0.3 * smooth(0.04, 0.14, p)) * (1 - 0.65 * smooth(0.82, 1, p));

    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 0.9 * dim;
    ctx.drawImage(milky, 0, 0, w, h);
    ctx.globalAlpha = 1;
    drawStars(now / 1000, dim);

    if (hovered >= 0) {
      ctx.strokeStyle = 'rgba(201,161,91,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(named.x[hovered], named.y[hovered], 9, 0, Math.PI * 2);
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
    let best = -1;
    let bestDist = 22 * 22;
    for (let i = 0; i < named.length; i++) {
      if (named.u[i] < 0.03) continue;
      const d = (named.x[i] - x) ** 2 + (named.y[i] - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best === hovered) return;
    hovered = best;
    emit({ type: 'hover', index: best, x: best >= 0 ? named.x[best] : 0, y: best >= 0 ? named.y[best] : 0 });
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
      }
      sync();
    },
  };
}
