/**
 * Shooting stars. All of them travel the same path direction (down-left at 45°) and are spread
 * evenly across the whole width: each one is placed by the middle of its visible streak, so no
 * side of the screen gets more than another.
 *
 * Look: a tapered trail that grows as the meteor enters, a two-tone color from real meteor
 * emission (magnesium green, sodium orange, blue-white, plus violet and brass for the site's
 * palette), a brightening entry and fade, sometimes a flare, and for bright ones a faint
 * glowing train that lingers and drifts after the meteor is gone.
 */

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
type Canvas = OffscreenCanvas | HTMLCanvasElement;

const STYLES = [
  { head: '236,244,255', trail: '140,180,255', weight: 4 },
  { head: '226,255,238', trail: '110,230,170', weight: 3 },
  { head: '255,246,228', trail: '255,165,85', weight: 2 },
  { head: '250,236,255', trail: '200,140,255', weight: 2 },
  { head: '255,242,214', trail: '201,161,91', weight: 1 },
];
const TOTAL_WEIGHT = STYLES.reduce((s, x) => s + x.weight, 0);

// One shared direction for every shooting star: down-left at 45°
const DX = -Math.SQRT1_2;
const DY = Math.SQRT1_2;

interface Meteor {
  x: number; y: number;
  speed: number;
  maxTrail: number;
  age: number;
  life: number;
  size: number;
  style: number;
  flareAt: number;
  flare: number;
  bright: boolean;
}

/** The spark where a wished-for shooting star begins. */
interface Spark {
  x: number; y: number;
  age: number;
}

