/**
 * Amman's weather for the Contact scene, from Open-Meteo (free, no key, CORS open, so it works
 * from GitHub Pages; data CC BY 4.0, credited in the footer).
 *
 * The weather is decided twice a day, not continuously (owner's choice): the day runs 06:00 to
 * 18:00 in Amman, the night 18:00 to 06:00. Each half is summed up from the hourly forecast across
 * all of it, so a visitor in the evening sees the night Amman is having, and everyone in the same
 * half sees the same thing. A visitor fetches once per half (cached in localStorage), and an open
 * page fetches again when the half changes.
 *
 * Preview any weather with `?weather=` (clear, partly, cloudy, fog, drizzle, rain, storm, snow,
 * dust), optionally with `,windy`, alongside `?at=` for the hour. If anything fails, there is no
 * weather and the scene stays as it is.
 */
import { AMMAN, now } from './sky/astro';

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'storm' | 'snow' | 'dust';

export interface Weather {
  kind: WeatherKind;
  /** The half of the day this weather is for. */
  period: 'day' | 'night';
  /** 0..1 each. Cloud is the sky's cover; the rest are how strong each element is. */
  cloud: number;
  rain: number;
  snow: number;
  dust: number;
  fog: number;
  wind: number;
  /** Where the wind blows from, degrees from north toward east. */
  windFrom: number;
  storm: boolean;
}

/** Precipitation counts as snow in hours at or below these temperatures (°C, owner's rule). */
const SNOW_AT = { day: 5, night: 4 } as const;
/** How much of it (mm, over the half-day) is real precipitation rather than a trace. */
const SNOW_MM = 0.5;
const RAIN_MM = 1;
const DRIZZLE_MM = 0.2;
/** Dust near the ground (μg/m³) from which the air reads as dusty. The model runs low (§3c). */
const DUST_UG = 80;
/** Wind gusts (km/h) from which the scene is windy. */
const WINDY_KMH = 50;

const HOUR = 3_600_000;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** The half-day a moment falls in, by Amman's clock: its key and its hours as local ISO strings. */
export function halfDay(ms = now()) {
  const local = new Date(ms + AMMAN.utcOffsetHours * HOUR);
  const h = local.getUTCHours();
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (h < 6 ? 1 : 0)));
  const date = day.toISOString().slice(0, 10);
  const next = new Date(day.getTime() + 24 * HOUR).toISOString().slice(0, 10);
  const period: Weather['period'] = h >= 6 && h < 18 ? 'day' : 'night';
  return period === 'day'
    ? { key: `${date}-day`, period, from: `${date}T06:00`, to: `${date}T18:00` }
    : { key: `${date}-night`, period, from: `${date}T18:00`, to: `${next}T06:00` };
}

/** Representative weather for each preview name. */
function preview(names: string[], period: Weather['period']): Weather {
  const kind = (names.find((n) => n !== 'windy') ?? 'clear') as WeatherKind;
  const base: Weather = { kind, period, cloud: 0, rain: 0, snow: 0, dust: 0, fog: 0, wind: 0, windFrom: 270, storm: false };
  const looks: Record<WeatherKind, Partial<Weather>> = {
    clear: {},
    partly: { cloud: 0.4 },
    cloudy: { cloud: 0.9 },
    fog: { cloud: 0.3, fog: 0.95 },
    drizzle: { cloud: 0.8, rain: 0.3 },
    rain: { cloud: 0.95, rain: 0.75 },
    storm: { cloud: 1, rain: 1, storm: true },
    snow: { cloud: 0.95, snow: 0.8 },
    dust: { dust: 0.85, wind: 0.4, windFrom: 200 },
  };
  const w = { ...base, ...(looks[kind] ?? {}) };
  if (!looks[kind]) w.kind = 'clear';
  if (names.includes('windy')) w.wind = Math.max(w.wind, 0.85);
  return w;
}

type Hourly = Record<string, (number | null)[]> & { time: string[] };

