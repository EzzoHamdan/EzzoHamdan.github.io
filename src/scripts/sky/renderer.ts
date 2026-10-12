/**
 * The sky over Amman, drawn on one canvas. Runs in a Web Worker on an OffscreenCanvas when the
 * browser supports it, or on the page otherwise.
 *
 * A real sky: stars to magnitude 5, the naked-eye planets and the Milky Way where they are over
 * Amman right now (or tonight at 21:00 in daylight). Stars twinkle; planets shine steadily, as
 * they do in the real sky.
 *
 * Scrolling is a journey through the dome:
 * - Time: the whole page spans six hours of sky rotation around Polaris.
 * - Camera: each page section is a shot (SHOTS). The camera holds while a section is read and
 *   glides to the next one between sections: straight up in the hero, south, east, north, and
 *   finally down to the eastern horizon at dawn, where the horizon lines up with the footer's
 *   Amman skyline.
 * - Atmosphere: dusk at the top, deep midnight while reading, dawn at the end.
 * - Shooting stars: rare at the top, more toward the end, some falling behind the city.
 * Everything is eased, and nothing ever leaves trails, so text stays crisp.
 *
 * Clicking empty sky makes a wish: a shooting star launches from that point.
 *
 * Reduced motion: a still overhead sky (no rotation, camera moves, twinkle, shooting stars or
 * wishes). Calm (article pages): a dimmer, still overhead sky with rare shooting stars.
 */
import { PLANETS, RAD, night, planets, siderealTime } from './astro';
import { camera, named, projectOne, projectVector, starColor, starMag, stars, type View } from './catalog';
import { createMeteors } from './meteors';
import { starNames } from '../../data/sky-names';
import { drawMilkyWay } from './milky-way';

export type Direction = 'overhead' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

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
  /** Scroll position (0..1) and where the skyline's far hills are on screen right now. */
  | { type: 'scroll'; progress: number; horizonY: number }
  /** Where each section's shot begins, in pixels of scroll, and the total scroll length. */
  | { type: 'scenes'; anchors: { id: string; at: number }[]; max: number; vh: number }
  | { type: 'motion'; reduced: boolean }
  | { type: 'visible'; visible: boolean }
  | { type: 'pointer'; x: number; y: number }
  | { type: 'pointer-leave' }
  | { type: 'wish'; x: number; y: number };

export type SkyEvent =
  /** A star (index into `starNames`) or planet (index into `PLANETS`) under the pointer; -1 hides. */
  | { type: 'hover'; kind: 'star' | 'planet'; index: number; x: number; y: number }
  /** What the camera is looking at: the named star or planet nearest the center, if any. */
  | { type: 'view'; kind: 'star' | 'planet' | 'none'; index: number; direction: Direction; dawn: boolean };

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
interface Shot {
  az: number;
  alt: number;
  fov: number;
  /** 1 = the stereographic dome; toward 0 = a camera lens with a straight horizon. */
  lens: number;
}

const STAR_COLORS = ['#b4c6ff', '#f2f4ff', '#fff3df', '#ffd3a3'];
const PLANET_COLORS: Record<(typeof PLANETS)[number], string> = {
  mercury: '#d9d4cc',
  venus: '#fff6dc',
  mars: '#ff9a6b',
  jupiter: '#ffe9c9',
  saturn: '#f5dca0',
};
const GROUND = '#0b1024'; // matches the far hills of the footer skyline
const MINUTE = 60_000;
/** Faintest star drawn in the overhead view; zooming in reveals fainter ones, like a telescope. */
const BASE_LIMIT = 5;
/** How far a camera move pushes in (degrees of field of view) halfway between two shots. */
const PUSH_IN = 9;
// How far the dome turns over the whole page: six hours of sky, 90° around the pole
const DOME_SPAN = 6 * 3_600_000;

/**
 * Camera shots by section id: azimuth (degrees from north toward east), altitude, field of view
 * (degrees from the center to a screen corner) and lens. `alt: NaN` means "put the horizon on
 * the skyline".
 */
