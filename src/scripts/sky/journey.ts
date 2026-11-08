/**
 * The sky for the galaxy journey (wide screens with motion allowed; see src/scripts/journey.ts for
 * the page side). Runs in the same Web Worker as the dome, on the same canvas.
 *
 * Scrolling flies a camera straight ahead through space, in one direction only: forward. No pans,
 * no rolls, so fast scrolling reads as faster flight, never as a camera swinging around.
 * - The beginning (GENESIS, `drawGenesis`): the hero is pitch black, the void before anything
 *   existed. As soon as the page moves, a small light appears in it and swells while the hero
 *   leaves; then the Big Bang, and a new universe of stars and galaxies expands out of it, where
 *   the flight goes on.
 * - The field: real stars (the sky over Amman tonight, each given a depth) and generated ones, at
 *   depths up to FAR focal lengths, recycled endlessly, so the flight never runs out of stars.
 * - Galaxies: each section flies toward one (DESTINATIONS), farthest first so the whole flight is a
 *   return home, seen far away behind its title, growing as its content is read, and passed close
 *   by on the way to the next. Its color tints the space around it.
 * - Warp: stars stretch into short streaks only while the camera is actually moving fast, which
 *   happens between stops, never while a stop holds still for reading.
 * - Homecoming (`drawHome`): after the last stop, a powers-of-ten dive home, one stage per leg of
 *   scroll: the Milky Way, centered on where the Sun is in it; the Solar System, planets where they
 *   really are; Earth, turned to Amman and lit for this moment, so Amman sits on its real side:
 *   day, night or the line between. Then Amman itself at its real time of day (astro.ts::daylight):
 *   night, dawn or dusk with shooting stars, some falling behind the skyline; a blue sky by day.
 *
 * The camera's position comes from the page every frame (`camera`), already eased, so the stars and
 * the text planes the page moves with CSS share one camera and one focal length.
 */
import { daylight, LOOKS, now as clockNow, night, siderealTime, solarSystem, type Daylight, type Look } from './astro';
import { camera as skyCamera, starColor, starMag, stars } from './catalog';
import { createGlobe } from './earth';
import { createMeteors, DAY_METEOR_DIM, DAY_METEORS } from './meteors';
import { GENESIS } from './genesis';
import { GALAXY_RADIUS, paintGalaxy, SPRITE, SUN_IN_MILKY_WAY, type GalaxyKind } from './galaxies';

export type JourneyMessage =
  | {
      type: 'init';
      canvas?: OffscreenCanvas;
      mode: 'journey';
      width: number;
      height: number;
      dpr: number;
      reducedMotion: boolean;
      /** The page clock's offset from real time (astro.ts::now). */
      clockOffset: number;
    }
  | { type: 'resize'; width: number; height: number; dpr: number }
  /**
   * The route: focal length in pixels (the CSS perspective of the text planes), camera travel per
   * stop, the vanishing point's height, and the stops each section spans.
   */
  | { type: 'route'; focal: number; stride: number; cy: number; legs: { id: string; first: number; last: number }[] }
  /**
   * The camera now: distance travelled, its speed (per second), the position along the route in
   * stops, the homecoming's progress in stages (0 at the last stop, 1 the Milky Way, 2 the Sun,
   * 3 the Earth; negative before), how far the final landing has come (0..1), and where the
   * skyline's far hills are. `rewind`: a menu jump is flying back to the hero, so the beginning
   * plays backwards as a contraction, without the blast's flash and sparks.
   */
  | { type: 'camera'; z: number; speed: number; u: number; home: number; end: number; horizonY: number; rewind: boolean }
  /** Where the mouse leans the view, -1..1 each way, eased by the page. */
  | { type: 'lean'; x: number; y: number }
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
// Farthest first, so the journey is a return home (distances in journey.ts::DISTANCE)
const DESTINATIONS: Record<string, { kind: GalaxyKind; side: number; tint: number[] }> = {
  about: { kind: 'sombrero', side: 1, tint: [168, 124, 64] },
  experience: { kind: 'whirlpool', side: -1, tint: [160, 64, 136] },
  projects: { kind: 'triangulum', side: 1, tint: [44, 124, 168] },
  education: { kind: 'andromeda', side: -1, tint: [92, 74, 178] },
};
/** How much each stage of the homecoming zooms in on the next. */
const ZOOM = 14;
/** The Solar System seen from a little above the plane of the planets. */
const ECLIPTIC_TILT = 0.42;
const ORBITER_LOOK: Record<string, { color: string; r: number }> = {
  mercury: { color: '#c9c2b8', r: 1.8 },
  venus: { color: '#f3e2b8', r: 2.6 },
  earth: { color: '#7fb0ff', r: 2.8 },
  mars: { color: '#e0805a', r: 2.2 },
  jupiter: { color: '#e8cfa6', r: 4.4 },
  saturn: { color: '#e9d39a', r: 3.8 },
  uranus: { color: '#a6dce3', r: 3.2 },
  neptune: { color: '#5b7ff0', r: 3.1 },
};