interface Train {
  x1: number; y1: number; x2: number; y2: number;
  vx: number; vy: number;
  age: number;
  life: number;
  style: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function pickStyle() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (let i = 0; i < STYLES.length; i++) {
    r -= STYLES[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}

export function createMeteors(makeCanvas: (w: number, h: number) => Canvas) {
  // One soft head sprite per color, drawn once
  const heads = STYLES.map(({ head, trail }) => {
    const c = makeCanvas(64, 64);
    const g = c.getContext('2d') as Ctx;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${head},1)`);
    grad.addColorStop(0.12, `rgba(${head},0.85)`);
    grad.addColorStop(0.35, `rgba(${trail},0.25)`);
    grad.addColorStop(1, `rgba(${trail},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  });

  let meteors: Meteor[] = [];
  let trains: Train[] = [];
  let sparks: Spark[] = [];

  return {
    clear() {
      meteors = [];
      trains = [];
      sparks = [];
    },

    /** A wish: a bright shooting star that starts exactly at (x, y), with a spark at its origin. */
    launch(x: number, y: number) {
      const size = rand(1.3, 1.6);
      const speed = rand(480, 620);
      meteors.push({
        x, y, speed, size,
        life: rand(1.5, 1.9),
        maxTrail: Math.min(420, speed * 0.5),
        age: 0,
        style: Math.random() < 0.5 ? 0 : 4,
        flareAt: rand(0.55, 0.75),
        flare: rand(0.6, 1),
        bright: true,
      });
      sparks.push({ x, y, age: 0 });
    },

    /** Spawn one shooting star in a w×h view; a fireball is bigger, brighter and longer. */
    spawn(w: number, h: number, fireball = false) {
      const size = fireball ? rand(1.5, 1.9) : rand(0.55, 1.15);
      const speed = rand(260, 620) * (0.75 + size * 0.35);
      const life = fireball ? rand(1.6, 2.2) : rand(0.7, 1.7);
      // Place the middle of the visible streak evenly over the view, then back up to the start
      const back = speed * life * 0.45;
      meteors.push({
        x: rand(0.03, 0.97) * w - DX * back,
        y: rand(0.05, 0.8) * h - DY * back,
        speed,
        life,
        size,
        maxTrail: Math.min(420, speed * (fireball ? 0.55 : 0.4)),
        age: 0,
        style: fireball ? 0 : pickStyle(),
        flareAt: rand(0.45, 0.8),
        flare: fireball || Math.random() < 0.22 ? rand(0.6, 1.4) : 0,
        bright: fireball || size > 1.05,
      });
    },

    update(dt: number) {
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.age += dt;
        m.x += DX * m.speed * dt;
        m.y += DY * m.speed * dt;
        if (m.age >= m.life) {
          if (m.bright) {
            const len = Math.min(m.maxTrail, m.speed * m.life) * 0.7;
            trains.push({
              x1: m.x, y1: m.y, x2: m.x - DX * len, y2: m.y - DY * len,
              vx: rand(-6, 6), vy: rand(2, 8),
              age: 0, life: rand(1.8, 3), style: m.style,
            });
          }
          meteors.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        sparks[i].age += dt;
        if (sparks[i].age >= 0.7) sparks.splice(i, 1);
      }
      for (let i = trains.length - 1; i >= 0; i--) {
        const t = trains[i];
        t.age += dt;
        // Upper-atmosphere winds bend and carry the glowing train
        t.x1 += t.vx * dt;
        t.y1 += t.vy * dt;
        t.x2 += t.vx * dt * 0.6;
        t.y2 += t.vy * dt * 0.6;
        if (t.age >= t.life) trains.splice(i, 1);
      }
    },

    draw(ctx: Ctx, dim = 1) {
      ctx.lineCap = 'round';
      for (const k of sparks) {
        const t = k.age / 0.7;
        ctx.strokeStyle = `rgba(201,161,91,${0.8 * (1 - t)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(k.x, k.y, 4 + t * 22, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const t of trains) {
        const a = 0.16 * (1 - t.age / t.life) * dim;
        ctx.strokeStyle = `rgba(${STYLES[t.style].trail},${a})`;
        ctx.lineWidth = 1 + (t.age / t.life) * 5;
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.quadraticCurveTo((t.x1 + t.x2) / 2 + t.vy, (t.y1 + t.y2) / 2 - t.vx, t.x2, t.y2);
        ctx.stroke();
      }

      for (const m of meteors) {
        const p = m.age / m.life;
        const flare = m.flare * Math.exp(-(((p - m.flareAt) / 0.07) ** 2));
        const a = Math.min(1, (smooth(0, 0.15, p) * (1 - smooth(0.68, 1, p)) + flare * 0.6) * dim);
        if (a <= 0.01) continue;
        const { head, trail } = STYLES[m.style];
        const len = Math.min(m.maxTrail, m.speed * m.age);
        const tx = m.x - DX * len;
        const ty = m.y - DY * len;
        const half = (1.1 + m.size * 1.3) * (1 + flare * 0.5);
        const px = -DY * half;
        const py = DX * half;

        // Tapered trail: full width at the head, a point at the tail
        const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
        grad.addColorStop(0, `rgba(${head},${a * 0.9})`);
        grad.addColorStop(0.12, `rgba(${trail},${a * 0.55})`);
        grad.addColorStop(1, `rgba(${trail},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(m.x + px, m.y + py);
        ctx.lineTo(tx, ty);
        ctx.lineTo(m.x - px, m.y - py);
        ctx.closePath();
        ctx.fill();

        // Bright core along the leading third
        const cx = m.x - DX * len * 0.35;
        const cy = m.y - DY * len * 0.35;
        const core = ctx.createLinearGradient(m.x, m.y, cx, cy);
        core.addColorStop(0, `rgba(255,255,255,${a})`);
        core.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = core;
        ctx.lineWidth = 0.6 + m.size * 0.5;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(cx, cy);
        ctx.stroke();

        const s = (10 + m.size * 14) * (1 + flare);
        ctx.globalAlpha = a;
        ctx.drawImage(heads[m.style], m.x - s / 2, m.y - s / 2, s, s);
        ctx.globalAlpha = 1;
      }
    },
  };
}