const SHOTS: Record<string, Shot> = {
  // Each section zooms a little deeper into the sky than the one before
  hero: { az: 180, alt: 90, fov: 90, lens: 1 }, // straight up: the whole dome, north at the top
  about: { az: 180, alt: 72, fov: 80, lens: 1 }, // tilting toward the south
  experience: { az: 200, alt: 55, fov: 70, lens: 1 }, // the southern sky
  projects: { az: 105, alt: 45, fov: 62, lens: 1 }, // east, where new stars rise
  education: { az: 0, alt: 35, fov: 56, lens: 1 }, // north, toward Polaris, the guiding star
  // The eastern horizon at dawn over Amman, through a near-rectilinear lens so it lies flat
  contact: { az: 95, alt: NaN, fov: 48, lens: 0.12 },
};

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
const WINDS: Direction[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
// Education looks north to Polaris, the star travellers steered by
const POLARIS = starNames.findIndex((s) => s.en === 'Polaris');

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
  let reduced = false, calm = false, visible = true, started = false;
  let moment = night();
  let planetPos = planets(moment.time);
  let refreshedAt = 0;
  let target = 0, progress = 0;
  let frame = 0, last = 0, spawnDebt = 0, nextBolide = rand(6, 12), startedAt = 0;
  let anchors: { id: string; at: number }[] = [];
  let scrollMax = 1;
  let vh = 1;
  let horizonY = NaN;
  let shot: Shot = SHOTS.hero;
  let view: View = camera(1, 1, 180, 90, 90, 1);
  let lst = NaN;
  let viewKey = '';
  let lastViewEvent = '';
  let floor = 0.9;
  let section = 'hero';
  let hovered = { kind: 'star' as 'star' | 'planet', index: -1 };
  let planetsNow: { key: (typeof PLANETS)[number]; x: number; y: number; u: number; mag: number }[] = [];

  // The top of the page is "right now"; refresh each minute so a long visit stays current
  function refresh() {
    moment = night();
    planetPos = planets(moment.time);
    refreshedAt = Date.now();
    viewKey = '';
  }

  /** The highest point of the visible horizon on screen for a camera, or Infinity if none. */
  function horizonTop(v: View) {
    let top = Infinity;
    for (let a = -88; a <= 88; a += 4) {
      const az = (Math.atan2(v.fwd[0], v.fwd[1]) / RAD + a) * RAD;
      const e = Math.sin(az);
      const n = Math.cos(az);
      if (e * v.fwd[0] + n * v.fwd[1] <= 0) continue;
      const p = projectVector(e, n, 0, v);
      if (p.k && p.x >= 0 && p.x <= w) top = Math.min(top, p.y);
    }
    return top;
  }

  // Shots adjusted to this screen, worked out once per size (see `resolve`)
  let resolved: Record<string, Shot> = {};

  /** A section's shot, adjusted to this screen. */
  function resolve(id: string): Shot {
    if (resolved[id]) return resolved[id];
    const s = SHOTS[id] ?? SHOTS.hero;
    let shot: Shot;
    if (Number.isNaN(s.alt)) {
      // Tilt down just enough that the real horizon falls on the skyline's far hills wherever
      // they are on screen right now, so the sky's horizon and the city move as one. Recomputed
      // every frame, never cached.
      const y = Number.isNaN(horizonY) ? h * 0.75 : horizonY;
      let lo = 0;
      let hi = 60;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const ahead = projectVector(Math.sin(s.az * RAD), Math.cos(s.az * RAD), 0, camera(w, h, s.az, mid, s.fov, s.lens));
        if (ahead.y < y) lo = mid;
        else hi = mid;
      }
      return { ...s, alt: (lo + hi) / 2 };
    } else {
      // Everywhere else, tilt up until no part of the horizon shows, not even where it curves
      // up toward the sides, so no ground appears behind reading text
      let alt = s.alt;
      while (alt < 90 && horizonTop(camera(w, h, s.az, alt, s.fov, s.lens)) < h + 10) alt += 1;
      shot = { ...s, alt };
    }
    resolved[id] = shot;
    return shot;
  }

  /**
   * The camera for a scroll position. Every move between two shots takes the same scroll
   * distance (about one screen, centered on where the next section begins) so no move is faster
   * than another; the rest of each section holds still on its shot.
   */
  function shotAt(p: number): Shot {
    if (reduced || calm || anchors.length === 0) {
      section = 'hero';
      return resolve('hero');
    }
    const y = p * scrollMax;
    let i = 0;
    let window = 0;
    for (let j = 1; j < anchors.length; j++) {
      const gapBefore = anchors[j].at - anchors[j - 1].at;
      const gapAfter = j + 1 < anchors.length ? anchors[j + 1].at - anchors[j].at : Infinity;
      const half = Math.max(1, Math.min(0.55 * vh, 0.45 * gapBefore, 0.45 * gapAfter));
      if (y >= anchors[j].at - half) {
        i = j;
        window = half;
      }
    }
    if (i === 0) {
      section = anchors[0].id;
      return resolve(anchors[0].id);
    }
    const A = resolve(anchors[i - 1].id);
    const B = resolve(anchors[i].id);
    const t = smooth(0, 1, (y - (anchors[i].at - window)) / (2 * window));
    section = t > 0.5 ? anchors[i].id : anchors[i - 1].id;
    if (t >= 1) return B;
    const dAz = ((B.az - A.az + 540) % 360) - 180;
    const mix = (x: number, z: number) => x + (z - x) * t;
    // A gentle push-in through the middle of the move, as if flying toward the next view
    const push = PUSH_IN * Math.sin(Math.PI * t);
    return { az: A.az + dAz * t, alt: mix(A.alt, B.alt), fov: mix(A.fov, B.fov) - push, lens: mix(A.lens, B.lens) };
  }

  // Everything moves together: stars, named stars, planets and the Milky Way
  function reproject() {
    stars.project(lst, view);
    named.project(lst, view);
    planetsNow = planetPos.map((pl) => ({ key: pl.key, mag: pl.mag, ...projectOne(pl.ra, pl.dec, lst, view) }));
    mctx.clearRect(0, 0, milky.width, milky.height);
    drawMilkyWay(mctx, milkySprite, lst, view, 0.5);
  }

  function drawStars(time: number, dim: number) {
    // Zooming in shows fainter stars, as through a telescope: one magnitude per doubling
    const zoom = view.f / (Math.hypot(w, h) / 2);
    const limit = BASE_LIMIT + Math.max(0, Math.log2(zoom));
    for (let i = 0; i < stars.length; i++) {
      const mag = starMag[i];
      if (mag > limit) break; // the catalog is sorted brightest first
      const u = stars.u[i];
      if (u < 0) continue;
      const x = stars.x[i];
      const y = stars.y[i];
      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
      const twinkle = reduced || mag < 1 ? 1 : 0.78 + 0.22 * Math.sin(time * (1.2 + (i % 7) * 0.25) + starPhase[i]);
      // Fainter near the horizon, as through more atmosphere
      // Stars near the limit fade in rather than pop as the camera zooms
      const reveal = clamp((limit - mag) / 0.6);
      const alpha = clamp(1.15 - 0.13 * mag, 0.3, 1) * smooth(0, 0.18, u) * twinkle * dim * reveal;
      if (alpha <= 0.01) continue;
      const r = Math.max(0.6, 2.3 - 0.34 * mag);
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

  // Below the horizon is ground, in the color of the skyline's far hills
  function drawGround() {
    // Only when the horizon straight ahead is actually on screen
    const ahead = projectVector(Math.sin(shot.az * RAD), Math.cos(shot.az * RAD), 0, view);
    if (!ahead.k || ahead.y > h + 40) return;
    // The horizon in front of the camera, in azimuth order, is one continuous arc left to right
    const pts: { x: number; y: number }[] = [];
    for (let a = -88; a <= 88; a += 2) {
      const az = (shot.az + a) * RAD;
      const e = Math.sin(az);
      const n = Math.cos(az);
      if (e * view.fwd[0] + n * view.fwd[1] <= 0) continue;
      const p = projectVector(e, n, 0, view);
      if (p.k) pts.push(p);
    }
    if (pts.length < 2) return;
    ctx.fillStyle = GROUND;
    ctx.beginPath();
    ctx.moveTo(Math.min(pts[0].x, 0) - 10, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(Math.max(pts[pts.length - 1].x, w) + 10, pts[pts.length - 1].y);
    ctx.lineTo(Math.max(pts[pts.length - 1].x, w) + 10, h + 10);
    ctx.lineTo(Math.min(pts[0].x, 0) - 10, h + 10);
    ctx.closePath();
    ctx.fill();
  }

  const onScreen = (x: number, y: number, u: number) => u > 0.02 && x > 0 && x < w && y > 0 && y < h;

  // Name what the camera is looking at, for the caption on the page: the section's featured
  // object when it is in view, otherwise the named star or planet nearest the center
  function describeView(p: number) {
    let kind: 'star' | 'planet' | 'none' = 'none';
    let index = -1;
    let best = (0.3 * Math.min(w, h)) ** 2;
    const brightestPlanet = planetsNow
      .map((pl, i) => ({ ...pl, i }))
      .filter((pl) => onScreen(pl.x, pl.y, pl.u))
      .sort((a, b) => a.mag - b.mag)[0];
    if (section === 'education' && POLARIS >= 0 && onScreen(named.x[POLARIS], named.y[POLARIS], named.u[POLARIS])) {
      kind = 'star';
      index = POLARIS;
      best = -1;
    } else if (section === 'projects' && brightestPlanet) {
      kind = 'planet';
      index = brightestPlanet.i;
      best = -1;
    }
    for (let i = 0; i < named.length; i++) {
      if (named.u[i] < 0.08) continue;
      const d = (named.x[i] - view.cx) ** 2 + (named.y[i] - view.cy) ** 2;
      if (d < best) {
        best = d;
        kind = 'star';
        index = i;
      }
    }
    planetsNow.forEach((pl, i) => {
      if (pl.u < 0.08) return;
      // Planets win ties generously: they are the rarer sight
      const d = ((pl.x - view.cx) ** 2 + (pl.y - view.cy) ** 2) * 0.5;
      if (d < best) {
        best = d;
        kind = 'planet';
        index = i;
      }
    });
    const direction: Direction = shot.alt > 72 ? 'overhead' : WINDS[Math.round((((shot.az % 360) + 360) % 360) / 45) % 8];
    const event = { type: 'view' as const, kind, index, direction, dawn: p > 0.96 };
    const key = JSON.stringify(event);
    if (key !== lastViewEvent) {
      lastViewEvent = key;
      emit(event);
    }
  }

  function render(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (Date.now() - refreshedAt > MINUTE) refresh();
    // Ease the scroll position so the dome and the camera glide and dimming never jumps
    progress += (target - progress) * (1 - Math.exp(-dt * 4.5));
    const p = calm ? 0 : progress;
    const still = reduced || calm;

    shot = shotAt(p);
    // Opening moment: the gaze lifts from the southern sky to straight overhead
    if (!still) shot = { ...shot, alt: shot.alt - 24 * (1 - smooth(0, 2.6, (now - startedAt) / 1000)) * (1 - smooth(0, 0.05, p)) };
    const nextLst = siderealTime(moment.time + (still ? 0 : p) * DOME_SPAN);
    const key = `${nextLst.toFixed(6)}|${shot.az.toFixed(3)}|${shot.alt.toFixed(3)}|${shot.fov.toFixed(3)}|${shot.lens.toFixed(3)}|${w}|${h}`;
    if (key !== viewKey) {
      viewKey = key;
      lst = nextLst;
      view = camera(w, h, shot.az, shot.alt, shot.fov, shot.lens);
      reproject();
    }

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
    // The dome: a soft glow toward the edges of the view, as toward a real horizon
    const edge = Math.hypot(w, h) / 2;
    const rim = ctx.createRadialGradient(view.cx, view.cy, edge * 0.45, view.cx, view.cy, edge);
    rim.addColorStop(0, 'rgba(70,82,150,0)');
    rim.addColorStop(1, `rgba(70,82,150,${calm ? 0.1 : 0.22})`);
    ctx.fillStyle = rim;
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

    if (!reduced) {
      const area = clamp((w * h) / (1440 * 900), 0.4, 1.5);
      const shower = moment.shower >= 0 ? 1.5 : 1;
      const end = smooth(0.8, 1, p);
      // Rare at the top, building gently toward the end of the page, over Amman
      const rate = calm ? 0.08 * area : (0.25 + 2.2 * smooth(0.5, 0.97, p) ** 1.5) * area * shower;
      // Above the skyline as it rises into view; at the end, about half fall behind the city
      floor = 0.9 - 0.3 * end;
      spawnDebt += dt * rate;
      while (spawnDebt >= 1) {
        meteors.spawn(w, h, false, floor, 0.5 * end);
        spawnDebt -= 1;
      }
      nextBolide -= dt;
      if (nextBolide <= 0 && !calm) {
        meteors.spawn(w, h, true, floor, 0.5 * end);
        nextBolide = p > 0.7 ? rand(7, 12) : rand(12, 20);
      }
      meteors.update(dt);
      meteors.draw(ctx, calm ? 0.6 : 1);
    }

    if (shot.alt < 89) drawGround();
    if (!calm) describeView(p);
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
          startedAt = performance.now();
        // falls through
        case 'resize':
          w = msg.width;
          h = msg.height;
          dpr = msg.dpr;
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          milky.width = Math.max(1, Math.round(w / 2));
          milky.height = Math.max(1, Math.round(h / 2));
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          resolved = {};
          refresh();
          started = true;
          break;
        case 'scenes':
          anchors = msg.anchors;
          scrollMax = Math.max(1, msg.max);
          vh = msg.vh;
          resolved = {};
          viewKey = '';
          if (reduced || !visible) render(performance.now());
          return;
        case 'scroll':
          target = clamp(msg.progress);
          horizonY = msg.horizonY;
          if (reduced || !visible) {
            progress = target;
            render(performance.now());
          }
          return;
        case 'motion':
          reduced = msg.reduced;
          viewKey = '';
          break;
        case 'visible':
          visible = msg.visible;
          if (visible) refresh();
          break;
        case 'pointer':
          hover(msg.x, msg.y);
          return;
        case 'pointer-leave':
          hover(-1e4, -1e4);
          return;
        case 'wish':
          if (!reduced && visible) meteors.launch(msg.x, msg.y, w, h * floor);
          return;
      }
      sync();
    },
  };
}
