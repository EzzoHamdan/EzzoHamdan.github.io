/**
 * Shooting stars. All of them travel the same path direction (down-left at 45°) and are spread
 * evenly across the whole width.
 *
 * Every meteor ends its life on screen: its final head position is chosen inside the view (above
 * the footer skyline), and the start is worked back from there. So a trail never shows without
 * its head, whether at the screen edge or behind the skyline.
 *
 * Look: a tapered trail with a soft glow around it that grows as the meteor enters, a two-tone
 * color from real meteor emission (magnesium green, sodium orange, blue-white, plus violet and
 * brass for the site's palette), a gentle entry and long fade, and sometimes a flare.
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
}

/** The spark where a wished-for shooting star begins. */
interface Spark {
  x: number; y: number;
  age: number;
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
    grad.addColorStop(0.14, `rgba(${head},0.9)`);
    grad.addColorStop(0.4, `rgba(${trail},0.28)`);
    grad.addColorStop(1, `rgba(${trail},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  });

  let meteors: Meteor[] = [];
  let sparks: Spark[] = [];

  function add(x: number, y: number, speed: number, life: number, size: number, style: number, flare: number) {
    meteors.push({
      x, y, speed, life, size, style,
      maxTrail: Math.min(440, 120 + speed * 0.75),
      age: 0,
      flareAt: rand(0.45, 0.75),
      flare,
    });
  }

  return {
    clear() {
      meteors = [];
      sparks = [];
    },

    /**
     * Spawn one shooting star in a w×h view; a fireball is bigger, brighter and longer.
     * `floor` is the lowest point (fraction of h) a head may end at, to stay above the skyline.
     */
    spawn(w: number, h: number, fireball = false, floor = 0.9) {
      const size = fireball ? rand(1.5, 1.9) : rand(0.6, 1.15);
      const speed = rand(170, 330) * (0.8 + size * 0.3);
      const life = fireball ? rand(3.2, 4) : rand(1.8, 3.2);
      // Choose where the head ends, evenly over the view, then work back to where it starts
      const endX = rand(0.04, 0.96) * w;
      const endY = rand(0.08, floor) * h;
      const travel = speed * life;
      const flare = fireball || Math.random() < 0.22 ? rand(0.5, 1.1) : 0;
      add(endX - DX * travel, endY - DY * travel, speed, life, size, fireball ? 0 : pickStyle(), flare);
    },

    /**
     * A wish: a bright shooting star that starts exactly at (x, y) and fades before its head
     * reaches the left edge or `floorY` (the skyline or the bottom of the view).
     */
    launch(x: number, y: number, _w: number, floorY: number) {
      const speed = rand(300, 380);
      const toEdge = Math.min((x - 24) / -DX, (floorY - y) / DY) / speed;
      const life = Math.min(3, Math.max(0.6, toEdge));
      add(x, y, speed, life, rand(1.35, 1.6), Math.random() < 0.5 ? 0 : 4, rand(0.5, 0.9));
      sparks.push({ x, y, age: 0 });
    },

    update(dt: number) {
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.age += dt;
        m.x += DX * m.speed * dt;
        m.y += DY * m.speed * dt;
        if (m.age >= m.life) meteors.splice(i, 1);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        sparks[i].age += dt;
        if (sparks[i].age >= 0.7) sparks.splice(i, 1);
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

      for (const m of meteors) {
        const p = m.age / m.life;
        const flare = m.flare * Math.exp(-(((p - m.flareAt) / 0.08) ** 2));
        // Head and trail share one envelope, so the trail can never outlive its head
        const a = Math.min(1, (smooth(0, 0.12, p) * (1 - smooth(0.62, 1, p)) + flare * 0.5) * dim);
        if (a <= 0.01) continue;
        const { head, trail } = STYLES[m.style];
        const len = Math.min(m.maxTrail, m.speed * m.age);
        const tx = m.x - DX * len;
        const ty = m.y - DY * len;
        const half = (1.1 + m.size * 1.3) * (1 + flare * 0.5);

        // Soft glow around the trail, then the tapered trail itself
        for (const [width, strength] of [
          [half * 3.2, 0.16],
          [half, 1],
        ]) {
          const px = -DY * width;
          const py = DX * width;
          const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
          grad.addColorStop(0, `rgba(${head},${a * 0.9 * strength})`);
          grad.addColorStop(0.12, `rgba(${trail},${a * 0.55 * strength})`);
          grad.addColorStop(1, `rgba(${trail},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(m.x + px, m.y + py);
          ctx.lineTo(tx, ty);
          ctx.lineTo(m.x - px, m.y - py);
          ctx.closePath();
          ctx.fill();
        }

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

        const s = (12 + m.size * 16) * (1 + flare);
        ctx.globalAlpha = a;
        ctx.drawImage(heads[m.style], m.x - s / 2, m.y - s / 2, s, s);
        ctx.globalAlpha = 1;
      }
    },
  };
}
