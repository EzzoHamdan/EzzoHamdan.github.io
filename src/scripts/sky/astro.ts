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

/**
 * The page's clock: real time, unless the address previews an hour in Amman (`?at=09:30`), so any
 * time of day can be seen without waiting for it. The worker has no address of its own; the page
 * sends it the offset at init (`setClockOffset`).
 */
let offset = (() => {
  const at = /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(globalThis.location?.search ?? '').get('at') ?? '');
  if (!at) return 0;
  const real = Date.now();
  const local = new Date(real + AMMAN.utcOffsetHours * HOUR);
  const want = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), +at[1], +at[2]) - AMMAN.utcOffsetHours * HOUR;
  return want - real;
})();
export const clockOffset = () => offset;
export const setClockOffset = (ms: number) => {
  offset = ms;
};
export const now = () => Date.now() + offset;

/** "20:47": the time in Amman, for captions. */
export function ammanClock(ms: number) {
  const local = new Date(ms + AMMAN.utcOffsetHours * HOUR);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
}

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

/** The four looks of Amman at the end of the page. */
export const LOOKS = ['night', 'dawn', 'day', 'dusk'] as const;
export type Look = (typeof LOOKS)[number];
export type Daylight = Record<Look, number>;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How Amman looks at a moment, as weights of the four looks that sum to 1, from the Sun's real
 * altitude: night below -16°, twilight from -16° to 14° (dawn while the Sun is in the east, dusk
 * in the west; the low sun's warm light counts as twilight), full day above 14°. Gradual on purpose, as the real light is: the scene drifts
 * from one look to the next over an hour or so instead of switching at set times.
 */
export function daylight(ms: number): Daylight {
  const s = sun(ms);
  const at = toHorizontal(s.ra, Math.sin(s.dec), Math.cos(s.dec), siderealTime(ms));
  const alt = Math.asin(at.u) / RAD;
  const day = smoothstep(-2, 14, alt);
  const night = 1 - smoothstep(-16, -6, alt);
  const twilight = Math.max(0, 1 - day - night);
  const morning = at.e > 0;
  return { night, dawn: morning ? twilight : 0, day, dusk: morning ? 0 : twilight };
}

/** The look with the most weight. */
export const mainLook = (d: Daylight): Look => LOOKS.reduce((a, b) => (d[b] > d[a] ? b : a));

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
export function night(at = now()): Night {
  const dark = sunAltitude(at) < -8;
  let time = at;
  if (!dark) {
    const local = new Date(at + AMMAN.utcOffsetHours * HOUR);
    time = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 21) - AMMAN.utcOffsetHours * HOUR;
    if (time < at) time += 24 * HOUR;
  }
  const date = new Date(time + AMMAN.utcOffsetHours * HOUR);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const shower = showers.findIndex(
    (s) => Math.abs(day - Date.UTC(date.getUTCFullYear(), s.month - 1, s.day)) <= 86_400_000,
  );
  return { mode: dark ? 'now' : 'tonight', time, shower };
}

/**
 * Keplerian elements for the planets and the Earth-Moon barycenter, J2000 ecliptic,
 * valid 1800–2050 (E. M. Standish, JPL, "Approximate Positions of the Planets", table 1):
 * [a (au), e, I, L, ϖ (long. of perihelion), Ω (long. of node)] in degrees, then rates per century.
 * Error is well under a degree for these five, far below a pixel's worth of sky.
 */
const ELEMENTS = {
  mercury: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593,
    0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  venus: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255,
    0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0,
    0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  mars: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
    0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  jupiter: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
    -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
    -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  // Too faint for the naked eye (not in PLANETS), drawn only in the Solar System at the end
  uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503,
    -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574,
    0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
} as const;

/**
 * Brightness: m = H + 5·log10(r·Δ) + phase term (β = Sun–planet–Earth angle, degrees). The phase
 * terms matter for Mercury and Venus, which dim to thin crescents near the Sun (Hilton 2005).
 */
const H_MAG = { mercury: -0.42, venus: -4.4, mars: -1.52, jupiter: -9.4, saturn: -8.88 } as const;
const PHASE = {
  mercury: (b: number) => 0.038 * b - 0.000273 * b ** 2 + 0.000002 * b ** 3,
  venus: (b: number) => 0.0009 * b + 0.000239 * b ** 2 - 0.00000065 * b ** 3,
  mars: (b: number) => 0.016 * b,
  jupiter: (b: number) => 0.005 * b,
  saturn: (b: number) => 0.044 * b,
} as const;
export const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const;
export type Planet = (typeof PLANETS)[number];

function heliocentric(key: keyof typeof ELEMENTS, T: number) {
  const el = ELEMENTS[key];
  const a = el[0] + el[6] * T;
  const e = el[1] + el[7] * T;
  const I = (el[2] + el[8] * T) * RAD;
  const L = el[3] + el[9] * T;
  const peri = el[4] + el[10] * T;
  const node = (el[5] + el[11] * T) * RAD;
  const w = peri * RAD - node;
  const M = ((((L - peri) % 360) + 540) % 360 - 180) * RAD;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(node), sn = Math.sin(node), ci = Math.cos(I), si = Math.sin(I);
  return {
    x: (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    y: (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    z: sw * si * xp + cw * si * yp,
  };
}

/** Geocentric position (radians) and approximate magnitude of each naked-eye planet. */
export function planets(ms: number) {
  const T = (julianDay(ms) - 2451545.0) / 36525;
  const earth = heliocentric('earth', T);
  const eps = 23.43928 * RAD;
  return PLANETS.map((key) => {
    const p = heliocentric(key, T);
    const x = p.x - earth.x;
    const y = p.y - earth.y;
    const z = p.z - earth.z;
    const ye = y * Math.cos(eps) - z * Math.sin(eps);
    const ze = y * Math.sin(eps) + z * Math.cos(eps);
    const r = Math.hypot(p.x, p.y, p.z);
    const delta = Math.hypot(x, y, z);
    const R = Math.hypot(earth.x, earth.y, earth.z);
    const beta = Math.acos(Math.max(-1, Math.min(1, (r * r + delta * delta - R * R) / (2 * r * delta)))) / RAD;
    return {
      key,
      ra: Math.atan2(ye, x),
      dec: Math.atan2(ze, Math.hypot(x, ye)),
      lambda: (Math.atan2(y, x) / RAD + 360) % 360,
      mag: H_MAG[key] + 5 * Math.log10(r * delta) + PHASE[key](beta),
    };
  });
}

/** Positions around the Sun (au, J2000 ecliptic), for the solar system at the end of the journey. */
export const ORBITERS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const;
export function solarSystem(ms: number) {
  const T = (julianDay(ms) - 2451545.0) / 36525;
  return ORBITERS.map((key) => ({ key, a: ELEMENTS[key][0], ...heliocentric(key, T) }));
}

/** Where on Earth the Sun is straight overhead (radians, longitude east-positive). */
export function subsolarPoint(ms: number) {
  const s = sun(ms);
  const gmst = siderealTime(ms) - AMMAN.lon * RAD;
  const lon = ((((s.ra - gmst) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return { lat: s.dec, lon };
}
