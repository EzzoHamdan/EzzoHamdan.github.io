/**
 * Shooting-star sky, drawn on one canvas. Runs inside a Web Worker on an OffscreenCanvas
 * when the browser supports it (keeping the main thread free), or on the page otherwise.
 *
 * Looks match the original CSS particles: colored heads with a two-ring glow, a fading
 * trail, travelling down-left at 45°. Additions: depth (near stars are bigger, faster and
 * shift more when scrolling), a twinkling background starfield, and an occasional bolide.
 */

export type SkyMessage =
  | { type: 'init'; canvas?: OffscreenCanvas; width: number; height: number; dpr: number; reducedMotion: boolean }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'scroll'; y: number }
  | { type: 'motion'; reduced: boolean }
  | { type: 'visible'; visible: boolean }
  | { type: 'intro'; x: number; y: number };

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const COLORS = ['255,255,255', '168,85,247', '59,130,246', '34,211,238', '236,72,153'];
// Unit vector of travel (down-left) and its opposite (where the trail points)
const DIR = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
const SPRITE = 64;

interface Star { x: number; y: number; r: number; a: number; speed: number; phase: number; depth: number }
interface Meteor {
  x: number; y: number; vx: number; vy: number;
  age: number; life: number; trail: number; size: number; depth: number; sprite: number; color: string;
}

const raf: (cb: (t: number) => void) => number =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame.bind(globalThis)
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
const caf: (id: number) => void =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame.bind(globalThis) : clearTimeout;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Opacity envelope of the original keyframes: fade in to 40%, out by 85%. */
function envelope(p: number) {
  if (p < 0.4) return p / 0.4;
  if (p < 0.85) return 1 - (p - 0.4) / 0.45;
  return 0;
}

