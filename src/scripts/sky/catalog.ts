/**
 * The star catalog, prepared once into flat typed arrays so projecting ~2,500 points per frame
 * allocates nothing.
 */
import sky from '../../data/sky.json';
import { AMMAN, RAD } from './astro';

const SIN_LAT = Math.sin(AMMAN.lat * RAD);
const COS_LAT = Math.cos(AMMAN.lat * RAD);

/** Screen geometry of the projection: center and the radius of the horizon circle. */
export interface View {
  cx: number;
  cy: number;
  R: number;
}

/**
 * Points on the celestial sphere and their projected screen positions. Projection is
 * stereographic from the nadir with the zenith at the center, north up and east on the left,
 * as the sky looks lying on your back (and as an astrolabe plate draws it). `u` is the sine of
 * altitude: 0 at the horizon, 1 at the zenith.
 */
export class PointSet {
  readonly ra: Float64Array;
  readonly sinDec: Float64Array;
  readonly cosDec: Float64Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly u: Float32Array;

  constructor(raDeg: ArrayLike<number>, decDeg: ArrayLike<number>) {
    const n = raDeg.length;
    this.ra = new Float64Array(n);
    this.sinDec = new Float64Array(n);
    this.cosDec = new Float64Array(n);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.u = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.ra[i] = raDeg[i] * RAD;
      this.sinDec[i] = Math.sin(decDeg[i] * RAD);
      this.cosDec[i] = Math.cos(decDeg[i] * RAD);
    }
  }

  get length() {
    return this.ra.length;
  }

  project(lst: number, { cx, cy, R }: View) {
    for (let i = 0; i < this.ra.length; i++) {
      const H = lst - this.ra[i];
      const cosH = Math.cos(H);
      const sd = this.sinDec[i];
      const cd = this.cosDec[i];
      const e = -cd * Math.sin(H);
      const n = sd * COS_LAT - cd * cosH * SIN_LAT;
      const u = sd * SIN_LAT + cd * cosH * COS_LAT;
      const k = R / (1 + u);
      this.x[i] = cx - e * k;
      this.y[i] = cy - n * k;
      this.u[i] = u;
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

// Constellation figures: all vertices in one set, segments as index pairs into it
const vRa: number[] = [];
const vDec: number[] = [];
const segA: number[] = [];
const segB: number[] = [];
export const constellations = sky.constellations.map((c) => {
  const first = segA.length;
  for (const line of c.lines) {
    const base = vRa.length;
    for (let j = 0; j < line.length; j += 2) {
      vRa.push(line[j]);
      vDec.push(line[j + 1]);
    }
    for (let j = 1; j < line.length / 2; j++) {
      segA.push(base + j - 1);
      segB.push(base + j);
    }
  }
  return { id: c.id, rank: c.rank, first, last: segA.length };
});
export const vertices = new PointSet(vRa, vDec);
export const segmentsA = Uint16Array.from(segA);
export const segmentsB = Uint16Array.from(segB);
export const centers = new PointSet(
  sky.constellations.map((c) => c.center[0]),
  sky.constellations.map((c) => c.center[1]),
);

// Arabic-named stars, in the order of `starNames`
export const named = new PointSet(
  sky.named.map((s) => s.ra),
  sky.named.map((s) => s.dec),
);
