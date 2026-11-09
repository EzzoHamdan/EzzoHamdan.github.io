/**
 * Amman's weather in the sky at the end of the page, for both renderers: clouds, the overcast,
 * dusty or foggy sky, the veil it draws over stars and shooting stars, and lightning. Rain and snow
 * fall in front of the city, so the page draws those (Skyline.astro, `.weather-front`).
 * The weather comes from the page (src/scripts/weather.ts) in a `weather` message.
 */
import { LOOKS, type Daylight, type Look } from './astro';

export interface SkyWeather {
  cloud: number;
  rain: number;
  snow: number;
  dust: number;
  fog: number;
  wind: number;
  windFrom: number;
  storm: boolean;
}

export const CLEAR_SKY: SkyWeather = { cloud: 0, rain: 0, snow: 0, dust: 0, fog: 0, wind: 0, windFrom: 270, storm: false };

type Canvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);
const rgb = (c: number[], a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;
const byLight = (table: Record<Look, number[]>, light: Daylight) =>
  [0, 1, 2].map((j) => LOOKS.reduce((sum, k) => sum + table[k][j] * light[k], 0));

// The sky under each weather, [top] and [low], by time of day. Overcast: grey by day; at night the
// cloud base glows faintly with the city's light
// Overcast tops stay mid-dark even by day, so the contact text over them keeps its contrast
const GREY_TOP: Record<Look, number[]> = { night: [16, 18, 28], dawn: [58, 56, 76], day: [92, 102, 118], dusk: [54, 50, 70] };
const GREY_LOW: Record<Look, number[]> = { night: [46, 40, 50], dawn: [140, 116, 120], day: [162, 170, 182], dusk: [138, 104, 112] };
const SNOW_TOP: Record<Look, number[]> = { night: [28, 30, 44], dawn: [120, 118, 140], day: [170, 178, 192], dusk: [112, 104, 126] };
const SNOW_LOW: Record<Look, number[]> = { night: [74, 70, 88], dawn: [196, 184, 196], day: [214, 220, 230], dusk: [190, 168, 182] };
const DUST_TOP: Record<Look, number[]> = { night: [40, 32, 26], dawn: [150, 112, 80], day: [170, 142, 104], dusk: [140, 98, 66] };
const DUST_LOW: Record<Look, number[]> = { night: [82, 62, 44], dawn: [204, 148, 96], day: [206, 172, 124], dusk: [196, 128, 82] };
const FOG_LOW: Record<Look, number[]> = { night: [58, 62, 78], dawn: [196, 190, 196], day: [210, 214, 220], dusk: [186, 172, 180] };
// Clouds: their lit tops and their bases
const CLOUD_TOP: Record<Look, number[]> = { night: [52, 56, 76], dawn: [255, 214, 196], day: [255, 255, 255], dusk: [255, 196, 176] };
const CLOUD_BASE: Record<Look, number[]> = { night: [92, 76, 74], dawn: [132, 110, 136], day: [176, 184, 198], dusk: [118, 92, 120] };

/** How grey the sky is: from the cover past a third, mostly in fog, wholly under rain, snow or a storm. */
const greyOf = (w: SkyWeather) => clamp(Math.max((w.cloud - 0.35) / 0.6, w.rain * 1.3, w.snow * 1.2, w.fog * 0.7, w.storm ? 1 : 0));

/** How much of the starlight (and the shooting stars) the weather hides, 0..1. */
export const veilOf = (w: SkyWeather) =>
  clamp(Math.max(w.cloud * 0.95, greyOf(w), w.dust * 0.9, w.fog * 0.85));

/** The sky's top and low colors under the weather, `k` (0..1) of the way there. */
export function weatherSky(top: number[], low: number[], w: SkyWeather, light: Daylight, k: number): [number[], number[]] {
  if (k <= 0) return [top, low];
  const grey = greyOf(w) * k;
  let t = mix(top, byLight(w.snow > 0 ? SNOW_TOP : GREY_TOP, light), grey);
  let l = mix(low, byLight(w.snow > 0 ? SNOW_LOW : GREY_LOW, light), grey);
  if (w.dust > 0) {
    t = mix(t, byLight(DUST_TOP, light), w.dust * 0.9 * k);
    l = mix(l, byLight(DUST_LOW, light), w.dust * 0.9 * k);
  }
  if (w.fog > 0) l = mix(l, byLight(FOG_LOW, light), w.fog * 0.8 * k);
  return [t, l];
}

const CLOUDS = 18;
/** How strong clouds are behind the contact text, against 1 below it. */
const TEXT_VEIL = 0.55;
const VARIANTS = 6;

export function createWeatherSky(makeCanvas: (w: number, h: number) => Canvas) {
  // The cloud field: across the view, depth 0 high and near (large), 1 low by the horizon (small)
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const field = Array.from({ length: CLOUDS }, (_, i) => ({
    x: rnd(),
    depth: (i + rnd()) / CLOUDS,
    variant: Math.floor(rnd() * VARIANTS),
    size: 0.8 + 0.5 * rnd(),
    // Clouds come out in this order as the cover grows, spread over the whole sky
    order: rnd(),
  })).sort((a, b) => a.order - b.order);
  // Each cloud: a broad base of large puffs, smaller ones heaped on top (cumulus)
  const blobs = Array.from({ length: VARIANTS }, () => [
    ...Array.from({ length: 7 }, (_, i) => ({ x: 0.16 + (0.68 * (i + rnd() * 0.6)) / 7, y: 0.6 + 0.06 * rnd(), r: 0.11 + 0.06 * rnd() })),
    ...Array.from({ length: 6 }, () => ({ x: 0.28 + 0.44 * rnd(), y: 0.42 + 0.1 * rnd(), r: 0.09 + 0.07 * rnd() })),
    ...Array.from({ length: 3 }, () => ({ x: 0.36 + 0.28 * rnd(), y: 0.3 + 0.08 * rnd(), r: 0.07 + 0.05 * rnd() })),
  ]);
  let sprites: Canvas[] = [];
  // The clouds are drawn on a layer first, so they can fade out below the contact text
  let layer: Canvas | undefined;
  let spriteKey = '';
  let drift = 0;
  // Lightning: time to the next strike, the flash (decaying), and the bolt's path
  let nextStrike = 4;
  let flash = 0;
  let bolt: number[][] = [];

  /** Paint the cloud shapes in this light: lit tops fading to the base below. */
  function paint(light: Daylight, w: SkyWeather) {
    const dark = w.storm ? 0.45 : w.rain > 0 ? 0.25 : 0;
    const top = mix(byLight(CLOUD_TOP, light), [60, 64, 76], dark);
    const base = mix(byLight(CLOUD_BASE, light), [40, 42, 52], dark);
    const key = `${top.map(Math.round)}|${base.map(Math.round)}`;
    if (key === spriteKey) return;
    spriteKey = key;
    const W = 480;
    const H = 240;
    sprites = blobs.map((set) => {
      const c = makeCanvas(W, H);
      const g = c.getContext('2d') as Ctx;
      for (const b of set) {
        const r = b.r * W;
        // Firm puffs with a soft rim, so the cloud has a shape rather than a smudge
        const grad = g.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, r);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.72, 'rgba(255,255,255,0.92)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(b.x * W - r, b.y * H - r, r * 2, r * 2);
      }
      // Tint: lit tops, darker bases, a softly flattened bottom
      g.globalCompositeOperation = 'source-atop';
      const shade = g.createLinearGradient(0, H * 0.2, 0, H * 0.74);
      shade.addColorStop(0, rgb(top));
      shade.addColorStop(1, rgb(base));
      g.fillStyle = shade;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-in';
      const flat = g.createLinearGradient(0, H * 0.66, 0, H * 0.76);
      flat.addColorStop(0, 'rgba(0,0,0,1)');
      flat.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = flat;
      g.fillRect(0, 0, W, H);
      return c;
    });
  }

  return {
    /**
     * Draw the clouds, an overcast sheet, and lightning, `alpha` of the way in (the end of the
     * page). `horizon` is where the far hills are; clouds stay above it.
     */
    draw(
      ctx: Ctx,
      o: { w: number; h: number; horizon: number; text: number; weather: SkyWeather; light: Daylight; alpha: number; dt: number; still: boolean },
    ) {
      const { w, h, weather: wx, light, alpha, dt } = o;
      if (alpha < 0.01) return;
      const horizon = Number.isFinite(o.horizon) ? clamp(o.horizon, h * 0.3, h) : h * 0.75;
      // Where the contact text ends: clouds fill the whole sky, high and scattered, but behind the
      // words they are drawn at TEXT_VEIL of their strength, so a bright one never washes them out
      const ceiling = Number.isFinite(o.text) ? clamp(o.text + 12, 0, horizon - 60) : horizon * 0.45;
      const grey = greyOf(wx);
      // An overcast sheet over the top of the sky
      if (grey > 0.01) {
        const sheet = ctx.createLinearGradient(0, 0, 0, horizon * 0.75);
        const c = mix(byLight(CLOUD_BASE, light), [40, 42, 52], wx.storm ? 0.6 : 0.45);
        sheet.addColorStop(0, rgb(c, 0.7 * grey * alpha));
        sheet.addColorStop(1, rgb(c, 0));
        ctx.fillStyle = sheet;
        ctx.fillRect(0, 0, w, horizon);
      }
      const count = Math.round(clamp(wx.cloud) * CLOUDS);
      if (count > 0) {
        paint(light, wx);
        const canvas = ctx.canvas as Canvas;
        if (!layer || layer.width !== canvas.width || layer.height !== canvas.height) layer = makeCanvas(canvas.width, canvas.height);
        const lc = layer.getContext('2d') as Ctx;
        lc.setTransform(1, 0, 0, 1, 0, 0);
        lc.clearRect(0, 0, layer.width, layer.height);
        lc.setTransform(ctx.getTransform());
        // Drifting with the wind, from the east (the wind's direction across the view)
        const dir = Math.sin((wx.windFrom * Math.PI) / 180) >= 0 ? -1 : 1;
        if (!o.still) drift += dt * (5 + 30 * wx.wind) * dir;
        for (let i = 0; i < count; i++) {
          const cl = field[i];
          const scale = (w / 1440) * (1.5 - 0.95 * cl.depth) * cl.size;
          const cw = 480 * 1.05 * scale;
          const ch = 240 * 1.05 * scale * (1 - 0.35 * cl.depth);
          // Over the whole sky: near ones high and large, far ones small and low by the hills
          const cy = horizon * (0.04 + 0.78 * cl.depth ** 0.9);
          const y = cy - ch * 0.55;
          const span = w + cw;
          const x = ((((cl.x * span + drift * (1.4 - cl.depth)) % span) + span) % span) - cw;
          lc.globalAlpha = (0.6 + 0.4 * (1 - cl.depth)) * clamp(0.55 + grey * 0.6);
          lc.drawImage(sprites[cl.variant], x, y, cw, ch);
        }
        // Softer behind the text
        lc.globalAlpha = 1;
        lc.globalCompositeOperation = 'destination-in';
        const fade = lc.createLinearGradient(0, ceiling - 10, 0, ceiling + 70);
        fade.addColorStop(0, `rgba(0,0,0,${TEXT_VEIL})`);
        fade.addColorStop(1, 'rgba(0,0,0,1)');
        lc.fillStyle = fade;
        lc.fillRect(0, 0, w, h);
        lc.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = alpha;
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
      }
      // Lightning in a storm: now and then a flash that lights the clouds, sometimes a bolt that
      // comes down behind the city. Brief and far between; none for reduced motion
      if (wx.storm && !o.still) {
        nextStrike -= dt;
        if (nextStrike <= 0) {
          nextStrike = 5 + Math.random() * 8;
          flash = 1;
          bolt = [];
          if (Math.random() < 0.7) {
            let x = w * (0.15 + 0.7 * Math.random());
            let y = horizon * 0.22;
            bolt.push([x, y]);
            while (y < horizon + 8) {
              y += 14 + Math.random() * 22;
              x += (Math.random() - 0.5) * 34;
              bolt.push([x, y]);
            }
          }
        }
      }
      if (flash > 0.01) {
        // Two quick pulses as it decays
        const f = flash * (0.6 + 0.4 * Math.abs(Math.sin(flash * 14)));
        ctx.fillStyle = `rgba(214,222,255,${(0.22 * f * alpha).toFixed(3)})`;
        ctx.fillRect(0, 0, w, horizon);
        if (bolt.length && flash > 0.35) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (const [width, a] of [[6, 0.18], [1.6, 0.9]]) {
            ctx.strokeStyle = `rgba(232,236,255,${(a * f * alpha).toFixed(3)})`;
            ctx.lineWidth = width;
            ctx.beginPath();
            bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.stroke();
          }
        }
        flash = Math.max(0, flash - dt * 1.8);
      }
    },
    /** True while lightning is still fading, so a renderer keeps drawing. */
    busy: () => flash > 0.01,
  };
}
