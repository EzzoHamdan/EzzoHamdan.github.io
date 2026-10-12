import { showers } from '../data/star-names';

// Amman: 31.95° N, 35.93° E. Jordan has kept UTC+3 all year since 2022.
export const AMMAN = { lat: 31.95, lon: 35.93, utcOffsetHours: 3 };
const HOUR = 3_600_000;

export interface SkyMoment {
  /** 'now' at night; during daylight we show tonight's sky at 22:00 instead. */
  mode: 'now' | 'tonight';
  /** The moment the sky is drawn for, in ms since epoch. */
  time: number;
  /** Index into `showers` when tonight is within a day of a shower's peak. */
  shower: number;
}

export function skyMoment(now = Date.now()): SkyMoment {
  const local = new Date(now + AMMAN.utcOffsetHours * HOUR);
  const hour = local.getUTCHours();
  const night = hour >= 18 || hour < 5;
  let time = now;
  if (!night) {
    const tonight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 22);
    time = tonight - AMMAN.utcOffsetHours * HOUR;
  }
  const at = new Date(time + AMMAN.utcOffsetHours * HOUR);
  const shower = showers.findIndex((s) => {
    const peak = Date.UTC(at.getUTCFullYear(), s.month - 1, s.day);
    return Math.abs(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) - peak) <= 86_400_000;
  });
  return { mode: night ? 'now' : 'tonight', time, shower };
}

/** Local sidereal time at Amman, in radians. */
export function siderealTime(ms: number): number {
  const jd = ms / 86_400_000 + 2440587.5;
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0);
  return ((((gmst + AMMAN.lon) % 360) + 360) % 360) * (Math.PI / 180);
}
