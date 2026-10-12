/**
 * The sky over Amman, drawn on one canvas. Runs in a Web Worker on an OffscreenCanvas when the
 * browser supports it, or on the page otherwise.
 *
 * The page is one night. The top shows the sky now (or tonight from 21:00 in daylight) with the
 * constellations drawn in and named; scrolling eases the sky through the night to Amman's real
 * dawn. Moving the sky leaves long-exposure trails around Polaris. Twilight follows the Sun's
 * actual altitude: faint stars go first, the Milky Way fades, and the glow rises where the Sun
 * will. Shooting stars are rare at first and build into a shower at dawn, radiating from the
 * apex of Earth's motion (or a shower radiant on peak nights).
 *
 * Layers, back to front: dawn glow, Milky Way (cached, half resolution), constellation figures,
 * stars (on a trail buffer), bright-star glows, shooting stars.
 *
 * Reduced motion: a still sky at the top-of-page moment; no scroll rotation, draw-in, twinkle,
 * trails or shooting stars. Calm (article pages): a dim, still sky with rare shooting stars.
 */
import { constellationNames, showers } from '../../data/sky-names';
import { RAD, apex, night, siderealTime, sun, sunAltitude, type Night } from './astro';
import {
  centers,
  constellations,
  named,
  projectOne,
  segmentsA,
  segmentsB,
  starColor,
  starMag,
  stars,
  vertices,
  type View,
} from './catalog';
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