/** Sum up a half-day's hourly forecast (and dust) into one weather. */
function summarize(h: Hourly, dust: Hourly | null, half: ReturnType<typeof halfDay>): Weather | null {
  const at = h.time.map((t, i) => [t, i] as const).filter(([t]) => t >= half.from && t < half.to).map(([, i]) => i);
  if (at.length < 6) return null;
  const v = (name: string, i: number) => h[name]?.[i] ?? 0;
  let precip = 0, peak = 0, cold = 0, snowfall = 0, cloud = 0, gust = 0, windFrom = 270, vis = Infinity;
  const codes = new Set<number>();
  for (const i of at) {
    const p = v('precipitation', i);
    precip += p;
    peak = Math.max(peak, p);
    if (v('temperature_2m', i) <= SNOW_AT[half.period] || v('snowfall', i) > 0) cold += p;
    snowfall += v('snowfall', i);
    cloud += v('cloud_cover', i) / 100;
    if (v('wind_gusts_10m', i) > gust) {
      gust = v('wind_gusts_10m', i);
      windFrom = v('wind_direction_10m', i);
    }
    if (h.visibility?.[i] != null) vis = Math.min(vis, h.visibility[i] as number);
    codes.add(v('weather_code', i));
  }
  cloud /= at.length;
  let dustPeak = 0;
  if (dust) {
    for (let i = 0; i < dust.time.length; i++) {
      if (dust.time[i] >= half.from && dust.time[i] < half.to) dustPeak = Math.max(dustPeak, dust.dust?.[i] ?? 0);
    }
  }
  const has = (lo: number, hi: number) => [...codes].some((c) => c >= lo && c <= hi);
  const kind: WeatherKind =
    has(95, 99) && precip >= DRIZZLE_MM
      ? 'storm'
      : snowfall > 0 || cold >= SNOW_MM
        ? 'snow'
        : precip >= RAIN_MM
          ? 'rain'
          : dustPeak >= DUST_UG
            ? 'dust'
            : precip >= DRIZZLE_MM || has(51, 57)
              ? 'drizzle'
              : has(45, 48) || vis < 1000
                ? 'fog'
                : cloud >= 0.65
                  ? 'cloudy'
                  : cloud >= 0.25
                    ? 'partly'
                    : 'clear';
  const wet = kind === 'rain' || kind === 'storm' || kind === 'drizzle';
  return {
    kind,
    period: half.period,
    cloud: kind === 'snow' || wet ? Math.max(cloud, kind === 'drizzle' ? 0.7 : 0.88) : cloud,
    rain: wet ? clamp(0.25 + peak / 4, 0.25, 1) : 0,
    snow: kind === 'snow' ? clamp(0.45 + cold / 8, 0.45, 1) : 0,
    dust: clamp((dustPeak - 40) / 160),
    fog: kind === 'fog' ? 0.8 : 0,
    wind: clamp((gust - 30) / 40),
    windFrom,
    storm: kind === 'storm',
  };
}

const FORECAST =
  `https://api.open-meteo.com/v1/forecast?latitude=${AMMAN.lat}&longitude=${AMMAN.lon}&timezone=Asia%2FAmman&past_days=1&forecast_days=2` +
  '&hourly=weather_code,precipitation,snowfall,temperature_2m,cloud_cover,wind_gusts_10m,wind_direction_10m,visibility';
const AIR = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${AMMAN.lat}&longitude=${AMMAN.lon}&timezone=Asia%2FAmman&past_days=1&forecast_days=2&hourly=dust`;

async function load(half: ReturnType<typeof halfDay>): Promise<Weather | null> {
  const names = new URLSearchParams(location.search).get('weather');
  if (names) return preview(names.split(','), half.period);
  const cacheKey = `amman-weather:${half.key}`;
  try {
    const kept = localStorage.getItem(cacheKey);
    if (kept) return JSON.parse(kept) as Weather;
  } catch {}
  try {
    const [forecast, air] = await Promise.allSettled([
      fetch(FORECAST).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      fetch(AIR).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    ]);
    if (forecast.status !== 'fulfilled') return null;
    const w = summarize(forecast.value.hourly, air.status === 'fulfilled' ? air.value.hourly : null, half);
    if (w) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(w));
      } catch {}
    }
    return w;
  } catch {
    return null;
  }
}

let current: Weather | null = null;
const listeners = new Set<(w: Weather | null) => void>();
let started = false;

/** Get the weather now and whenever the half-day changes (null: none, keep the scene as it is). */
export function onWeather(cb: (w: Weather | null) => void) {
  listeners.add(cb);
  if (current) cb(current);
  if (started) return;
  started = true;
  let key = '';
  const check = async () => {
    const half = halfDay();
    if (half.key === key) return;
    key = half.key;
    current = await load(half);
    for (const l of listeners) l(current);
  };
  check();
  setInterval(check, 60_000);
}

/** The latest weather, if any has arrived. */
export const latestWeather = () => current;

const WORDS = {
  en: {
    clear: 'Clear skies', partly: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Foggy', drizzle: 'Drizzle',
    rain: 'Rain', storm: 'Thunderstorms', snow: 'Snow', dust: 'Dusty air',
    day: 'today', night: 'tonight', windy: ', windy',
  },
  ar: {
    clear: 'سماء صافية', partly: 'غائم جزئيًا', cloudy: 'غائم', fog: 'ضباب', drizzle: 'رذاذ',
    rain: 'أمطار', storm: 'عواصف رعدية', snow: 'ثلوج', dust: 'أجواء مغبرة',
    day: 'اليوم', night: 'الليلة', windy: ' مع رياح',
  },
} as const;

/** "Rain tonight, windy" / "أمطار الليلة مع رياح": the weather's line under the clock. */
export function weatherLine(w: Weather, lang: 'en' | 'ar') {
  const t = WORDS[lang];
  return `${t[w.kind]} ${t[w.period]}${w.wind >= (WINDY_KMH - 30) / 40 && w.kind !== 'dust' ? t.windy : ''}`;
}
