/**
 * The star catalog, prepared once into flat typed arrays so projecting it allocates nothing.
 */
import sky from '../../data/sky.json';
import { AMMAN, RAD } from './astro';

const SIN_LAT = Math.sin(AMMAN.lat * RAD);
const COS_LAT = Math.cos(AMMAN.lat * RAD);

/**
 * A camera looking out from Amman: screen center, focal length in pixels, and its basis vectors
 * in local sky coordinates (east, north, up). Built by `camera()`.
 */
export interface View {
  cx: number;
  cy: number;
  f: number;
  /** Lens: 1 = stereographic (the dome), 0 = rectilinear (a camera lens, straight horizon). */
  lens: number;
  fwd: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
}

/**
 * A camera at azimuth `az` (degrees from north toward east) and altitude `alt`, whose
 * field of view reaches `fov` degrees from the center to each screen corner. Looking straight up with az = 180 gives the
 * astrolabe view: north at the top, east on the left; fov = 90 puts the horizon at the corners.
 *
 * `lens` blends the projection (r ∝ sin θ / (lens + cos θ)): 1 is stereographic, the wide,
 * conformal dome; 0 is rectilinear, where great circles such as the horizon are straight lines.
 */
export function camera(w: number, h: number, az: number, alt: number, fov: number, lens = 1): View {
  const A = az * RAD;
  const t = alt * RAD;
  const fwd: [number, number, number] = [Math.sin(A) * Math.cos(t), Math.cos(A) * Math.cos(t), Math.sin(t)];
  const right: [number, number, number] = [Math.cos(A), -Math.sin(A), 0];
  const up: [number, number, number] = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  // `fov` is the angle from the center of view to a screen corner; pick the focal length that
  // puts the corners exactly there (for lens = 1 this is the plain stereographic R / tan(fov/2))
  const corner = fov * RAD;
  const f = ((Math.hypot(w, h) / 2) * (lens + Math.cos(corner))) / Math.sin(corner);
  return { cx: w / 2, cy: h / 2, f, lens, fwd, right, up };
}

/** Project a direction in local sky coordinates; returns pixels and the local scale (px/rad). */
export function projectVector(e: number, n: number, u: number, v: View) {
  const d = e * v.fwd[0] + n * v.fwd[1] + u * v.fwd[2];
  if (v.lens + d < 0.05) return { x: -1e6, y: -1e6, k: 0 };
  const k = v.f / (v.lens + d);
  return {
    x: v.cx + (e * v.right[0] + n * v.right[1] + u * v.right[2]) * k,
    y: v.cy - (e * v.up[0] + n * v.up[1] + u * v.up[2]) * k,
    k,
  };
}

/**
 * Points on the celestial sphere and their projected screen positions, through the camera's
 * lens (see `camera`): stereographic for the wide dome, blending to rectilinear near the horizon. `u` is the sine of altitude: 0 at the horizon, 1 at the zenith;
 * `k` is the local scale in pixels per radian, for sizing extended things like the Milky Way.
 */
export class PointSet {
  readonly ra: Float64Array;
  readonly sinDec: Float64Array;
  readonly cosDec: Float64Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly u: Float32Array;
  readonly k: Float32Array;

  constructor(raDeg: ArrayLike<number>, decDeg: ArrayLike<number>) {
    const n = raDeg.length;
    this.ra = new Float64Array(n);
    this.sinDec = new Float64Array(n);
    this.cosDec = new Float64Array(n);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.u = new Float32Array(n);
    this.k = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.ra[i] = raDeg[i] * RAD;
      this.sinDec[i] = Math.sin(decDeg[i] * RAD);
      this.cosDec[i] = Math.cos(decDeg[i] * RAD);
    }
  }

  get length() {
    return this.ra.length;
  }

  project(lst: number, v: View) {
    const [f0, f1, f2] = v.fwd;
    const [r0, r1, r2] = v.right;
    const [u0, u1, u2] = v.up;
    for (let i = 0; i < this.ra.length; i++) {
      const H = lst - this.ra[i];
      const cosH = Math.cos(H);
      const sd = this.sinDec[i];
      const cd = this.cosDec[i];
      const e = -cd * Math.sin(H);
      const n = sd * COS_LAT - cd * cosH * SIN_LAT;
      const u = sd * SIN_LAT + cd * cosH * COS_LAT;
      const d = e * f0 + n * f1 + u * f2;
      this.u[i] = u;
      if (v.lens + d < 0.05) {
        // Behind the camera: park it far off screen
        this.x[i] = -1e6;
        this.y[i] = -1e6;
        this.k[i] = 0;
        continue;
      }
      const k = v.f / (v.lens + d);
      this.x[i] = v.cx + (e * r0 + n * r1 + u * r2) * k;
      this.y[i] = v.cy - (e * u0 + n * u1 + u * u2) * k;
      this.k[i] = k;
    }
  }
}

export function projectOne(raRad: number, decRad: number, lst: number, view: View) {
  const p = new PointSet([raRad / RAD], [decRad / RAD]);
  p.project(lst, view);
  return { x: p.x[0], y: p.y[0], u: p.u[0] };
}

// Stars, brightest first
export const stars = new PointSet(
  sky.stars.map((s) => s[0]),
  sky.stars.map((s) => s[1]),
);
export const starMag = Float32Array.from(sky.stars, (s) => s[2]);
export const starColor = Uint8Array.from(sky.stars, (s) => s[3]);

// Arabic-named stars, in the order of `starNames`
export const named = new PointSet(
  sky.named.map((s) => s.ra),
  sky.named.map((s) => s.dec),
);