export type SkyEvent =
  /** Index into `starNames`; -1 hides the label. */
  | { type: 'hover'; index: number; x: number; y: number }
  /** Constellation labels to show now (keyed by IAU abbreviation). */
  | { type: 'labels'; items: { id: string; x: number; y: number; a: number }[] }
  /** The moment on screen; `start` at the top of the page; `dawn` runs 0 → 1 as the sky brightens. */
  | { type: 'time'; ms: number; start: boolean; mode: Night['mode']; dawn: number; shower: number };

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const STAR_COLORS = ['#b4c6ff', '#f2f4ff', '#fff3df', '#ffd3a3'];
const BRASS = '201,161,91';

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
  const trails = makeCanvas(1, 1);
  const tctx = trails.getContext('2d') as Ctx;
  const milky = makeCanvas(1, 1);
  const mctx = milky.getContext('2d') as Ctx;
  const milkySprite = softSprite(128, '205,215,255', 0.35);
  const glows = STAR_COLORS.map((c) => softSprite(32, hex(c)));
  const tipGlow = softSprite(32, BRASS);
  const meteors = createMeteors(makeCanvas);

  let w = 0, h = 0, dpr = 1;
  let view: View = { cx: 0, cy: 0, R: 1 };
  let reduced = false, calm = false, visible = true, started = false;
  let theNight = night();
  let target = 0, progress = 0;
  let lst = NaN, mwLst = NaN;
  let introAt = 0, frame = 0, last = 0, spawnDebt = 0, nextFireball = rand(3, 6);
  // labelsDirty: re-send labels even if nothing moved (first frame, resize, settings change)
  let hovered = -1, lastMinute = -1, labelsShown = false, labelsDirty = true;
  const delays = new Float32Array(constellations.length);
  let drawInEnd = 0;

  const moment = () => theNight.start + progress * (theNight.end - theNight.start);

  function size(c: Canvas, cw: number, ch: number) {
    c.width = Math.max(1, Math.round(cw));
    c.height = Math.max(1, Math.round(ch));
  }

  // Previous star positions, so a turning sky draws continuous arcs instead of dotted ones
  const prevX = new Float32Array(stars.length);
  const prevY = new Float32Array(stars.length);
  let streak = false;
  let trailKeep = 0;

  function reproject(continuous: boolean) {
    prevX.set(stars.x);
    prevY.set(stars.y);
    streak = continuous;
    stars.project(lst, view);
    vertices.project(lst, view);
    centers.project(lst, view);
    named.project(lst, view);
  }

  // Figures draw in rippling outward from the zenith, each segment in turn
  function planDrawIn() {
    drawInEnd = 0;
    constellations.forEach((c, k) => {
      const d = Math.hypot(centers.x[k] - view.cx, centers.y[k] - view.cy) / view.R;
      delays[k] = 0.3 + d * 1.9;
      drawInEnd = Math.max(drawInEnd, delays[k] + (c.last - c.first) * 0.07 + 0.3);
    });
  }

  function drawConstellations(alpha: number, elapsed: number) {
    if (alpha < 0.005) return;
    const tips: number[] = [];
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = `rgba(${BRASS},${alpha})`;
    ctx.beginPath();
    constellations.forEach((c, k) => {
      for (let s = c.first; s < c.last; s++) {
        const t = (elapsed - delays[k] - (s - c.first) * 0.07) / 0.3;
        if (t <= 0) break;
        const a = segmentsA[s];
        const b = segmentsB[s];
        if (vertices.u[a] < 0.02 || vertices.u[b] < 0.02) continue;
        const f = t >= 1 ? 1 : t * t * (3 - 2 * t);
        const bx = vertices.x[a] + (vertices.x[b] - vertices.x[a]) * f;
        const by = vertices.y[a] + (vertices.y[b] - vertices.y[a]) * f;
        ctx.moveTo(vertices.x[a], vertices.y[a]);
        ctx.lineTo(bx, by);
        if (f < 1) tips.push(bx, by);
      }
    });
    ctx.stroke();
    // A small brass spark at the tip of each line while it is being drawn
    for (let i = 0; i < tips.length; i += 2) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(tipGlow, tips[i] - 7, tips[i + 1] - 7, 14, 14);
    }
    ctx.globalAlpha = 1;
  }

  function drawStars(time: number, limit: number, dim: number) {
    // Moving stars are drawn as strokes from their previous position, batched by color,
    // brightness and size so a full-sky long exposure stays a few dozen draw calls
    const strokes = new Map<number, Path2D>();
    for (let i = 0; i < stars.length; i++) {
      const mag = starMag[i];
      if (mag > limit) break; // the catalog is sorted brightest first
      const u = stars.u[i];
      if (u < 0) continue;
      const twinkle = reduced || mag < 1 ? 1 : 0.78 + 0.22 * Math.sin(time * (1.2 + (i % 7) * 0.25) + starPhase[i]);
      // Stars near the limit fade out rather than pop, faintest first as dawn comes
      const fade = clamp((limit - mag) / 0.8);
      const alpha = clamp(1.15 - 0.13 * mag, 0.3, 1) * smooth(0, 0.18, u) * twinkle * fade * dim;
      if (alpha <= 0.01) continue;
      const r = Math.max(0.6, 2.3 - 0.34 * mag);
      const x = stars.x[i];
      const y = stars.y[i];
      if (streak && Math.abs(x - prevX[i]) + Math.abs(y - prevY[i]) > 0.4) {
        const level = Math.max(1, Math.round(alpha * 7));
        const size = r < 1 ? 0 : r < 1.6 ? 1 : 2;
        const key = (starColor[i] * 8 + level) * 3 + size;
        let path = strokes.get(key);
        if (!path) strokes.set(key, (path = new Path2D()));
        path.moveTo(prevX[i], prevY[i]);
        path.lineTo(x, y);
      } else {
        tctx.globalAlpha = alpha;
        tctx.fillStyle = STAR_COLORS[starColor[i]];
        if (r < 1) {
          tctx.fillRect(x - r, y - r, r * 2, r * 2);
        } else {
          tctx.beginPath();
          tctx.arc(x, y, r, 0, Math.PI * 2);
          tctx.fill();
        }
      }
      if (mag < 2.2) {
        const g = r * 8;
        ctx.globalAlpha = alpha * 0.9;
        ctx.drawImage(glows[starColor[i]], x - g / 2, y - g / 2, g, g);
      }
    }
    tctx.lineCap = 'round';
    strokes.forEach((path, key) => {
      const size = key % 3;
      const rest = (key - size) / 3;
      const level = rest % 8;
      tctx.globalAlpha = level / 7;
      tctx.strokeStyle = STAR_COLORS[(rest - level) / 8];
      tctx.lineWidth = [1.2, 2, 3][size];
      tctx.stroke(path);
    });
    tctx.globalAlpha = 1;
    ctx.globalAlpha = 1;
  }

  function labels(elapsed: number, p: number, sunAlt: number, moved: boolean) {
    const base = calm ? 0 : (1 - smooth(0.05, 0.17, p)) * (1 - smooth(-12, -6, sunAlt));
    const animating = elapsed < drawInEnd + 1.5;
    if (!moved && !animating && !labelsDirty) return;
    labelsDirty = false;
    const items: { id: string; x: number; y: number; a: number }[] = [];
    if (base > 0.01) {
      constellations.forEach((c, k) => {
        if (!constellationNames[c.id] || centers.u[k] < 0.12) return;
        const a = base * smooth(delays[k] + 0.6, delays[k] + 1.4, elapsed) * clamp((centers.u[k] - 0.12) * 6);
        if (a > 0.01) items.push({ id: c.id, x: centers.x[k], y: centers.y[k], a });
      });
    }
    if (items.length || labelsShown) emit({ type: 'labels', items });
    labelsShown = items.length > 0;
  }

  function render(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (!reduced && !calm) progress += (target - progress) * (1 - Math.exp(-dt * 4.5));
    const p = progress;
    const t = moment();
    const nextLst = siderealTime(t);
    const jump = Number.isNaN(lst);
    const deltaDeg = jump ? 0 : Math.abs(nextLst - lst) / RAD;
    const moved = jump || deltaDeg > 1e-6;
    if (moved) {
      lst = nextLst;
      reproject(!jump);
    } else {
      streak = false;
    }

    const sunAlt = sunAltitude(t);
    const limit = 5.2 - 4.4 * smooth(-16, -4, sunAlt);
    const dawn = smooth(-18, -4, sunAlt);
    const dim = calm ? 0.5 : 1 - 0.3 * smooth(0.04, 0.14, p);
    const elapsed = reduced || calm ? 1e9 : (now - introAt) / 1000;

    ctx.clearRect(0, 0, w, h);

    if (dawn > 0.001) {
      const s = sun(t);
      const at = projectOne(s.ra, s.dec, lst, view);
      const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, view.R * 1.3);
      g.addColorStop(0, `rgba(240,163,94,${0.6 * dawn})`);
      g.addColorStop(0.4, `rgba(196,120,140,${0.22 * dawn})`);
      g.addColorStop(1, 'rgba(26,34,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const milkyFade = (1 - smooth(-18, -10, sunAlt)) * dim;
    if (milkyFade > 0.01) {
      if (Math.abs(lst - mwLst) > 0.002 || Number.isNaN(mwLst)) {
        mctx.clearRect(0, 0, milky.width, milky.height);
        drawMilkyWay(mctx, milkySprite, lst, view, 0.5);
        mwLst = lst;
      }
      ctx.globalAlpha = milkyFade;
      ctx.drawImage(milky, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    const lineAlpha = (calm ? 0.05 : 0.07 + 0.27 * (1 - smooth(0, 0.22, p))) * (1 - smooth(-12, -5, sunAlt));
    drawConstellations(lineAlpha, elapsed);

    // Long exposure: while the sky turns, older frames fade slowly so stars leave arcs; when it
    // stops, the arcs fade out over a moment instead of vanishing
    const keepTarget = reduced || calm ? 0 : clamp(deltaDeg * 4, 0, 0.965);
    trailKeep = Math.max(keepTarget, trailKeep - dt * 2.2);
    if (trailKeep < 0.01) {
      tctx.clearRect(0, 0, w, h);
    } else {
      tctx.globalCompositeOperation = 'destination-out';
      tctx.fillStyle = `rgba(0,0,0,${1 - trailKeep})`;
      tctx.fillRect(0, 0, w, h);
      tctx.globalCompositeOperation = 'source-over';
    }
    drawStars(now / 1000, limit, dim);
    ctx.drawImage(trails, 0, 0, w, h);

    if (hovered >= 0) {
      ctx.strokeStyle = `rgba(${BRASS},0.9)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(named.x[hovered], named.y[hovered], 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (!reduced) {
      const shower = showers[theNight.shower];
      const sr = shower && projectOne(shower.ra * RAD, shower.dec * RAD, lst, view);
      const showerUp = !!sr && sr.u > 0.05;
      const ap = apex(t);
      const radiant = showerUp ? sr : projectOne(ap.ra, ap.dec, lst, view);
      const area = clamp((w * h) / (1440 * 900), 0.4, 1.5);
      // Rare at the top, building into a shower over Amman at dawn
      const rate = calm ? 0.08 * area : (0.08 + 11 * smooth(0.5, 0.97, p) ** 1.5) * area * (showerUp ? 1.6 : 1);
      spawnDebt += dt * rate;
      while (spawnDebt >= 1) {
        // Sporadic meteors come from a broad region around the apex; shower meteors from a point
        const spread = showerUp ? 0.03 : 0.3;
        meteors.spawn(w, h, radiant.x + rand(-spread, spread) * view.R, radiant.y + rand(-spread, spread) * view.R);
        spawnDebt -= 1;
      }
      if (!calm && p > 0.7) {
        nextFireball -= dt;
        if (nextFireball <= 0) {
          meteors.spawn(w, h, radiant.x, radiant.y, true);
          nextFireball = rand(2, 4.5);
        }
      }
      meteors.update(dt);
      meteors.draw(ctx, calm ? 0.6 : 1);
    }

    labels(elapsed, p, sunAlt, moved);
    const minute = Math.floor(t / 60_000) * 2 + (p < 0.003 ? 1 : 0);
    if (minute !== lastMinute) {
      lastMinute = minute;
      emit({
        type: 'time',
        ms: t,
        start: p < 0.003,
        mode: theNight.mode,
        dawn: smooth(-12, -4, sunAlt),
        shower: theNight.shower,
      });
    }
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
          introAt = performance.now();
        // falls through
        case 'resize':
          w = msg.width;
          h = msg.height;
          dpr = msg.dpr;
          // The horizon circle passes through the corners of the viewport
          view = { cx: w / 2, cy: h / 2, R: Math.hypot(w, h) / 2 };
          size(canvas, w * dpr, h * dpr);
          size(trails, w * dpr, h * dpr);
          size(milky, w / 2, h / 2);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          mwLst = NaN;
          lst = siderealTime(moment());
          reproject(false);
          tctx.clearRect(0, 0, w, h);
          planDrawIn();
          labelsDirty = true;
          started = true;
          break;
        case 'scroll':
          target = clamp(msg.progress);
          if (reduced || calm) return;
          if (!visible) render(performance.now());
          return;
        case 'motion':
          reduced = msg.reduced;
          if (reduced) progress = target = 0;
          lst = NaN;
          labelsDirty = true;
          break;
        case 'visible':
          visible = msg.visible;
          if (visible) {
            theNight = night();
            lst = NaN;
            labelsDirty = true;
          }
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
