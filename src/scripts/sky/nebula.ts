/**
 * The young universe's gas (GENESIS.dust), which the camera flies through between the Big Bang
 * and the first title (owner's request, 2026-11-13). Sheets of glowing gas, each a cloud painted
 * once from warped fractal noise (`paint`): filaments, knots and dark dust lanes, colored from
 * thin to dense through its own palette. It starts in the blast's own gold and ember, so it runs
 * on from the afterglow, then rose, magenta, violet and blue weave through each other. Each sheet
 * waits at its own depth on the route; as the camera nears, it grows, fills the view and passes,
 * so the flight goes through the gas, not past pictures of it. Newborn stars shine inside it. No
 * galaxy shows until it thins (sky/journey.ts, `cosmos`), and the stars behind it are dimmed.
 *
 * Cheap on purpose (Safari paints large gradients slowly): the clouds are painted a band of rows
 * per frame from the moment the sky starts, long before they are needed (`step`), and every
 * frame draws the sheets into a small layer (a third of the screen's size each way), which is
 * stretched over the sky once. The gas is soft, so the small layer never shows.
 */
type Canvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Each cloud's texture size, in pixels. */
const TEX = 256;
/** Rows of one cloud painted per frame. */
const ROWS = 12;
/** The layer's size against the screen. */
const LAYER = 1 / 3;

/**
 * Thin, middle and dense gas for each palette, in the order the camera meets them: the blast's
 * own colors first, so the gas grows out of its afterglow, then cooling (owner's request,
 * 2026-11-13: the passage should run on from the explosion, orange before pink, purple and blue).
 */
const PALETTES: number[][][] = [
  // Flare: the gold of the flash's edge
  [[150, 70, 18], [252, 168, 74], [255, 236, 196]],
  // Ember: the afterglow still cooling
  [[140, 46, 18], [242, 122, 48], [255, 206, 150]],
  // Rose: hydrogen glowing
  [[104, 26, 72], [222, 92, 138], [255, 204, 214]],
  // Magenta, between the rose and the violet
  [[78, 28, 106], [184, 88, 200], [242, 202, 255]],
  // Violet
  [[52, 36, 124], [134, 98, 228], [214, 202, 255]],
  // Blue: the first starlight
  [[18, 52, 104], [64, 142, 218], [192, 232, 255]],
];

/**
 * The sheets in the order the camera meets them: share of the passage where it is reached, which
 * cloud (`tex`, palette), turn, mirror, offset from the line of flight (focal lengths) and
 * brightness. The first are the blast's gold and ember, still ahead in its fading haze as the
 * passage begins; after them the palettes interleave, so the colors weave through each other
 * (owner's choice, 2026-11-13: a strict warm-to-cool order looked less alive), ending cool as the
 * gas thins out.
 */
const SHEETS = [
  { at: 0.26, tex: 0, turn: 0.4, flip: 1, ox: 0.08, oy: -0.05, bright: 0.9 },
  { at: 0.33, tex: 1, turn: 3.6, flip: -1, ox: -0.1, oy: 0.04, bright: 0.85 },
  { at: 0.4, tex: 2, turn: 2.1, flip: 1, ox: 0.12, oy: 0.08, bright: 0.85 },
  { at: 0.47, tex: 0, turn: 5.0, flip: -1, ox: -0.06, oy: -0.1, bright: 0.75 },
  { at: 0.54, tex: 4, turn: 1.3, flip: 1, ox: 0.1, oy: 0.1, bright: 0.85 },
  { at: 0.61, tex: 1, turn: 4.4, flip: -1, ox: -0.12, oy: 0.02, bright: 0.75 },
  { at: 0.68, tex: 3, turn: 0.2, flip: 1, ox: 0.04, oy: -0.12, bright: 0.85 },
  { at: 0.75, tex: 5, turn: 2.9, flip: -1, ox: 0.14, oy: 0.06, bright: 0.8 },
  { at: 0.82, tex: 2, turn: 5.6, flip: 1, ox: -0.1, oy: 0.1, bright: 0.8 },
  { at: 0.89, tex: 4, turn: 1.9, flip: -1, ox: 0.06, oy: -0.06, bright: 0.8 },
  { at: 0.96, tex: 5, turn: 3.3, flip: 1, ox: -0.04, oy: 0.12, bright: 0.85 },
];

