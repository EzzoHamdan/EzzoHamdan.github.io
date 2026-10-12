/**
 * The sky for the galaxy journey (wide screens with motion allowed; see src/scripts/journey.ts for
 * the page side). Runs in the same Web Worker as the dome, on the same canvas.
 *
 * Scrolling flies a camera straight ahead through space, in one direction only: forward. No pans,
 * no rolls, so fast scrolling reads as faster flight, never as a camera swinging around.
 * - Takeoff: the hero shows the real stars over Amman, straight up. Each one is given a depth, so
 *   as the camera leaves, the real sky streams past and the atmosphere falls away (stars stop
 *   twinkling in space).
 * - The field: real and generated stars at depths up to FAR focal lengths, recycled endlessly, so
 *   the flight never runs out of stars.
 * - Galaxies: each section flies toward one (DESTINATIONS), seen far away behind its title, growing
 *   as its content is read, and passed close by on the way to the next. Its color tints the space
 *   around it.
 * - Warp: stars stretch into short streaks only while the camera is actually moving fast, which
 *   happens between stops, never while a stop holds still for reading.
 * - Landing: at the end the Milky Way, home, then dawn over Amman with shooting stars, some falling
 *   behind the skyline.
 *
 * The camera's position comes from the page every frame (`camera`), already eased, so the stars and
 * the text planes the page moves with CSS share one camera and one focal length.
 */
import { night, siderealTime } from './astro';
import { camera as skyCamera, starColor, starMag, stars } from './catalog';
import { createMeteors } from './meteors';
import { drawMilkyWay } from './milky-way';
import { paintGalaxy, type GalaxyKind } from './galaxies';

export type JourneyMessage =
  | {
      type: 'init';
      canvas?: OffscreenCanvas;
      mode: 'journey';
      width: number;
      height: number;
      dpr: number;
      reducedMotion: boolean;
    }
  | { type: 'resize'; width: number; height: number; dpr: number }
  /**
   * The route: focal length in pixels (the CSS perspective of the text planes), camera travel per
   * stop, the vanishing point's height, and the stops each section spans.
   */
  | { type: 'route'; focal: number; stride: number; cy: number; legs: { id: string; first: number; last: number }[] }
  /**
   * The camera now: distance travelled, its speed (per second), the position along the route in
   * stops, how far the final landing has come (0..1), and where the skyline's far hills are.
   */
  | { type: 'camera'; z: number; speed: number; u: number; end: number; horizonY: number }
  | { type: 'motion'; reduced: boolean }
  | { type: 'visible'; visible: boolean }
  | { type: 'wish'; x: number; y: number };

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const STAR_COLORS = ['#b4c6ff', '#f2f4ff', '#fff3df', '#ffd3a3'];
/** The star field's depth range, in focal lengths. */
const NEAR = 0.2;
const FAR = 30;
const GENERATED = 2600;
/** Faintest apparent magnitude drawn. */
const LIMIT = 6.6;
/** Exposure for warp streaks, in seconds of travel, and their longest length in pixels. */
const EXPOSURE = 0.03;
const MAX_STREAK = 60;

/** Each section's destination, the side of the route it lies on and the color of its space. */
const DESTINATIONS: Record<string, { kind: GalaxyKind; side: number; tint: number[] }> = {
  about: { kind: 'andromeda', side: 1, tint: [92, 74, 178] },
  experience: { kind: 'triangulum', side: -1, tint: [44, 124, 168] },
  projects: { kind: 'whirlpool', side: 1, tint: [160, 64, 136] },
  education: { kind: 'sombrero', side: -1, tint: [168, 124, 64] },
};
const HOME = { kind: 'milkyway' as GalaxyKind, tint: [150, 118, 96] };

// Sky colors, [top, bottom]: the night over Amman, open space, the hour before dawn, dawn
const NIGHT = [[9, 13, 32], [30, 30, 72]];
const SPACE = [[3, 4, 12], [7, 9, 22]];
const PREDAWN = [[10, 14, 34], [58, 40, 74]];
const DAWN = [[16, 24, 56], [118, 74, 70]];

interface Galaxy {
  kind: GalaxyKind;
  x: number;
  y: number;
  z: number;
  size: number;
  tint: number[];
  first: number;
  last: number;
  sprite?: Canvas;
}

const raf: (cb: (t: number) => void) => number =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame.bind(globalThis)
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
const caf: (id: number) => void =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame.bind(globalThis) : clearTimeout;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);
const rgb = (c: number[]) => `rgb(${c.map(Math.round).join(',')})`;

function makeCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