function makeSprite(color: string): Canvas {
  const c: Canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(SPRITE, SPRITE)
      : Object.assign(document.createElement('canvas'), { width: SPRITE, height: SPRITE });
  const g = c.getContext('2d') as Ctx;
  const m = SPRITE / 2;
  const glow = g.createRadialGradient(m, m, 0, m, m, m);
  glow.addColorStop(0, `rgba(${color},0.9)`);
  glow.addColorStop(0.25, `rgba(${color},0.35)`);
  glow.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = glow;
  g.fillRect(0, 0, SPRITE, SPRITE);
  // The two faint rings of the original box-shadow
  g.fillStyle = `rgba(${color},0.1)`;
  for (const r of [10, 6]) {
    g.beginPath();
    g.arc(m, m, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = `rgb(${color})`;
  g.beginPath();
  g.arc(m, m, 3, 0, Math.PI * 2);
  g.fill();
  return c;
}

export function createSky(canvas: Canvas) {
  const ctx = canvas.getContext('2d') as Ctx;
  const sprites = COLORS.map(makeSprite);

  let w = 0, h = 0, dpr = 1;
  let reduced = false, visible = true, started = false;
  let frame = 0, last = 0, spawnDebt = 0, nextBolide = rand(6, 12);
  let scrollY = 0;
  let stars: Star[] = [];
  let meteors: Meteor[] = [];

  function seedStars() {
    const count = Math.round(Math.min(320, (w * h) / 5500));
    stars = Array.from({ length: count }, () => {
      const depth = Math.random();
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.3 + depth * 0.9,
        a: 0.15 + depth * 0.55,
        speed: rand(0.6, 2.2),
        phase: rand(0, Math.PI * 2),
        depth,
      };
    });
  }

  function spawn(opts: Partial<Meteor> & { bolide?: boolean } = {}) {
    const depth = opts.bolide ? 1.25 : rand(0.35, 1);
    const sprite = opts.bolide ? 3 : Math.floor(Math.random() * COLORS.length);
    // Start anywhere along the top edge or the right edge, slightly off-canvas
    const fromTop = Math.random() < w / (w + h);
    const x = opts.x ?? (fromTop ? rand(0.1 * w, 1.3 * w) : w + rand(0, 80));
    const y = opts.y ?? (fromTop ? rand(-80, 0.25 * h) : rand(0, 0.6 * h));
    const life = opts.life ?? (opts.bolide ? 2.4 : rand(1.2, 6) / (0.6 + depth * 0.6));
    const speed = (opts.bolide ? 900 : 1000 / life) * (0.6 + depth * 0.4);
    meteors.push({
      x, y,
      vx: DIR.x * speed,
      vy: DIR.y * speed,
      age: 0,
      life,
      trail: (opts.bolide ? 520 : 300) * (0.45 + depth * 0.55),
      size: (opts.bolide ? 44 : 30) * (0.45 + depth * 0.55),
      depth,
      sprite,
      color: COLORS[sprite],
    });
  }

  function drawStars(t: number) {
    for (const s of stars) {
      const twinkle = reduced ? 1 : 0.65 + 0.35 * Math.sin(t * s.speed + s.phase);
      // Parallax: deeper stars drift less as the page scrolls
      let y = (s.y - scrollY * 0.04 * s.depth) % h;
      if (y < 0) y += h;
      ctx.globalAlpha = s.a * twinkle;
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x, y, s.r * 2, s.r * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawMeteors(dt: number) {
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.age += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const p = m.age / m.life;
      const a = envelope(p) * (0.55 + m.depth * 0.45);
      if (p >= 1) {
        meteors.splice(i, 1);
        continue;
      }
      if (a <= 0) continue;
      const y = m.y - scrollY * 0.08 * m.depth;
      const tx = m.x - DIR.x * m.trail;
      const ty = y - DIR.y * m.trail;
      const grad = ctx.createLinearGradient(m.x, y, tx, ty);
      grad.addColorStop(0, `rgba(${m.color},${a})`);
      grad.addColorStop(1, `rgba(${m.color},0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.6 + m.depth * 0.8;
      ctx.beginPath();
      ctx.moveTo(m.x, y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.drawImage(sprites[m.sprite], m.x - m.size / 2, y - m.size / 2, m.size, m.size);
      ctx.globalAlpha = 1;
    }
  }

  function render(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    ctx.clearRect(0, 0, w, h);
    drawStars(now / 1000);
    if (!reduced) {
      // Same density as the original (one every 150 ms at 1440×900), scaled by viewport area
      const rate = Math.max(1.5, Math.min(8, 6.7 * ((w * h) / (1440 * 900))));
      spawnDebt += dt * rate;
      while (spawnDebt >= 1) {
        spawn();
        spawnDebt -= 1;
      }
      nextBolide -= dt;
      if (nextBolide <= 0) {
        spawn({ bolide: true });
        nextBolide = rand(9, 16);
      }
      drawMeteors(dt);
    }
  }

  function loop(now: number) {
    render(now);
    frame = raf(loop);
  }

  function sync() {
    caf(frame);
    if (!started) return;
    if (reduced || !visible) {
      meteors = [];
      render(performance.now());
      return;
    }
    last = performance.now();
    frame = raf(loop);
  }

  return {
    handle(msg: SkyMessage) {
      switch (msg.type) {
        case 'init':
          reduced = msg.reducedMotion;
        // falls through
        case 'resize': {
          w = msg.width;
          h = msg.height;
          dpr = msg.dpr;
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          seedStars();
          started = true;
          break;
        }
        case 'scroll':
          scrollY = msg.y;
          if (reduced || !visible) render(performance.now());
          return;
        case 'motion':
          reduced = msg.reduced;
          break;
        case 'visible':
          visible = msg.visible;
          break;
        case 'intro':
          if (!reduced) {
            // A bolide whose path crosses the given point about 0.7 s after it appears
            const lead = 0.7 * 900 * 1.1;
            spawn({ bolide: true, x: msg.x - DIR.x * lead, y: msg.y - DIR.y * lead });
          }
          return;
      }
      sync();
    },
  };
}