/** How fast the blast's flash may brighten, per second, so scrolling back and forth can't strobe. */
const FLASH_RISE = 3.2;
/** The blast's sparks: direction, speed (in half screen diagonals), width, brightness, color. */
const SPARK_COLORS = ['#fffaf0', '#ffe2a8', '#ffb070', '#ff8a5c'];
const SPARKS = Array.from({ length: 150 }, () => ({
  angle: Math.random() * Math.PI * 2,
  speed: 0.25 + 1.2 * Math.random() ** 1.5,
  size: 0.8 + 1.6 * Math.random(),
  bright: 0.4 + 0.6 * Math.random(),
  color: Math.floor(Math.random() * SPARK_COLORS.length),
}));

// Sky colors, [top, bottom]: open space
const SPACE = [[3, 4, 12], [7, 9, 22]];
// Coming home, by Amman's look right now (astro.ts::daylight): descending through the air, then
// landed. By day the top stays a deep blue, so the contact text over it reads as well as at night
const DESCENT: Record<Look, number[][]> = {
  night: [[8, 12, 30], [32, 28, 62]],
  dawn: [[10, 14, 34], [58, 40, 74]],
  day: [[14, 30, 72], [52, 92, 152]],
  dusk: [[12, 15, 38], [70, 42, 78]],
};
const HOME: Record<Look, number[][]> = {
  night: [[9, 13, 34], [56, 44, 80]],
  dawn: [[16, 24, 56], [118, 74, 70]],
  day: [[30, 72, 140], [168, 200, 228]],
  dusk: [[24, 32, 78], [168, 100, 116]],
};
/** How much starlight shows once home: most at night, none by day. */
const STARLIGHT: Record<Look, number> = { night: 0.85, dawn: 0.45, day: 0, dusk: 0.5 };

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
  const meteors = createMeteors(makeCanvas);

  let w = 0, h = 0, dpr = 1;
  let F = 1000, stride = 4000, cx = 0, cy = 0;
  let z = 0, speed = 0, u = 0, home = -9, end = 0, horizonY = NaN, lastStop = 99, rewind = false;
  let reduced = false, visible = true, started = false;
  let frame = 0, last = 0, spawnDebt = 0, nextBolide = rand(8, 14);
  let drawnKey = '';
  // The beginning: the flash as shown (it may only brighten at FLASH_RISE), the singularity's glow,
  // and the afterglow's mottled texture, made when first needed
  let flash = 0;
  const coreSprite = softSprite(64, '255,240,222', 0.08);
  let afterglow: Canvas | undefined;
  // Amman's look right now, refreshed every half minute, and the colors and starlight it gives
  let light: Daylight = daylight(clockNow());
  let lightAt = -Infinity;
  let descent = DESCENT.dawn, homeSky = HOME.dawn, starlight = 0.45;
  const blend = (table: Record<Look, number[][]>) =>
    table.night.map((_, i) => [0, 1, 2].map((j) => LOOKS.reduce((sum, k) => sum + table[k][i][j] * light[k], 0)));
  // The camera never stops completely: a slow drift (depth dz, across dx and dy), so near stars
  // shift more than far ones and galaxies swell a little, even while a stop holds still
  let dz = 0, dx = 0, dy = 0, breath = 1, clock = 0, orbitClock = 0, lastDraw = 0;
  // The mouse's lean, which moves the camera a little the same way as the drift
  let leanX = 0, leanY = 0, leaned = false;
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
      // A real star starts where it is in Amman's sky straight up: any depth projects it there
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
  }

  // The homecoming, prepared once: the Milky Way's portrait, the planets and the globe, all for
  // this moment, so the Earth turns Amman's real side to the Sun: day, night or the line between
  const moment = clockNow();
  const globe = createGlobe(1024, moment, makeCanvas);
  const sunSprite = softSprite(64, '255,236,196', 0.12);
  let milkyWay: Canvas | undefined;
  const orbiters = (() => {
    const all = solarSystem(moment);
    const earth = all.find((p) => p.key === 'earth')!;
    // Turn the system so the Sun lies the same way from Earth as the daylight on the globe
    const toSun = Math.atan2(-earth.y, -earth.x);
    const want = Math.atan2(Math.sin(globe.sunAngle) / ECLIPTIC_TILT, Math.cos(globe.sunAngle));
    const turn = want - toSun;
    // Orbits drawn on a square-root scale, so the inner planets aren't crowded into the Sun. The
    // planets start where they really are and then orbit, Mercury once in about 24 seconds and the
    // rest slower by Kepler's third law; the Earth stays put, since the zoom is closing in on it
    return all.map((p) => ({
      key: p.key,
      r: Math.sqrt(p.a),
      angle: Math.atan2(p.y, p.x) + turn,
      speed: p.key === 'earth' ? 0 : (2 * Math.PI) / (100 * p.a ** 1.5),
    }));
  })();
  const place = (p: (typeof orbiters)[number]) => {
    const a = p.angle + p.speed * orbitClock;
    return [p.r * Math.cos(a), p.r * Math.sin(a) * ECLIPTIC_TILT];
  };
  const earthAt = orbiters.find((p) => p.key === 'earth')!;
  const [earthX, earthY] = place(earthAt);

  /** A slow ripple around a marked place: a ring that grows and fades every 2.4 seconds. */
  function ripple(x: number, y: number, alpha: number) {
    const k = (clock / 2.4) % 1;
    ctx.strokeStyle = 'rgba(201,161,91,0.9)';
    ctx.lineWidth = 1;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * (1 - k) * 0.7;
    ctx.beginPath();
    ctx.arc(x, y, 9 + 14 * k, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** The homecoming's zoom level: about -1.3 at the last stop, then one stage per leg of scroll. */
  const homeLevel = (home: number) => (home < 1 ? -1.3 + 1.3 * home : home - 1) + 0.45 * smooth(0, 0.6, end);

  /** The Milky Way, behind the stars: centered on the Sun's place in it, with a mark there. */
  function drawHomeBack(L: number, fade: number) {
    const a = smooth(-1.8, -1, L) * (1 - smooth(0.15, 0.6, L)) * fade;
    if (a < 0.01) return;
    if (!milkyWay) return;
    const k = (0.9 * h * ZOOM ** L * breath) / (2 * GALAXY_RADIUS);
    const hx = cx - dx * 0.4;
    const hy = cy - dy * 0.4;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    // Past full size the portrait's points of light would show as blocks; soften them as it grows
    const soften = Math.max(0, k - 1.2) * 3;
    if (soften > 0.5) ctx.filter = `blur(${soften.toFixed(1)}px)`;
    ctx.drawImage(milkyWay, hx - SUN_IN_MILKY_WAY.x * k, hy - SUN_IN_MILKY_WAY.y * k, SPRITE * k, SPRITE * k);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    // You are here
    const mark = smooth(-1, -0.5, L) * (1 - smooth(0.1, 0.6, L)) * fade;
    if (mark > 0.01) ripple(hx, hy, mark);
    ctx.globalAlpha = 1;
  }

  /** The Solar System and the Earth, in front of the stars. */
  function drawHomeFront(L: number, fade: number) {
    const showSystem = smooth(0.3, 0.85, L) * (1 - smooth(2.05, 2.5, L)) * fade;
    const showEarth = smooth(0.3, 0.85, L) * fade;
    if (showEarth < 0.01) return;
    // Pixels per unit of orbit, and the point the zoom closes in on: the Sun, then the Earth
    const S = 0.136 * h * ZOOM ** (L - 1) * breath;
    const focus = smooth(1.15, 1.85, L);
    const fx = earthX * focus;
    const fy = earthY * focus;
    const hx = cx - dx * 0.4;
    const hy = cy - dy * 0.4;
    const at = (x: number, y: number) => [hx + (x - fx) * S, hy + (y - fy) * S];

    if (showSystem > 0.01) {
      const [sx, sy] = at(0, 0);
      const sunR = clamp(0.05 * S, 3, 70);
      const halo = sunR * 9;
      if (sx + halo > 0 && sx - halo < w && sy + halo > 0 && sy - halo < h) {
        ctx.globalAlpha = showSystem;
        ctx.drawImage(sunSprite, sx - halo, sy - halo, halo * 2, halo * 2);
        ctx.fillStyle = '#fff6e4';
        ctx.beginPath();
        ctx.arc(sx, sy, sunR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineWidth = 1;
      for (const p of orbiters) {
        const rx = p.r * S;
        if (rx > 6 * Math.max(w, h)) continue;
        ctx.globalAlpha = 0.3 * showSystem;
        ctx.strokeStyle = '#c9a15b';
        ctx.beginPath();
        ctx.ellipse(sx, sy, rx, rx * ECLIPTIC_TILT, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (p.key === 'earth') continue;
        const [ox, oy] = place(p);
        const [px, py] = at(ox, oy);
        const look = ORBITER_LOOK[p.key];
        ctx.globalAlpha = showSystem;
        ctx.fillStyle = look.color;
        ctx.beginPath();
        ctx.arc(px, py, look.r, 0, Math.PI * 2);
        ctx.fill();
        if (p.key === 'saturn') {
          ctx.strokeStyle = look.color;
          ctx.beginPath();
          ctx.ellipse(px, py, look.r * 2.4, look.r * 0.9, -0.3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // The Earth: a blue dot that grows into the globe, faster than the orbits around it
    const [ex, ey] = at(earthX, earthY);
    const er = 0.3 * h * ZOOM ** ((L - 2) * 1.6) * breath;
    const asGlobe = globe.done ? smooth(3, 8, er) : 0;
    if (asGlobe < 1) {
      ctx.globalAlpha = showEarth * (1 - asGlobe);
      ctx.fillStyle = ORBITER_LOOK.earth.color;
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(ORBITER_LOOK.earth.r, er), 0, Math.PI * 2);
      ctx.fill();
    }
    if (asGlobe > 0 && er < 8 * Math.max(w, h)) {
      // A thin blue atmosphere, then the globe
      const glow = ctx.createRadialGradient(ex, ey, er * 0.96, ex, ey, er * 1.12);
      glow.addColorStop(0, 'rgba(120,170,255,0.45)');
      glow.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.globalAlpha = showEarth * asGlobe;
      ctx.fillStyle = glow;
      ctx.fillRect(ex - er * 1.2, ey - er * 1.2, er * 2.4, er * 2.4);
      ctx.drawImage(globe.canvas, ex - er, ey - er, er * 2, er * 2);
      // Amman, marked where it lies on the globe
      const mark = smooth(1.6, 1.9, L) * (1 - smooth(2.2, 2.5, L)) * fade;
      if (mark > 0.01) {
        ctx.globalAlpha = mark;
        ctx.fillStyle = '#f0c27a';
        ctx.beginPath();
        ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ripple(ex, ey, mark);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** How much a galaxy's section is the current one, for tinting space. */
  const presence = (g: Galaxy) => smooth(g.first - 1, g.first - 0.3, u) * (1 - smooth(g.last + 0.3, g.last + 1, u));

  function drawSpace(fade: number, reach = 1) {
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
      const k = presence(g) * fade;
      if (k < 0.01) continue;
      const d = Math.max(0.3 * F, g.z - z - dz);
      const x = clamp(cx + (F * (g.x - dx)) / d, 0, w);
      const y = clamp(cy + (F * (g.y - dy)) / d, 0, h);
      const r = Math.max(w, h) * 0.85;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${g.tint.join(',')},${0.2 * k})`);
      grad.addColorStop(0.5, `rgba(${g.tint.join(',')},${0.07 * k})`);
      grad.addColorStop(1, `rgba(${g.tint.join(',')},0)`);
      ctx.fillStyle = grad;
      // While the view is scaled down (the beginning), cover what the screen would show at full size
      ctx.fillRect(cx - cx * reach, cy - cy * reach, w * reach, h * reach);
    }

    // Farthest first, so nearer galaxies lie over farther ones
    ctx.globalCompositeOperation = 'lighter';
    const order = galaxies.filter((g) => g.sprite && g.z - z - dz > NEAR * F).sort((a, b) => b.z - a.z);
    for (const g of order) {
      const d = g.z - z - dz;
      const size = (g.size * F) / d;
      if (size < 4) continue;
      const x = cx + (F * (g.x - dx)) / d;
      const y = cy + (F * (g.y - dy)) / d;
      if (x + size / 2 < 0 || x - size / 2 > w || y + size / 2 < 0 || y - size / 2 > h) continue;
      // Faint while far away, so a distant destination never competes with the title in front
      // of it; full strength from about two stops out
      const alpha = 0.85 * smooth(24 * F, 8 * F, d) ** 0.8 * smooth(0.25 * F, 0.8 * F, d) * fade;
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.drawImage(g.sprite!, x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawStars(time: number, dim: number, twinkle: number, reach = 1) {
    const near = NEAR * F;
    // How far off screen to keep stars: farther while the view is scaled down around the center
    // (the beginning), so the shrunken field never shows a straight edge
    const left = cx - (cx + 60) * reach;
    const right = cx + (w - cx + 60) * reach;
    const top = cy - (cy + 60) * reach;
    const bottom = cy + (h - cy + 60) * reach;
    const span = (FAR - NEAR) * F;
    // Only a fast scroll warps: an ordinary move between stops runs at about 8 focal lengths a
    // second and barely streaks
    const warp = smooth(6 * F, 20 * F, Math.abs(speed));
    const lag = speed * EXPOSURE;
    ctx.lineCap = 'round';
    for (let i = 0; i < X.length; i++) {
      // Stars that fall behind the camera come around again far ahead
      let d = (D0[i] - near - z - dz) % span;
      if (d < 0) d += span;
      d += near;
      const x = cx + (F * (X[i] - dx)) / d;
      const y = cy + (F * (Y[i] - dy)) / d;
      if (x < left || x > right || y < top || y > bottom) continue;
      const m = M[i] + 5 * Math.log10(d / D0[i]);
      if (m > LIMIT) continue;
      const tw = twinkle > 0 && m > 1 ? 1 - twinkle * 0.22 * (0.5 - 0.5 * Math.sin(time * (1.2 + (i % 7) * 0.25) + phase[i])) : 1;
      const alpha =
        clamp(1.15 - 0.13 * m, 0.2, 1) *
        clamp((LIMIT - m) / 0.6) *
        smooth(FAR * F, (FAR - 5) * F, d) *
        smooth(near, near * 2.5, d) *
        dim * tw;
      if (alpha <= 0.01) continue;
      const r = clamp(2.3 - 0.34 * m, 0.55, 3.2);
      const color = C[i];

      if (warp > 0.02 && m < 5) {
        // The streak: where this star was a moment ago, at its old depth
        const d2 = Math.max(near, d + lag);
        let x2 = cx + (F * (X[i] - dx)) / d2;
        let y2 = cy + (F * (Y[i] - dy)) / d2;
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
    clock = now / 1000;
    // The beginning (GENESIS), on the first leg only: the void with its first light swelling, then
    // the blast and the new universe growing out of the center (`scale`, 1 when nothing happens)
    const first = u < 1.2;
    const before = first && u < GENESIS.bang;
    const glow = before ? smooth(GENESIS.glow[0], GENESIS.glow[1], u) : 0;
    const banged = first && u >= GENESIS.bang;
    const blast = banged ? clamp((u - GENESIS.bang) / GENESIS.blast) : 0;
    const grown = banged ? 1 - (1 - smooth(GENESIS.bang, GENESIS.born, u)) ** 3 : 1;
    // Only a reader's fast flick is too fast to watch it: then the beginning steps aside, as
    // galaxies dim in fast flight. A menu jump slows down through it (journey.ts::flyTo), so it
    // plays in full
    const intact = 1 - smooth(6 * F, 20 * F, Math.abs(speed));
    const born = banged ? 1 - (1 - smooth(GENESIS.bang + 0.02, GENESIS.bang + 0.2, u)) * intact : 1;
    const scale = 1 - (1 - (0.06 + 0.94 * grown)) * intact;
    const genesis = first && u > GENESIS.glow[0] - 0.02 && u < GENESIS.born + 0.04;
    // Landing back in Amman's air at the end, where the stars twinkle again
    const pre = smooth(0, 0.6, end);
    const landed = smooth(0.4, 1, end);
    const twinkle = reduced ? 0 : landed;
    if (now - lightAt > 30_000) {
      lightAt = now;
      light = daylight(clockNow());
      descent = blend(DESCENT);
      homeSky = blend(HOME);
      starlight = LOOKS.reduce((sum, k) => sum + STARLIGHT[k] * light[k], 0);
      drawnKey = '';
    }
    // Prepare the homecoming a little at a time, long before it is needed
    if (!globe.done) globe.step(48);
    if (!milkyWay && u > lastStop - 5 && galaxies.every((g) => g.sprite || g.z - z > (FAR + 4) * F)) {
      milkyWay = paintGalaxy('milkyway', makeCanvas);
    }
    // The drift: in open space, none over Amman
    const drift = reduced ? 0 : 1 - landed;
    const T = 2 * Math.PI * clock;
    dz = drift * 0.1 * F * Math.sin(T / 16);
    dx = drift * (0.012 * w * Math.sin(T / 21) + 0.02 * w * leanX);
    dy = drift * (0.009 * h * Math.sin(T / 27 + 1) + 0.016 * h * leanY);
    breath = 1 + drift * 0.015 * Math.sin(T / 16);
    const L = homeLevel(home);
    if (L > 0.3 && L < 2.5) orbitClock += dt;

    const moving = Math.abs(speed) > 1 || meteors.active() || twinkle > 0.01 || !globe.done || leaned || genesis;
    leaned = false;
    const key = `${z.toFixed(1)}|${speed.toFixed(0)}|${home.toFixed(4)}|${end.toFixed(4)}|${w}|${h}`;
    if (drift < 0.01 && !moving && key === drawnKey) return;
    // While only the slow drift moves, half the frame rate is plenty
    if (!moving && key === drawnKey && now - lastDraw < 30) return;
    drawnKey = key;
    lastDraw = now;

    if (before) {
      // The void: nothing yet, not even darkness's color
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      if (genesis) drawGenesis(glow, 0, 1, dt, intact);
      return;
    }
    const top = mix(mix(SPACE[0], descent[0], pre), homeSky[0], landed);
    const low = mix(mix(SPACE[1], descent[1], pre), homeSky[1], landed);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, rgb(top));
    sky.addColorStop(0.55, rgb(mix(top, low, 0.25)));
    sky.addColorStop(1, rgb(low));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // In the beginning the whole view shrinks toward the center, then grows out of it
    const scaled = scale < 0.999;
    if (scaled) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
    }
    // Galaxies and their color dim in a fast flight (a jump), so they never flash past
    drawSpace(born * (1 - pre) * (1 - 0.75 * smooth(6 * F, 20 * F, Math.abs(speed))), 1 / scale);
    // Home fades into Amman's sky as the city comes into view; by day the stars go with it
    const homeFade = 1 - smooth(0.05, 0.45, end);
    drawHomeBack(L, homeFade);
    drawStars(now / 1000, born * (1 - (1 - starlight) * landed), twinkle, 1 / scale);
    drawHomeFront(L, homeFade);
    if (scaled) ctx.restore();

    if (!reduced) {
      const area = clamp((w * h) / (1440 * 900), 0.4, 1.5);
      // None in deep space, more and more over Amman while its sky is dark; once its sky is half
      // daylight, only the rare dim daytime ones
      const dark = Math.max(0, 1 - 2 * light.day);
      // By day, now and then a faint one still crosses (DAY_METEORS a second, drawn dim)
      const rate = (0.25 + 2.1 * end ** 1.5) * area * pre * dark + DAY_METEORS * area * pre * (1 - dark);
      const floor = end > 0.05 && Number.isFinite(horizonY) ? clamp(horizonY / h, 0.3, 0.95) : 0.92;
      spawnDebt += dt * rate;
      while (spawnDebt >= 1) {
        meteors.spawn(w, h, false, floor, 0.5 * landed);
        spawnDebt -= 1;
      }
      nextBolide -= dt * pre * dark;
      if (nextBolide <= 0) {
        meteors.spawn(w, h, true, floor, 0.5 * landed);
        nextBolide = rand(7, 12);
      }
      meteors.update(dt);
      meteors.draw(ctx, DAY_METEOR_DIM + (1 - DAY_METEOR_DIM) * dark);
    }
    if (genesis) drawGenesis(0, blast, scale, dt, intact);
    else flash = 0;
  }

  /**
   * The beginning, over everything else on the canvas: the afterglow of the young universe, the
   * new universe's reach, the first light (`glow`, 0..1 as it swells in the void), and the blast's
   * flash, shock and sparks. All centered where the camera looks.
   */
  function drawGenesis(glow: number, blast: number, scale: number, dt: number, strength: number) {
    const reach = Math.hypot(w, h) / 2;
    ctx.globalCompositeOperation = 'lighter';
    // The afterglow: the young universe still glowing as it cools, mottled like the cosmic
    // microwave background, growing with everything else
    const embers = smooth(0.12, 0.3, blast) * (1 - smooth(0.4, 0.62, blast)) * 0.3 * strength;
    if (embers > 0.01) {
      afterglow ??= paintAfterglow();
      const size = reach * 1.3 * scale;
      ctx.globalAlpha = embers;
      ctx.drawImage(afterglow, cx - size, cy - size * 0.62, size * 2, size * 1.24);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // The edge: the new universe reaching out, which also hides where the shrunken star field ends
    const edge = reach * (0.06 + 1.3 * scale);
    if (blast > 0 && edge < reach * 1.2) {
      const dark = ctx.createRadialGradient(cx, cy, edge * 0.5, cx, cy, Math.max(edge, 1));
      dark.addColorStop(0, 'rgba(3,4,12,0)');
      dark.addColorStop(1, `rgba(3,4,12,${strength})`);
      ctx.fillStyle = dark;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.globalCompositeOperation = 'lighter';
    // The first light: a point that appears as soon as the page moves and swells, brighter and
    // more restless, until it bursts; the flash takes over from it
    const point = ((glow > 0 ? smooth(0, 0.06, glow) : 0) + (blast > 0 ? 1 - smooth(0, 0.06, blast) : 0)) * strength;
    if (point > 0.01) {
      const k = blast > 0 ? 1 : glow;
      const pulse = reduced ? 1 : 1 + (0.06 + 0.14 * k) * Math.sin(clock * (2 + 5 * k));
      const g = (12 + 150 * k ** 1.6) * pulse;
      const a = Math.min(1, point);
      ctx.globalAlpha = a;
      ctx.drawImage(coreSprite, cx - g, cy - g, g * 2, g * 2);
      // Faint spikes, as the eye sees around a bright point
      const spike = (16 + 240 * k ** 1.5) * pulse;
      ctx.globalAlpha = a * (0.15 + 0.35 * k);
      for (const [dx1, dy1] of [[1, 0], [0, 1]]) {
        const ray = ctx.createLinearGradient(cx - dx1 * spike, cy - dy1 * spike, cx + dx1 * spike, cy + dy1 * spike);
        ray.addColorStop(0, 'rgba(255,246,230,0)');
        ray.addColorStop(0.5, 'rgba(255,246,230,1)');
        ray.addColorStop(1, 'rgba(255,246,230,0)');
        ctx.fillStyle = ray;
        if (dx1) ctx.fillRect(cx - spike, cy - 0.7, spike * 2, 1.4);
        else ctx.fillRect(cx - 0.7, cy - spike, 1.4, spike * 2);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fffbf4';
      ctx.beginPath();
      ctx.arc(cx, cy, (1.4 + 4.5 * k ** 1.5) * pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // The blast: a flash from the point, white to gold to ember red, and a shock ring racing out.
    // The flash may only brighten at FLASH_RISE a second, however fast the scroll
    // Rewound (a jump back to the hero), the universe only contracts into the light: no flash
    const burst = rewind ? 0 : strength;
    const target = blast > 0 ? smooth(0, 0.1, blast) * (1 - smooth(0.1, 1, blast)) * burst : 0;
    flash = target > flash ? Math.min(target, flash + dt * FLASH_RISE) : target;
    if (flash > 0.005) {
      const R = reach * (0.04 + 1.25 * (1 - (1 - blast) ** 3));
      const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      bloom.addColorStop(0, `rgba(255,252,246,${flash})`);
      bloom.addColorStop(0.22, `rgba(255,228,180,${0.85 * flash})`);
      bloom.addColorStop(0.5, `rgba(255,156,90,${0.42 * flash})`);
      bloom.addColorStop(0.8, `rgba(190,70,50,${0.14 * flash})`);
      bloom.addColorStop(1, 'rgba(120,30,40,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, w, h);
    }
    // The shock: a soft shell of light racing out ahead of the flash
    const shock = blast > 0 ? 0.4 * (1 - blast) * smooth(0, 0.04, blast) * Math.min(1, flash / Math.max(target, 0.01)) * burst : 0;
    if (shock > 0.01) {
      const r = reach * 1.5 * (1 - (1 - blast) ** 2);
      const shell = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r);
      shell.addColorStop(0, 'rgba(255,214,170,0)');
      shell.addColorStop(0.75, `rgba(255,232,206,${shock})`);
      shell.addColorStop(1, 'rgba(255,232,206,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = shell;
      ctx.fillRect(0, 0, w, h);
    }
    // Sparks: matter thrown out of the point, slowing as space grows, gone before the first title
    // gathers (sparks are the one streak here, and never behind text)
    const spark = blast > 0 ? (1 - blast) ** 1.5 * (1 - smooth(0.25, 0.45, blast)) * burst : 0;
    if (spark > 0.01) {
      const travel = 1 - (1 - blast) ** 2.2;
      ctx.lineCap = 'round';
      for (const p of SPARKS) {
        const r = p.speed * reach * travel;
        const tail = r * (1 - 0.16 * (1 - blast));
        const cos = Math.cos(p.angle);
        const sin = Math.sin(p.angle);
        ctx.globalAlpha = spark * p.bright;
        ctx.strokeStyle = SPARK_COLORS[p.color];
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(cx + cos * tail, cy + sin * tail);
        ctx.lineTo(cx + cos * r, cy + sin * r);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /**
   * The young universe's afterglow: overlapping soft blotches of ember light, thinning toward the
   * edges so the texture never shows a border.
   */
  function paintAfterglow(): Canvas {
    const W = 320;
    const H = 200;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d') as Ctx;
    // Every blotch stays inside the canvas (center within 0.28 of it, radius under 0.18 of its
    // height), or the stretched texture would show its straight edges
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * 0.28;
      const x = W / 2 + Math.cos(a) * d * W;
      const y = H / 2 + Math.sin(a) * d * H;
      const r = (0.08 + 0.1 * Math.random()) * H;
      const v = Math.random();
      const color = `${Math.round(220 + 35 * v)},${Math.round(90 + 90 * v)},${Math.round(50 + 50 * v)}`;
      const blot = g.createRadialGradient(x, y, 0, x, y, r);
      blot.addColorStop(0, `rgba(${color},${0.22 + 0.2 * Math.random()})`);
      blot.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = blot;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return c;
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
          lastStop = Math.max(0, ...msg.legs.map((l) => l.last));
          buildField();
          break;
        case 'camera':
          z = msg.z;
          speed = msg.speed;
          rewind = msg.rewind;
          u = msg.u;
          home = msg.home;
          end = msg.end;
          horizonY = msg.horizonY;
          return;
        case 'lean':
          leanX = msg.x;
          leanY = msg.y;
          leaned = true;
          return;
        case 'motion':
          reduced = msg.reduced;
          if (reduced) meteors.clear();
          break;
        case 'visible':
          visible = msg.visible;
          break;
        case 'wish': {
          // Nothing to wish on in the void before the beginning
          if (reduced || !visible || (u < 1.2 && u < GENESIS.bang)) return;
          const floorY = end > 0.2 && Number.isFinite(horizonY) ? Math.min(h, horizonY) : h;
          meteors.launch(msg.x, msg.y, w, floorY);
          return;
        }
      }
      sync();
    },
  };
}