/** How deep the passage is, in focal lengths: the camera flies this far through the gas. */
const DEPTH = 4.3;
/**
 * Nearest and farthest a sheet is drawn, in focal lengths: six or seven show at once, near ones
 * over far ones, so the colors weave through each other.
 */
const NEAR = 0.22;
const FAR = 2.9;
/** A sheet's width at one focal length, in focal lengths. */
const SIZE = 1.9;
/**
 * Each sheet's share of light. The sheets add their light, and with no opening in the middle
 * (no tunnel) they all overlap there, which burned to white at full strength.
 */
const GAIN = 0.62;

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D gradient noise, about -0.7..0.7, from a seeded permutation. */
function gradientNoise(seed: number) {
  const rnd = seeded(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = rnd() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const a = perm[X + perm[Y]];
    const b = perm[X + 1 + perm[Y]];
    const c = perm[X + perm[Y + 1]];
    const d = perm[X + 1 + perm[Y + 1]];
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const n00 = gx[a] * xf + gy[a] * yf;
    const n10 = gx[b] * (xf - 1) + gy[b] * yf;
    const n01 = gx[c] * xf + gy[c] * (yf - 1);
    const n11 = gx[d] * (xf - 1) + gy[d] * (yf - 1);
    const top = n00 + (n10 - n00) * u;
    const bottom = n01 + (n11 - n01) * u;
    return top + (bottom - top) * v;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createNebula(makeCanvas: (w: number, h: number) => Canvas) {
  const clouds: (Canvas | null)[] = PALETTES.map(() => null);
  // The cloud being painted: its pixels so far and the next row
  let painting = 0;
  let row = 0;
  let image: ImageData | null = null;
  let noise = gradientNoise(1);
  let layer: Canvas | null = null;
  let lctx: Ctx | null = null;

  /** Fractal noise: `octaves` layers of gradient noise, each finer and fainter. */
  const fbm = (x: number, y: number, octaves: number) => {
    let sum = 0;
    let amp = 0.5;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x, y);
      x = x * 2.03 + 17.1;
      y = y * 2.03 - 9.7;
      amp *= 0.5;
    }
    return sum;
  };

  /**
   * Paint rows of cloud `k`: noise warped by noise (so the gas swirls into filaments), ridges
   * along the swirls and dark lanes of dust across them, fading out toward the edges so a sheet
   * never shows a border.
   */
  function paint(k: number, from: number, to: number) {
    const [thin, mid, dense] = PALETTES[k];
    const px = image!.data;
    const off = k * 7.31;
    for (let y = from; y < to; y++) {
      for (let x = 0; x < TEX; x++) {
        const nx = (x + 0.5) / TEX - 0.5;
        const ny = (y + 0.5) / TEX - 0.5;
        const r = Math.hypot(nx, ny) * 2;
        const i = (y * TEX + x) * 4;
        if (r >= 0.98) {
          px[i + 3] = 0;
          continue;
        }
        const sx = nx * 3.2 + off;
        const sy = ny * 3.2 - off;
        const qx = fbm(sx + 1.7, sy + 9.2, 4);
        const qy = fbm(sx + 8.3, sy + 2.8, 4);
        const wx = sx + 2.6 * qx;
        const wy = sy + 2.6 * qy;
        const body = smooth(-0.12, 0.42, fbm(wx, wy, 5));
        const ridge = (1 - Math.min(1, Math.abs(fbm(wx * 1.1 + 5.2, wy * 1.1 - 3.1, 3)) * 2.4)) ** 2;
        const lane = smooth(0.05, 0.3, fbm(wx * 2.2 - 11, wy * 2.2 + 6, 3));
        // The soft outer edge, uneven; no opening in the middle, so the camera flies through gas
        // rather than down a tunnel (owner's request, 2026-11-13)
        const mask = 1 - smooth(0.5 + 0.12 * qx, 0.98, r);
        const a = Math.min(1, (0.66 * body + 0.4 * ridge * (0.35 + body)) * (1 - 0.7 * lane)) * mask;
        const toMid = smooth(0, 0.55, a);
        const toDense = smooth(0.5, 1, a);
        for (let c = 0; c < 3; c++) {
          px[i + c] = thin[c] + (mid[c] - thin[c]) * toMid + (dense[c] - mid[c]) * toDense;
        }
        px[i + 3] = 255 * a;
      }
    }
  }

  // Newborn stars inside the gas: across the passage (`at`), off the line of flight (r, angle)
  const rnd = seeded(29);
  const STARS = Array.from({ length: 90 }, () => ({
    at: rnd(),
    r: 0.12 + 0.9 * rnd() ** 0.7,
    angle: rnd() * Math.PI * 2,
    bright: 0.4 + 0.6 * rnd(),
    blue: rnd() < 0.7,
  }));
  const starSprite = (() => {
    const c = makeCanvas(32, 32);
    const g = c.getContext('2d') as Ctx;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(225,235,255,0.7)');
    grad.addColorStop(1, 'rgba(160,190,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return c;
  })();

  return {
    /** Paint a little more of the clouds; call every frame until `ready`. */
    step() {
      if (painting >= clouds.length) return;
      if (!image) {
        noise = gradientNoise(101 + painting * 37);
        image = new ImageData(TEX, TEX);
        row = 0;
      }
      const to = Math.min(TEX, row + ROWS);
      paint(painting, row, to);
      row = to;
      if (row >= TEX) {
        const c = makeCanvas(TEX, TEX);
        (c.getContext('2d') as Ctx).putImageData(image, 0, 0);
        clouds[painting] = c;
        painting++;
        image = null;
      }
    },
    get ready() {
      return painting >= clouds.length;
    },
    /**
     * Draw the passage: `k` is how far through it the camera is (0..1, beyond at either end),
     * `amount` its overall strength, `turn` a slow drift (radians), (`dx`, `dy`) the camera's drift
     * and lean, centered at (`cx`, `cy`).
     */
    draw(
      ctx: Ctx,
      o: { w: number; h: number; cx: number; cy: number; F: number; k: number; amount: number; turn: number; dx: number; dy: number },
    ) {
      if (o.amount < 0.01) return;
      const lw = Math.max(1, Math.ceil(o.w * LAYER));
      const lh = Math.max(1, Math.ceil(o.h * LAYER));
      if (!layer || layer.width !== lw || layer.height !== lh) {
        layer = makeCanvas(lw, lh);
        lctx = layer.getContext('2d') as Ctx;
      }
      const g = lctx!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, lw, lh);
      g.setTransform(LAYER, 0, 0, LAYER, 0, 0);
      g.globalCompositeOperation = 'lighter';
      let drawn = false;
      for (const s of SHEETS) {
        const cloud = clouds[s.tex];
        if (!cloud) continue;
        const D = NEAR + (s.at - o.k) * DEPTH;
        if (D <= NEAR || D > FAR) continue;
        const a = GAIN * s.bright * smooth(FAR, FAR - 0.9, D) * smooth(NEAR, NEAR + 0.4, D);
        if (a < 0.01) continue;
        const size = (SIZE * o.F) / D;
        g.globalAlpha = Math.min(1, a);
        g.save();
        g.translate(o.cx + (s.ox * o.F - o.dx) / D, o.cy + (s.oy * o.F - o.dy) / D);
        g.rotate(s.turn + o.turn * (s.flip > 0 ? 1 : -1.3));
        g.scale(s.flip, 1);
        g.drawImage(cloud, -size / 2, -size / 2, size, size);
        g.restore();
        drawn = true;
      }
      ctx.globalCompositeOperation = 'lighter';
      if (drawn) {
        ctx.globalAlpha = Math.min(1, o.amount);
        ctx.drawImage(layer!, 0, 0, o.w, o.h);
      }
      // Newborn stars, sharp, on the sky itself
      for (const st of STARS) {
        const D = NEAR + (st.at - o.k) * DEPTH;
        if (D <= NEAR || D > FAR) continue;
        const a = o.amount * st.bright * smooth(FAR, FAR - 0.9, D) * smooth(NEAR, NEAR + 0.25, D);
        if (a < 0.02) continue;
        const x = o.cx + (Math.cos(st.angle + o.turn) * st.r * o.F - o.dx) / D;
        const y = o.cy + (Math.sin(st.angle + o.turn) * st.r * o.F * 0.8 - o.dy) / D;
        if (x < -20 || x > o.w + 20 || y < -20 || y > o.h + 20) continue;
        const s = Math.min(26, 5 + 7 / D);
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(starSprite, x - s / 2, y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}
