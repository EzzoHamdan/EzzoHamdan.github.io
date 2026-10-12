/**
 * Galaxies for the journey, each painted once into its own sprite from a few thousand points of
 * light: spiral arms of young blue stars with pink star-forming knots, a warm core of old stars,
 * and dark dust. Each is a simplified portrait of a real galaxy, seen at its real tilt.
 *
 * Painting is deterministic (seeded), so a galaxy looks the same on every visit.
 */
type Canvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export type GalaxyKind = 'andromeda' | 'triangulum' | 'whirlpool' | 'sombrero' | 'milkyway';

/** Sprite size in pixels; every galaxy is centered in it. */
export const SPRITE = 1024;
/** Galaxies are drawn in a 640-pixel design space and scaled up to the sprite. */
const K = SPRITE / 640;
const MID = 320;

const YOUNG = '170,196,255';
const BLUE_WHITE = '214,224,255';
const OLD = '255,222,176';
const WARM = '255,240,214';
const PINK = '255,124,176';
const WHITE = '255,252,244';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function paintGalaxy(kind: GalaxyKind, makeCanvas: (w: number, h: number) => Canvas): Canvas {
  const canvas = makeCanvas(SPRITE, SPRITE);
  const g = canvas.getContext('2d') as Ctx;
  const rnd = seeded(['andromeda', 'triangulum', 'whirlpool', 'sombrero', 'milkyway'].indexOf(kind) * 7919 + 17);
  const gauss = () => {
    let u = 0;
    while (!u) u = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const between = (a: number, b: number) => a + rnd() * (b - a);

  // One soft dot per color, scaled for every point of light
  const dots = new Map<string, Canvas>();
  const dot = (rgb: string) => {
    let c = dots.get(rgb);
    if (!c) {
      c = makeCanvas(32, 32);
      const d = c.getContext('2d') as Ctx;
      const grad = d.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, `rgba(${rgb},1)`);
      grad.addColorStop(0.25, `rgba(${rgb},0.4)`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      d.fillStyle = grad;
      d.fillRect(0, 0, 32, 32);
      dots.set(rgb, c);
    }
    return c;
  };

  // Drawing happens in the galaxy's own plane: `tilt` squashes it to the angle we see it at
  // (1 = face-on) and `angle` turns it on the sky
  let angle = 0;
  const plane = (tilt: number) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    g.setTransform(c * K, s * K, -s * tilt * K, c * tilt * K, SPRITE / 2, SPRITE / 2);
  };
  const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
    g.globalAlpha = a;
    g.drawImage(dot(rgb), x - r, y - r, r * 2, r * 2);
  };
  const speck = (x: number, y: number, rgb: string, a: number) => {
    g.globalAlpha = a;
    g.fillStyle = `rgb(${rgb})`;
    g.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
  };
  const light = () => (g.globalCompositeOperation = 'lighter');
  const dust = () => (g.globalCompositeOperation = 'destination-out');

  /** Points along logarithmic spiral arms, reaching radius R after winding `wind` radians. */
  const arms = (
    n: number, count: number, R: number, pitch: number, wind: number, spread: number, turn: number,
    draw: (x: number, y: number, along: number) => void,
  ) => {
    for (let k = 0; k < count; k++) {
      for (let i = 0; i < n; i++) {
        const along = rnd() ** 0.8;
        const theta = along * wind;
        const r = R * Math.exp(pitch * (theta - wind)) * (1 + gauss() * spread * 0.7);
        const a = theta + turn + (2 * Math.PI * k) / count + gauss() * spread;
        draw(r * Math.cos(a), r * Math.sin(a), along);
      }
    }
  };
  /** Points spread over an exponential disk with scale length `scale`. */
  const disk = (n: number, scale: number, max: number, draw: (x: number, y: number, r: number) => void) => {
    for (let i = 0; i < n; i++) {
      const r = Math.min(max, -Math.log(1 - rnd() * 0.995) * scale);
      const a = rnd() * Math.PI * 2;
      draw(r * Math.cos(a), r * Math.sin(a), r);
    }
  };
  /** Light along an arm: a wide diffuse band, young stars in it, and a few sharp specks. */
  const armLight = (x: number, y: number, rgb: string, strength = 1) => {
    glow(x, y, between(14, 26), rgb, 0.012 * strength);
    glow(x, y, between(2.5, 6), rgb, 0.05 * strength);
    if (rnd() < 0.35) speck(x, y, BLUE_WHITE, between(0.25, 0.75));
  };
  /** A soft spheroid of old stars: the bulge or halo. */
  const bulge = (r: number, rgb: string, a: number) => glow(0, 0, r, rgb, a);

  light();
  const R = 640 * 0.4;

  if (kind === 'andromeda') {
    // M31: a big spiral seen almost edge-on, warm bulge, blue outer arms, dust lanes on the near
    // side, and two companions (M32 close to the disk, M110 farther out)
    angle = -0.62;
    const tilt = 0.3;
    plane(tilt);
    disk(2600, R * 0.32, R * 1.05, (x, y, r) => glow(x, y, between(8, 22), r < R * 0.45 ? OLD : BLUE_WHITE, 0.03));
    arms(2600, 2, R, 0.11, 3.4 * Math.PI, 0.09, 0, (x, y, along) => armLight(x, y, along > 0.35 ? YOUNG : WARM));
    dust();
    arms(900, 2, R * 0.93, 0.11, 3.4 * Math.PI, 0.05, -0.22, (x, y) => {
      if (y > -R * 0.05) glow(x, y, between(6, 13), WHITE, 0.16);
    });
    light();
    plane(0.55);
    bulge(R * 0.75, OLD, 0.42);
    bulge(R * 0.34, WARM, 0.85);
    bulge(R * 0.09, WHITE, 1);
    g.setTransform(K, 0, 0, K, 0, 0);
    glow(MID + R * 0.16, MID + R * 0.1, R * 0.07, WARM, 0.9); // M32
    g.setTransform(0.8 * K, -0.5 * K, 0.25 * K, 0.45 * K, (MID - R * 0.36) * K, (MID - R * 0.52) * K); // M110, elongated
    glow(0, 0, R * 0.16, OLD, 0.55);
  } else if (kind === 'triangulum') {
    // M33: a loose, patchy face-on spiral, blue with many pink star-forming regions, including
    // the giant NGC 604, and only a small nucleus
    angle = 0.5;
    const tilt = 0.62;
    plane(tilt);
    disk(2200, R * 0.36, R * 1.05, (x, y) => glow(x, y, between(8, 20), BLUE_WHITE, 0.028));
    arms(3200, 2, R, 0.34, 2.1 * Math.PI, 0.2, 0.4, (x, y) => armLight(x, y, YOUNG, 0.8));
    arms(60, 2, R, 0.34, 2.1 * Math.PI, 0.18, 0.4, (x, y) => glow(x, y, between(2, 5), PINK, 0.35));
    glow(R * 0.42, -R * 0.38, 7, PINK, 0.8); // NGC 604
    dust();
    disk(500, R * 0.4, R, (x, y) => glow(x, y, between(5, 12), WHITE, 0.08));
    light();
    bulge(R * 0.2, OLD, 0.5);
    bulge(R * 0.05, WHITE, 0.9);
  } else if (kind === 'whirlpool') {
    // M51: the grand-design spiral, face-on, with dust along the inner edge of both arms and its
    // companion NGC 5195 at the end of one arm
    angle = 0.25;
    const r = R * 0.82;
    plane(0.88);
    disk(1600, r * 0.35, r * 1.05, (x, y) => glow(x, y, between(8, 20), WARM, 0.026));
    arms(3600, 2, r, 0.24, 2.8 * Math.PI, 0.07, 0, (x, y, along) => armLight(x, y, along > 0.25 ? YOUNG : WARM, 0.9));
    arms(90, 2, r, 0.24, 2.8 * Math.PI, 0.06, 0, (x, y) => glow(x, y, between(2, 4.5), PINK, 0.4));
    dust();
    arms(1300, 2, r * 0.97, 0.24, 2.8 * Math.PI, 0.035, -0.17, (x, y) => glow(x, y, between(4, 9), WHITE, 0.17));
    light();
    bulge(r * 0.36, OLD, 0.6);
    bulge(r * 0.1, WHITE, 1);
    // NGC 5195, where the first arm ends
    const end = 2.8 * Math.PI;
    glow(r * 1.17 * Math.cos(end), r * 1.17 * Math.sin(end), r * 0.22, OLD, 0.75);
    glow(r * 1.17 * Math.cos(end), r * 1.17 * Math.sin(end), r * 0.06, WHITE, 0.9);
  } else if (kind === 'sombrero') {
    // M104: seen nearly edge-on, a huge glowing bulge and halo cut by a dark dust lane, with a
    // bright rim of stars around it
    angle = 0.06;
    plane(0.62);
    bulge(R * 0.95, OLD, 0.32);
    bulge(R * 0.5, WARM, 0.75);
    bulge(R * 0.13, WHITE, 1);
    plane(0.17);
    for (let i = 0; i < 3200; i++) {
      const a = rnd() * Math.PI * 2;
      const r = R * between(0.45, 1.02);
      glow(r * Math.cos(a), r * Math.sin(a), between(5, 12), r > R * 0.9 ? BLUE_WHITE : WARM, 0.045);
    }
    dust();
    // The lane shows across the front half of the ring, just below the core
    for (let i = 0; i < 2600; i++) {
      const a = rnd() * Math.PI;
      const r = R * between(0.5, 0.92);
      glow(r * Math.cos(a), r * Math.sin(a) + R * 0.05, between(6, 12), WHITE, 0.2);
    }
  } else {
    // The Milky Way from outside: a barred spiral, two major arms from the ends of the bar and two
    // fainter ones between them
    angle = -0.35;
    plane(0.68);
    disk(2200, R * 0.34, R * 1.05, (x, y) => glow(x, y, between(8, 20), BLUE_WHITE, 0.026));
    for (let i = 0; i < 600; i++) glow(gauss() * R * 0.16, gauss() * R * 0.05, between(8, 18), OLD, 0.07);
    arms(3000, 2, R, 0.2, 2.4 * Math.PI, 0.08, 0, (x, y) => armLight(x, y, YOUNG));
    arms(1300, 2, R * 0.85, 0.2, 2.4 * Math.PI, 0.1, Math.PI / 2, (x, y) => armLight(x, y, YOUNG, 0.6));
    arms(70, 2, R, 0.2, 2.4 * Math.PI, 0.07, 0, (x, y) => glow(x, y, between(2, 4.5), PINK, 0.35));
    dust();
    arms(1000, 2, R * 0.97, 0.2, 2.4 * Math.PI, 0.04, -0.16, (x, y) => glow(x, y, between(4, 9), WHITE, 0.15));
    light();
    bulge(R * 0.3, OLD, 0.65);
    bulge(R * 0.08, WHITE, 0.95);
  }

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return canvas;
}
