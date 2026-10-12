/**
 * The Milky Way: soft light along the galactic plane, brightest toward the galactic center in
 * Sagittarius and in the Cygnus star clouds, with the dark Great Rift between Cygnus and Aquila.
 * Rendered at half resolution into its own canvas, and only when the sky has moved.
 */
import { RAD, galacticToEquatorial } from './astro';
import { PointSet, type View } from './catalog';

interface Sample {
  width: number;
  light: number;
}

function band(step: number, offsets: number[], profile: (l: number, b: number) => Sample) {
  const ra: number[] = [];
  const dec: number[] = [];
  const samples: Sample[] = [];
  let seed = 7;
  const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * step * 0.8;
  for (let l = 0; l < 360; l += step) {
    for (const b of offsets) {
      const ll = l + jitter();
      const bb = b + jitter() * 0.6;
      const p = galacticToEquatorial(ll * RAD, bb * RAD);
      ra.push(p.ra / RAD);
      dec.push(p.dec / RAD);
      samples.push(profile(ll, bb));
    }
  }
  return { points: new PointSet(ra, dec), samples };
}

const near = (l: number, center: number, width: number) => {
  const d = ((l - center + 540) % 360) - 180;
  return Math.exp(-((d / width) ** 2));
};

const glow = band(3, [-4, 0, 4], (l, b) => ({
  width: (5 + 7 * near(l, 0, 70)) * RAD,
  light: (0.3 + 0.7 * near(l, 0, 60) + 0.45 * near(l, 78, 22)) * (1 - Math.abs(b) / 9),
}));
const rift = band(2.5, [0.5], (l) => ({
  width: 2.2 * RAD,
  light: l > 15 && l < 70 ? 1 : 0,
}));

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export function drawMilkyWay(ctx: Ctx, sprite: CanvasImageSource, lst: number, view: View, scale: number) {
  const v = { ...view, cx: view.cx * scale, cy: view.cy * scale, f: view.f * scale };
  glow.points.project(lst, v);
  rift.points.project(lst, v);
  const { x, y, u, k } = glow.points;
  for (let i = 0; i < glow.samples.length; i++) {
    if (u[i] < -0.05 || !k[i]) continue;
    const r = glow.samples[i].width * k[i];
    // Fainter toward the horizon, where the light passes through more air
    ctx.globalAlpha = 0.075 * glow.samples[i].light * Math.min(1, (u[i] + 0.05) * 5);
    ctx.drawImage(sprite, x[i] - r, y[i] - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < rift.samples.length; i++) {
    if (!rift.samples[i].light || rift.points.u[i] < 0 || !rift.points.k[i]) continue;
    const r = rift.samples[i].width * rift.points.k[i];
    ctx.globalAlpha = 0.3;
    ctx.drawImage(sprite, rift.points.x[i] - r, rift.points.y[i] - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
