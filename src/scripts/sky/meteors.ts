/**
 * Shooting stars in the site's original style: a colored head with a two-ring glow and a long
 * fading trail, all travelling the same way (down-left, about 45°) with a few degrees of
 * variation each. They are spread evenly across the whole width: positions are chosen for the
 * middle of each streak's visible path, so no side of the screen gets more than another.
 */

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
type Canvas = OffscreenCanvas | HTMLCanvasElement;

const COLORS = ['255,255,255', '190,210,255', '201,161,91', '150,220,240', '225,160,210'];
const SPRITE = 64;
const BASE_ANGLE = 45 * (Math.PI / 180);
const ANGLE_SPREAD = 6 * (Math.PI / 180);

interface Meteor {
  x: number; y: number;
  dx: number; dy: number;
  speed: number;
  age: number;
  life: number;
  trail: number;
  size: number;
  depth: number;
  color: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Opacity over a meteor's life, as in the original keyframes: in by 40%, out by 85%. */
const envelope = (p: number) => (p < 0.4 ? p / 0.4 : p < 0.85 ? 1 - (p - 0.4) / 0.45 : 0);

export function createMeteors(makeCanvas: (w: number, h: number) => Canvas) {
  const sprites = COLORS.map((color) => {
    const c = makeCanvas(SPRITE, SPRITE);
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
  });

  let meteors: Meteor[] = [];

  return {
    clear() {
      meteors = [];
    },

    /** Spawn one shooting star in a w×h view; a bolide is brighter, bigger and longer. */
    spawn(w: number, h: number, bolide = false) {
      const depth = bolide ? 1.25 : rand(0.35, 1);
      const angle = BASE_ANGLE + rand(-ANGLE_SPREAD, ANGLE_SPREAD);
      const dx = -Math.cos(angle);
      const dy = Math.sin(angle);
      const life = bolide ? 2.4 : rand(1.2, 6) / (0.6 + depth * 0.6);
      const speed = (bolide ? 900 : 1000 / life) * (0.6 + depth * 0.4);
      // Place the middle of the visible streak evenly over the view, then back up to the start
      const midX = rand(0.03, 0.97) * w;
      const midY = rand(0.05, 0.8) * h;
      const back = speed * life * 0.4;
      meteors.push({
        x: midX - dx * back,
        y: midY - dy * back,
        dx,
        dy,
        speed,
        age: 0,
        life,
        trail: (bolide ? 520 : 300) * (0.45 + depth * 0.55),
        size: (bolide ? 44 : 30) * (0.45 + depth * 0.55),
        depth,
        color: bolide ? 0 : Math.floor(Math.random() * COLORS.length),
      });
    },

    update(dt: number) {
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.age += dt;
        m.x += m.dx * m.speed * dt;
        m.y += m.dy * m.speed * dt;
        if (m.age >= m.life) meteors.splice(i, 1);
      }
    },

    draw(ctx: Ctx, dim = 1) {
      for (const m of meteors) {
        const a = envelope(m.age / m.life) * (0.55 + m.depth * 0.45) * dim;
        if (a <= 0.01) continue;
        const color = COLORS[m.color];
        const tx = m.x - m.dx * m.trail;
        const ty = m.y - m.dy * m.trail;
        const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
        grad.addColorStop(0, `rgba(${color},${a})`);
        grad.addColorStop(1, `rgba(${color},0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.6 + m.depth * 0.8;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.globalAlpha = a;
        ctx.drawImage(sprites[m.color], m.x - m.size / 2, m.y - m.size / 2, m.size, m.size);
        ctx.globalAlpha = 1;
      }
    },
  };
}