function softSprite(size: number, color: string, core = 0.2): Canvas {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d') as Ctx;
  const m = size / 2;
  const grad = g.createRadialGradient(m, m, 0, m, m, m);
  grad.addColorStop(0, `rgba(${color},1)`);
  grad.addColorStop(core, `rgba(${color},0.4)`);
  grad.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');

export function createJourney(canvas: Canvas, _emit: (event: never) => void = () => {}) {
  const ctx = canvas.getContext('2d') as Ctx;
  const glows = STAR_COLORS.map((c) => softSprite(32, hex(c)));
  const milky = makeCanvas(1, 1);
  const mctx = milky.getContext('2d') as Ctx;
  const milkySprite = softSprite(128, '205,215,255', 0.35);
  const meteors = createMeteors(makeCanvas);

  let w = 0, h = 0, dpr = 1;
  let F = 1000, stride = 4000, cx = 0, cy = 0;
  let z = 0, speed = 0, u = 0, end = 0, horizonY = NaN;
  let reduced = false, visible = true, started = false;
  let frame = 0, last = 0, spawnDebt = 0, nextBolide = rand(8, 14);
  let drawnKey = '';
  let galaxies: Galaxy[] = [];

  // The star field: position across the view (world units), depth when the camera is at 0, and
  // magnitude at that depth. The first `real` stars are the real sky over Amman.
  let real = 0;
  let X = new Float32Array(0), Y = new Float32Array(0), D0 = new Float32Array(0), M = new Float32Array(0);
  let C = new Uint8Array(0), phase = new Float32Array(0);

  function buildField() {
    // The hero's view: straight up from Amman, through a plain camera lens
    const view = skyCamera(w, h, 180, 90, 58, 0);
    const { time } = night();
    const lst = siderealTime(time);
    stars.project(lst, view);
    const ids: number[] = [];
    for (let i = 0; i < stars.length; i++) {
      if (stars.u[i] < 0.02 || starMag[i] > LIMIT) continue;
      if (stars.x[i] < -40 || stars.x[i] > w + 40 || stars.y[i] < -40 || stars.y[i] > h + 40) continue;
      ids.push(i);
    }
    real = ids.length;
    const n = real + GENERATED;
    X = new Float32Array(n);
    Y = new Float32Array(n);
    D0 = new Float32Array(n);
    M = new Float32Array(n);
    C = new Uint8Array(n);
    phase = Float32Array.from({ length: n }, () => Math.random() * Math.PI * 2);
    ids.forEach((s, k) => {
      // A real star keeps its place in the hero exactly: any depth projects it to the same point
      const d = F * (2.5 + 22 * Math.random() ** 1.4);
      X[k] = ((stars.x[s] - cx) * d) / F;
      Y[k] = ((stars.y[s] - cy) * d) / F;
      D0[k] = d;
      M[k] = starMag[s];
      C[k] = starColor[s];
    });
    for (let k = real; k < n; k++) {
      const d = F * rand(NEAR, FAR);
      X[k] = ((Math.random() - 0.5) * w * 1.5 * d) / F;
      Y[k] = ((Math.random() - 0.5) * h * 1.5 * d) / F;
      D0[k] = d;
      // Mostly faint, a few bright, as seen from 10 focal lengths away
      M[k] = 7.6 - 4.8 * Math.random() ** 2.5 + 5 * Math.log10(d / (10 * F));
      C[k] = Math.random() < 0.3 ? 0 : Math.random() < 0.6 ? 1 : Math.random() < 0.7 ? 2 : 3;
    }
    milky.width = Math.max(1, Math.round(w / 2));
    milky.height = Math.max(1, Math.round(h / 2));
    mctx.clearRect(0, 0, milky.width, milky.height);
    drawMilkyWay(mctx, milkySprite, lst, view, 0.5);
    drawnKey = '';
  }

  function placeGalaxies(legs: { id: string; first: number; last: number }[]) {
    const kept = new Map(galaxies.map((g) => [g.kind, g.sprite]));
    galaxies = [];
    for (const leg of legs) {
      const d = DESTINATIONS[leg.id];
      if (!d) continue;
      // Close by (1.6 focal lengths) when the section's last stop is read, off to its side
      const at = 1.6 * F;
      galaxies.push({
        kind: d.kind,
        x: d.side * 0.42 * w * 1.6,
        y: -0.28 * h * 1.6,
        z: stride * leg.last + at,
        size: 1.25 * h * 1.6,
        tint: d.tint,
        first: leg.first,
        last: leg.last,
        sprite: kept.get(d.kind),
      });
    }
    // Home: the Milky Way, ahead after the last stop, where the flight comes to rest
    const lastStop = Math.max(0, ...legs.map((l) => l.last));
    const at = 2.6 * F;
    galaxies.push({
      kind: HOME.kind,
      x: 0.1 * w * 2.6,
      y: -0.06 * h * 2.6,
      z: stride * (lastStop + 1) + at,
      size: 1.1 * h * 2.6,
      tint: HOME.tint,
      first: lastStop + 1,
      last: lastStop + 1,
      sprite: kept.get(HOME.kind),
    });
  }

  /** How much a galaxy's section is the current one, for tinting space. */
  const presence = (g: Galaxy) => smooth(g.first - 1, g.first - 0.3, u) * (1 - smooth(g.last + 0.3, g.last + 1, u));

  function drawSpace(space: number, fade: number) {
    // Paint at most one galaxy per frame, the first time each is needed
    let painted = false;
    for (const g of galaxies) {
      const d = g.z - z;
      if (!g.sprite && !painted && d < (FAR + 4) * F) {
        g.sprite = paintGalaxy(g.kind, makeCanvas);
        painted = true;
      }
    }
    if (painted) drawnKey = '';

    // Each region of the route has its own color, glowing around its galaxy
    for (const g of galaxies) {
      const k = presence(g) * space * fade;
      if (k < 0.01) continue;
      const d = Math.max(0.3 * F, g.z - z);
      const x = clamp(cx + (F * g.x) / d, 0, w);
      const y = clamp(cy + (F * g.y) / d, 0, h);
      const r = Math.max(w, h) * 0.85;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${g.tint.join(',')},${0.2 * k})`);
      grad.addColorStop(0.5, `rgba(${g.tint.join(',')},${0.07 * k})`);
      grad.addColorStop(1, `rgba(${g.tint.join(',')},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // Farthest first, so nearer galaxies lie over farther ones
    ctx.globalCompositeOperation = 'lighter';
    const order = galaxies.filter((g) => g.sprite && g.z - z > NEAR * F).sort((a, b) => b.z - a.z);
    for (const g of order) {
      const d = g.z - z;
      const size = (g.size * F) / d;
      if (size < 4) continue;
      const x = cx + (F * g.x) / d;
      const y = cy + (F * g.y) / d;
      if (x + size / 2 < 0 || x - size / 2 > w || y + size / 2 < 0 || y - size / 2 > h) continue;
      // Faint while far away, so a distant destination never competes with the title in front
      // of it; full strength from about two stops out
      const alpha = 0.85 * smooth(24 * F, 8 * F, d) ** 0.8 * smooth(0.25 * F, 0.8 * F, d) * space * fade;
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.drawImage(g.sprite!, x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawStars(time: number, space: number, dim: number, twinkle: number) {
    const near = NEAR * F;
    const span = (FAR - NEAR) * F;
    // Only a fast scroll warps: an ordinary move between stops runs at about 8 focal lengths a
    // second and barely streaks
    const warp = smooth(6 * F, 20 * F, Math.abs(speed));
    const lag = speed * EXPOSURE;
    ctx.lineCap = 'round';
    for (let i = 0; i < X.length; i++) {
      // Stars that fall behind the camera come around again far ahead
      let d = (D0[i] - near - z) % span;
      if (d < 0) d += span;
      d += near;
      const x = cx + (F * X[i]) / d;
      const y = cy + (F * Y[i]) / d;
      if (x < -60 || x > w + 60 || y < -60 || y > h + 60) continue;
      const m = M[i] + 5 * Math.log10(d / D0[i]);
      if (m > LIMIT) continue;
      // Generated stars appear as the atmosphere falls away; the hero shows only the real sky
      const shown = i < real ? 1 : space;
      const tw = twinkle > 0 && m > 1 ? 1 - twinkle * 0.22 * (0.5 - 0.5 * Math.sin(time * (1.2 + (i % 7) * 0.25) + phase[i])) : 1;
      const alpha =
        clamp(1.15 - 0.13 * m, 0.2, 1) *
        clamp((LIMIT - m) / 0.6) *
        smooth(FAR * F, (FAR - 5) * F, d) *
        smooth(near, near * 2.5, d) *
        shown * dim * tw;
      if (alpha <= 0.01) continue;
      const r = clamp(2.3 - 0.34 * m, 0.55, 3.2);
      const color = C[i];

      if (warp > 0.02 && m < 5) {
        // The streak: where this star was a moment ago, at its old depth
        const d2 = Math.max(near, d + lag);
        let x2 = cx + (F * X[i]) / d2;
        let y2 = cy + (F * Y[i]) / d2;
        const len = Math.hypot(x2 - x, y2 - y);
        if (len > MAX_STREAK) {
          x2 = x + ((x2 - x) * MAX_STREAK) / len;
          y2 = y + ((y2 - y) * MAX_STREAK) / len;
        }
        if (len > 1.5) {
          ctx.globalAlpha = alpha * 0.55 * warp;
          ctx.strokeStyle = STAR_COLORS[color];
          ctx.lineWidth = Math.max(0.7, r * 0.9);
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = alpha;
      if (m < 2.2) {
        const g = Math.min(44, r * 8);
        ctx.drawImage(glows[color], x - g / 2, y - g / 2, g, g);
      }
      ctx.fillStyle = STAR_COLORS[color];
      if (r < 1) ctx.fillRect(x - r, y - r, r * 2, r * 2);
      else {
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
    // Leaving the atmosphere over the first leg of the flight; landing back in it at the end
    const air = 1 - smooth(0.05, 0.85, z / stride);
    const space = 1 - air;
    const pre = smooth(0, 0.6, end);
    const dawn = smooth(0.4, 1, end);
    const twinkle = reduced ? 0 : Math.max(air, dawn);
    const busy = twinkle > 0.01 || meteors.active() || !galaxies.every((g) => g.sprite || g.z - z > (FAR + 4) * F);
    const key = `${z.toFixed(1)}|${speed.toFixed(0)}|${end.toFixed(4)}|${w}|${h}`;
    if (!busy && key === drawnKey) return;
    drawnKey = key;

    const top = mix(mix(mix(SPACE[0], NIGHT[0], air), PREDAWN[0], pre), DAWN[0], dawn);
    const low = mix(mix(mix(SPACE[1], NIGHT[1], air), PREDAWN[1], pre), DAWN[1], dawn);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, rgb(top));
    sky.addColorStop(0.55, rgb(mix(top, low, 0.25)));
    sky.addColorStop(1, rgb(low));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // The Milky Way as seen from Amman, left behind with the atmosphere
    if (air > 0.01) {
      ctx.globalAlpha = 0.9 * air;
      ctx.drawImage(milky, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    // Galaxies and their color dim in a fast flight (a jump), so they never flash past
    drawSpace(space, (1 - pre) * (1 - 0.75 * smooth(6 * F, 20 * F, Math.abs(speed))));
    drawStars(now / 1000, space, 1 - 0.55 * dawn, twinkle);

    if (!reduced) {
      const area = clamp((w * h) / (1440 * 900), 0.4, 1.5);
      // Rare over the hero, none in deep space, more and more over Amman at dawn
      const rate = 0.16 * area * air + (0.25 + 2.1 * end ** 1.5) * area * pre;
      const floor = end > 0.05 && Number.isFinite(horizonY) ? clamp(horizonY / h, 0.3, 0.95) : 0.92;
      spawnDebt += dt * rate;
      while (spawnDebt >= 1) {
        meteors.spawn(w, h, false, floor, 0.5 * dawn);
        spawnDebt -= 1;
      }
      nextBolide -= dt * pre;
      if (nextBolide <= 0) {
        meteors.spawn(w, h, true, floor, 0.5 * dawn);
        nextBolide = rand(7, 12);
      }
      meteors.update(dt);
      meteors.draw(ctx);
    }
  }

  function loop(now: number) {
    render(now);
    frame = raf(loop);
  }

  function sync() {
    caf(frame);
    if (!started) return;
    drawnKey = '';
    if (!visible) return;
    last = performance.now();
    frame = raf(loop);
  }

  return {
    handle(msg: JourneyMessage) {
      switch (msg.type) {
        case 'init':
          reduced = msg.reducedMotion;
        // falls through
        case 'resize':
          w = msg.width;
          h = msg.height;
          dpr = msg.dpr;
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          cx = w / 2;
          if (!cy) cy = h / 2;
          if (msg.type === 'init') F = 0.72 * w;
          buildField();
          started = true;
          break;
        case 'route':
          F = msg.focal;
          stride = msg.stride;
          cy = msg.cy;
          placeGalaxies(msg.legs);
          buildField();
          break;
        case 'camera':
          z = msg.z;
          speed = msg.speed;
          u = msg.u;
          end = msg.end;
          horizonY = msg.horizonY;
          return;
        case 'motion':
          reduced = msg.reduced;
          if (reduced) meteors.clear();
          break;
        case 'visible':
          visible = msg.visible;
          break;
        case 'wish': {
          if (reduced || !visible) return;
          const floorY = end > 0.2 && Number.isFinite(horizonY) ? Math.min(h, horizonY) : h;
          meteors.launch(msg.x, msg.y, w, floorY);
          return;
        }
      }
      sync();
    },
  };
}

