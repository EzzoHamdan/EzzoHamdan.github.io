/**
 * Astronomy for one place: Amman (31.95° N, 35.93° E). Low-precision formulas (about 0.01° for
 * the Sun), which is far below a pixel at any screen size.
 */
import { showers } from '../../data/sky-names';

export const RAD = Math.PI / 180;
// Jordan has kept UTC+3 all year since 2022, so a fixed offset is exact
export const AMMAN = { lat: 31.95, lon: 35.93, utcOffsetHours: 3 };
const SIN_LAT = Math.sin(AMMAN.lat * RAD);
const COS_LAT = Math.cos(AMMAN.lat * RAD);
const HOUR = 3_600_000;

const julianDay = (ms: number) => ms / 86_400_000 + 2440587.5;
const wrap360 = (deg: number) => ((deg % 360) + 360) % 360;

/** Local sidereal time at Amman, in radians. */
export function siderealTime(ms: number): number {
  const gmst = 280.46061837 + 360.98564736629 * (julianDay(ms) - 2451545.0);
  return wrap360(gmst + AMMAN.lon) * RAD;
}

/** Unit vector in the local sky: e = east, n = north, u = up (u is the sine of altitude). */
export interface Horizontal {
  e: number;
  n: number;
  u: number;
}

export function toHorizontal(ra: number, sinDec: number, cosDec: number, lst: number): Horizontal {
  const H = lst - ra;
  const cosH = Math.cos(H);
  return {
    e: -cosDec * Math.sin(H),
    n: sinDec * COS_LAT - cosDec * cosH * SIN_LAT,
    u: sinDec * SIN_LAT + cosDec * cosH * COS_LAT,
  };
}

function eclipticToEquatorial(lambdaDeg: number, epsDeg: number) {
  const l = lambdaDeg * RAD;
  const e = epsDeg * RAD;
  return { ra: Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l)), dec: Math.asin(Math.sin(e) * Math.sin(l)) };
}

/** The Sun's ecliptic longitude (degrees) and equatorial position (radians). */
export function sun(ms: number) {
  const n = julianDay(ms) - 2451545.0;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lambda = 280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g);
  const eps = 23.439 - 0.0000004 * n;
  return { lambda, eps, ...eclipticToEquatorial(lambda, eps) };
}

export function sunAltitude(ms: number): number {
  const s = sun(ms);
  return Math.asin(toHorizontal(s.ra, Math.sin(s.dec), Math.cos(s.dec), siderealTime(ms)).u) / RAD;
}

// Galactic (l, b) to equatorial J2000, for drawing the Milky Way along the galactic plane
const NGP_RA = 192.85948 * RAD;
const NGP_DEC = 27.12825 * RAD;
const L_NCP = 122.93192 * RAD;
export function galacticToEquatorial(l: number, b: number) {
  const d = L_NCP - l;
  const sinDec = Math.sin(NGP_DEC) * Math.sin(b) + Math.cos(NGP_DEC) * Math.cos(b) * Math.cos(d);
  const y = Math.cos(b) * Math.sin(d);
  const x = Math.cos(NGP_DEC) * Math.sin(b) - Math.sin(NGP_DEC) * Math.cos(b) * Math.cos(d);
  return { ra: NGP_RA + Math.atan2(y, x), dec: Math.asin(sinDec) };
}

export interface Night {
  /** 'now' when it is dark in Amman; otherwise the page shows tonight at 21:00. */
  mode: 'now' | 'tonight';
  /** The moment the sky is drawn for, in ms since epoch. */
  time: number;
  /** Index into `showers` when tonight is within a day of a shower's peak, else -1. */
  shower: number;
}

/** The moment the sky shows: now if it is dark in Amman, otherwise 21:00 tonight. */
export function night(now = Date.now()): Night {
  const dark = sunAltitude(now) < -8;
  let time = now;
  if (!dark) {
    const local = new Date(now + AMMAN.utcOffsetHours * HOUR);
    time = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 21) - AMMAN.utcOffsetHours * HOUR;
    if (time < now) time += 24 * HOUR;
  }
  const date = new Date(time + AMMAN.utcOffsetHours * HOUR);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const shower = showers.findIndex(
    (s) => Math.abs(day - Date.UTC(date.getUTCFullYear(), s.month - 1, s.day)) <= 86_400_000,
  );
  return { mode: dark ? 'now' : 'tonight', time, shower };
}
