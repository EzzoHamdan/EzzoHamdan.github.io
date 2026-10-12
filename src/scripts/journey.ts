/**
 * The galaxy journey, page side. On wide screens with motion allowed (JOURNEY_QUERY, also checked
 * by the inline script in Base.astro that sets `html.journey` before first paint), scrolling flies
 * a camera forward through space and the page's content becomes planes placed along the route.
 *
 * Every `[data-stop]` element is a stop: the hero, each section title, each block of content. Stops
 * are fixed to the screen and moved here with CSS 3D transforms; the sections stay in the document
 * only to reserve scroll distance (and for anchors, the header highlight and screen readers, which
 * read the page in its normal order).
 *
 * Choreography, the same for every stop so fast scrolling stays orderly:
 * - Arrive: a plane appears far ahead (STRIDE focal lengths away, still in space as the camera
 *   approaches), turned like a wall on its side of the route, and swings flat into the center.
 *   Content "renders" in from top to bottom; titles assemble from scattered points of starlight.
 * - Hold: around each stop (HOLD) the plane is flat, centered, untransformed and fully crisp, and the
 *   camera all but stops. This is where reading happens.
 * - Depart: the plane peels off to its side (titles rise overhead) and fades as the camera moves on.
 * Content planes alternate sides; titles always come straight down the middle. Only the next plane
 * is ever visible while one holds, and every plane dims while the camera is moving fast, so a fast
 * scroll reads as a warp between stops, not a pile of flying text.
 *
 * The camera position is eased (LAG) and shared with the sky through `camera` messages, with the
 * same focal length as the CSS perspective, so stars, galaxies and text move as one space.
 */
import type { JourneyMessage } from './sky/journey';

export const JOURNEY_QUERY = '(min-width: 900px) and (min-height: 560px) and (prefers-reduced-motion: no-preference)';

type Kind = 'hero' | 'title' | 'panel';
interface Stop {
  el: HTMLElement;
  kind: Kind;
  section: string;
  /** Scroll length relative to a content stop. */
  weight: number;
  /** -1 left, 1 right, 0 straight ahead: where the plane arrives from and leaves to. */
  side: number;
  /** Slight vertical offset on arrival, for variety. */
  lift: number;
  /** Scroll position where this stop holds still. */
  y: number;
  /** Hold depth in focal lengths: above 1 pushes a plane too big for the screen back until it fits. */
  fit: number;
  /** The last styles written, to skip writes that change nothing. */
  last: string;
  /** For a content stop, the pieces placed in space around the route (see placeParts). */
  parts: Part[];
}

/**
 * A piece of a content stop, fixed at a point in space: `x` across (viewport widths, positive
 * toward the stop's side of the route), `y` down (viewport heights) and `dz` extra depth (focal
 * lengths), seen at the stop's hold. From ProfilePage.astro's data-at.
 */
interface Part {
  el: HTMLElement;
  card: boolean;
  x: number;
  y: number;
  dz: number;
  /** Turn toward the route, in degrees: cards like signs facing the road, visuals barely. */
  turn: number;
  fit: number;
  last: string;
}

/** Half-width of the still hold around each stop, in stops. */
const HOLD = 0.2;
/** Camera travel per stop, in focal lengths. */
const STRIDE = 4;
/** Scroll length of a content stop, in viewport heights. */
const PACE = 0.95;
/** Scroll length of each kind of stop, relative to PACE: the takeoff from the hero is unhurried. */
const WEIGHT: Record<Kind, number> = { hero: 1.4, title: 0.65, panel: 1 };
/** How long the camera takes to catch up with the scroll position, in seconds. */
const LAG = 0.14;
/** A little camera movement during a hold, so the stars answer every scroll. */
const CREEP = 0.08;
/**
 * After the last stop, the homecoming: three more stops with no text, each a stage of a dive
 * home (sky/journey.ts::drawHome), then the landing at dawn over Amman.
 */
const HOME_STAGES = ['milkyway', 'sun', 'earth'] as const;
const HOME_WEIGHT = 0.8;

/** What the camera is passing, by section or homecoming stage, for the caption. */
const CAPTIONS = {
  en: {
    about: 'The Sombrero galaxy',
    experience: 'The Whirlpool galaxy',
    projects: 'The Triangulum galaxy',
    education: 'Andromeda, al-Sufi’s “little cloud”',
    milkyway: 'The Milky Way, our galaxy',
    sun: 'The Solar System, in the Orion Arm',
    earth: 'Earth, as dawn reaches Amman',
    dawn: 'Dawn over Amman',
  },
  ar: {
    about: 'مجرة القبعة المكسيكية',
    experience: 'مجرة الدوامة',
    projects: 'مجرة المثلث',
    education: 'المرأة المسلسلة، «اللطخة السحابية» عند الصوفي',
    milkyway: 'درب التبانة، مجرّتنا',
    sun: 'المجموعة الشمسية، في ذراع الجبّار',
    earth: 'الأرض، والفجر يبلغ عمّان',
    dawn: 'فجر عمّان',
  },
};

/**
 * How far from Earth each place on the route is, in light-years. The galaxies come farthest
 * first, so the whole journey is a return home: the Sombrero (31 million, McQuinn et al. 2016),
 * the Whirlpool (28 million, same survey), Triangulum (2.7 million), Andromeda (2.5 million), then
 * the Milky Way seen whole, the Solar System from a few light-hours out, and Earth from about
 * 22,000 km.
 */
const LIGHT_YEAR_KM = 9.4607e12;
const DISTANCE: Record<string, number> = {
  about: 31e6,
  experience: 28e6,
  projects: 2.7e6,
  education: 2.5e6,
  milkyway: 1e5,
  sun: 4 / (24 * 365.25),
  earth: 22_000 / LIGHT_YEAR_KM,
};

// Units from largest to smallest: [light-years per unit, English, Arabic singular, dual, plural]
const UNITS: [number, string, string, string, string][] = [
  [1, 'light-year', 'سنة ضوئية', 'سنتان ضوئيتان', 'سنوات ضوئية'],
  [1 / 365.25, 'light-day', 'يوم ضوئي', 'يومان ضوئيان', 'أيام ضوئية'],
  [1 / 8766, 'light-hour', 'ساعة ضوئية', 'ساعتان ضوئيتان', 'ساعات ضوئية'],
  [1 / 525_960, 'light-minute', 'دقيقة ضوئية', 'دقيقتان ضوئيتان', 'دقائق ضوئية'],
  [1 / 31_557_600, 'light-second', 'ثانية ضوئية', 'ثانيتان ضوئيتان', 'ثوانٍ ضوئية'],
];
const group = (n: number) => Math.round(n).toLocaleString('en-US');
/** Two significant figures: 31, 2.7, 0.45. */
const round2 = (n: number) => (n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

/** "31 million light-years from Earth", "4 light-hours from Earth", "22,000 km from Earth". */
function formatDistance(ly: number, lang: 'en' | 'ar') {
  let amount: string;
  if (ly >= 1e6) {
    amount = lang === 'ar' ? `${round2(ly / 1e6)} مليون سنة ضوئية` : `${round2(ly / 1e6)} million light-years`;
  } else if (ly >= 1000) {
    const n = Number((ly).toPrecision(2));
    amount = lang === 'ar' ? `${group(n)} سنة ضوئية` : `${group(n)} light-years`;
  } else if (ly * LIGHT_YEAR_KM < 300_000) {
    const km = Number((ly * LIGHT_YEAR_KM).toPrecision(2));
    amount = lang === 'ar' ? `${group(km)} كم` : `${group(km)} km`;
  } else {
    const [per, en, one, two, few] = UNITS.find(([u]) => ly >= u) ?? UNITS[UNITS.length - 1];
    const v = ly / per;
    const n = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
    if (lang === 'ar') {
      // Arabic counts: one and two take the noun alone, three to ten the plural, eleven up the singular
      amount = n === 1 ? one : n === 2 ? two : Number.isInteger(n) && n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${one}`;
    } else {
      amount = `${n} ${en}${n === 1 ? '' : 's'}`;
    }
  }
  return lang === 'ar' ? `على بُعد ${amount} من الأرض` : `${amount} from Earth`;
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Camera progress along the route: still around each stop, gliding between them. */
const stairs = (u: number) => {
  const s = Math.floor(u);
  const f = u - s;
  return s + (1 - CREEP) * smooth(HOLD, 1 - HOLD, f) + CREEP * f;
};

/**
 * Split a title into glyphs that can assemble from starlight. Letters in English; whole words in
 * Arabic, whose letters join. Screen readers get the plain text.
 */
function spell(h: HTMLElement, lang: 'en' | 'ar') {
  const text = (h.textContent ?? '').trim();
  const plain = Object.assign(document.createElement('span'), { className: 'sr-only', textContent: text });
  const shown = Object.assign(document.createElement('span'), { className: 'glyphs' });
  shown.setAttribute('aria-hidden', 'true');
  text.split(/\s+/).forEach((word, i) => {
    if (i) shown.append(' ');
    const w = Object.assign(document.createElement('span'), { className: 'word' });
    for (const part of lang === 'ar' ? [word] : [...word]) {
      const g = Object.assign(document.createElement('span'), { className: 'glyph', textContent: part });
      const a = Math.random() * Math.PI * 2;
      const d = 90 + Math.random() * 240;
      g.style.cssText =
        `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d * 0.6).toFixed(0)}px;` +
        `--d:${(Math.random() * 0.45).toFixed(2)};--sx:${Math.round(Math.random() * 40)}px;--sy:${Math.round(Math.random() * 40)}px`;
      w.append(g);
    }
    shown.append(w);
  });
  h.replaceChildren(plain, shown);
}

export function startJourney() {
  const root = document.documentElement;
  const lang = root.lang === 'ar' ? 'ar' : 'en';
  const main = document.getElementById('main')!;
  const sections = [...main.querySelectorAll<HTMLElement>(':scope > section[id]')];
  const contact = document.getElementById('contact');
  const viewCaption = document.getElementById('sky-view');
  // The caption: where the camera is, and how far from Earth
  const captionName = document.createElement('span');
  const captionDistance = Object.assign(document.createElement('span'), { className: 'sky-distance' });
  viewCaption?.replaceChildren(captionName, captionDistance);
  const heroCaption = document.getElementById('sky-caption');
  const skyline = document.querySelector<SVGSVGElement>('.skyline');

  let content = 0;
  const stops: Stop[] = [...main.querySelectorAll<HTMLElement>('[data-stop]')].map((el) => {
    const kind = el.dataset.stop as Kind;
    let side = 0;
    let lift = 0;
    if (kind === 'hero') side = -1;
    if (kind === 'panel') {
      side = content % 2 ? -1 : 1;
      lift = [0, 0.7, -0.7][content % 3];
      content++;
    }
    if (kind === 'title') spell(el, lang);
    const parts: Part[] = [...el.querySelectorAll<HTMLElement>('[data-part]')].map((p) => {
      const card = p.dataset.part === 'card';
      const [x, y, dz] = (p.dataset.at ?? (card ? '0.2,0,0' : '-0.26,0,0.35')).split(',').map(Number);
      return { el: p, card, x, y, dz, turn: card ? 10 : 4, fit: 1, last: '' };
    });
    return { el, kind, section: el.closest('section')?.id ?? '', weight: WEIGHT[kind], side, lift, y: 0, fit: 1, last: '', parts };
  });
  const lastStop = stops.length - 1;

  let vw = 0, vh = 0, F = 1000, cy = 0, contactTop = 0, horizonFromContact = NaN;
  /** Scroll positions of the homecoming's stages, after the last stop. */
  let homeY: number[] = [];
  let sink: ((msg: JourneyMessage) => void) | null = null;

  function layout() {
    vw = innerWidth;
    vh = innerHeight;
    F = Math.round(0.72 * vw);
    const header = document.querySelector('.site-header')?.getBoundingClientRect().height ?? 76;
    root.style.setProperty('--header', `${header}px`);
    cy = header + (vh - header) / 2;

    let y = 0;
    stops.forEach((s, i) => {
      if (i) y += (PACE * vh * (stops[i - 1].weight + s.weight)) / 2;
      s.y = Math.round(y);
      s.fit = Math.max(1, s.el.offsetHeight / (vh - header - 48), s.el.offsetWidth / (vw - 48));
      s.last = '';
      for (const p of s.parts) {
        p.fit = Math.max(1, p.el.offsetHeight / (vh - header - 40));
        p.last = '';
      }
    });

    // The homecoming's stages follow the last stop like stops of their own
    homeY = [];
    let at = stops[lastStop].y + (PACE * vh * (stops[lastStop].weight + HOME_WEIGHT)) / 2;
    for (let k = 0; k < HOME_STAGES.length; k++, at += PACE * vh * HOME_WEIGHT) homeY.push(Math.round(at));

    // The sections become the scroll track. Their boundaries sit halfway between stops, shifted
    // half a screen so the header highlights the section of the stop being read
    contactTop = homeY[homeY.length - 1] + PACE * vh * 0.45 + vh;
    const track = sections.filter((sec) => stops.some((s) => s.section === sec.id));
    let top = 0;
    track.forEach((sec, k) => {
      const next = track[k + 1];
      const i = next ? stops.findIndex((s) => s.section === next.id) : -1;
      const bottom = Math.round(next ? (stops[i - 1].y + stops[i].y) / 2 + vh / 2 : contactTop);
      sec.style.height = `${bottom - top}px`;
      top = bottom;
    });

    // Where the skyline's far hills sit relative to the top of the contact section (see
    // Sky.astro::horizonNow for the mapping), so the horizon is known without reading layout
    // every frame
    if (contact && skyline) {
      const c = contact.getBoundingClientRect();
      const r = skyline.getBoundingClientRect();
      const box = skyline.viewBox.baseVal;
      const scale = Math.max(r.width / box.width, r.height / box.height);
      horizonFromContact = r.bottom - c.top - (box.height - Number(skyline.dataset.horizon)) * scale;
    }

    sink?.({
      type: 'route',
      focal: F,
      stride: STRIDE * F,
      cy,
      legs: track.map((sec) => ({
        id: sec.id,
        first: stops.findIndex((s) => s.section === sec.id),
        last: stops.map((s) => s.section).lastIndexOf(sec.id),
      })),
    });
    onScroll();
  }

  /** Position along the route, in stops (the homecoming's stages included), for a scroll position. */
  function routeAt(y: number) {
    if (y <= 0) return 0;
    const ys = [...stops.map((s) => s.y), ...homeY];
    for (let i = 0; i < ys.length - 1; i++) {
      if (y < ys[i + 1]) return i + (y - ys[i]) / (ys[i + 1] - ys[i]);
    }
    // At the Earth the route ends; the landing (the contact section scrolling in) takes over
    return ys.length - 1;
  }

  /**
   * How far the camera has flown for a position along the route. It slows to a creep for the
   * homecoming, whose motion is the zoom home rather than the flight.
   */
  function cameraZ(u: number) {
    const st = stairs(u);
    const flight = Math.min(st, lastStop + 1);
    return STRIDE * F * (flight + 0.15 * Math.max(0, st - lastStop - 1));
  }

  /** The camera's distance along the route for the text: like cameraZ, but still during holds. */
  const panelZ = (u: number) => {
    const s0 = Math.floor(u);
    return STRIDE * F * (s0 + smooth(HOLD, 1 - HOLD, u - s0));
  };

  // The mouse's lean moves the camera a little across; near things shift more than far ones
  let px = 0, py = 0;

  /**
   * A content stop's parts are fixed in space beside the route, cards on the stop's side and
   * visuals on the other. Nothing slides them into place: as the camera approaches, perspective
   * alone grows them and carries them outward to their side, and as it goes on they pass out of
   * view there, like signs along a road. At the hold the camera is still and so are they.
   */
  function placeParts(s: Stop, i: number, zP: number, shown: boolean, settled: boolean, warp: number) {
    const camX = px * 0.012 * vw;
    const camY = py * 0.01 * vh;
    let frameOpacity = 0;
    for (const p of s.parts) {
      const D = STRIDE * F * i - zP + F * p.fit * (1 + p.dz);
      let opacity = 0;
      let transform = 'none';
      let reveal = 0;
      if (shown && D > 0.3 * F && D < 6 * F) {
        const x = s.side * p.x * vw - camX;
        const y = p.y * vh - camY;
        const turn = -Math.sign(s.side * p.x) * p.turn;
        transform = `perspective(${F}px) translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${(F - D).toFixed(1)}px) rotateY(${turn.toFixed(2)}deg)`;
        // Fades in from far ahead, out as it passes close by
        opacity = smooth(5.2 * F, 3.2 * F, D) * (1 - smooth(0.8 * F, 0.42 * F, D)) * (1 - 0.6 * warp);
        reveal = smooth(4.8 * F, 1.7 * F, D);
      }
      frameOpacity = Math.max(frameOpacity, opacity);
      const key = `${transform}|${opacity.toFixed(3)}|${reveal.toFixed(3)}`;
      if (key === p.last) continue;
      p.last = key;
      p.el.style.transform = transform;
      p.el.style.opacity = opacity.toFixed(3);
      p.el.style.zIndex = String(Math.round(100 - (D / F) * 10));
      p.el.style.setProperty('--r', reveal.toFixed(3));
    }
    // Stops already passed stay above the ones ahead, since they are nearer. (No visibility
    // toggling: a hidden part couldn't take keyboard focus, which is how a far stop is reached)
    const passed = STRIDE * F * i < zP;
    const key = `${settled}|${passed}|${frameOpacity > 0}`;
    if (key !== s.last) {
      s.last = key;
      s.el.classList.toggle('is-settled', settled);
      s.el.style.zIndex = passed ? '6' : '5';
    }
  }

  function place(s: Stop, a: number, b: number, warp: number) {
    const hold = F * s.fit;
    let transform = 'none';
    let opacity = 1;
    let reveal = 1;
    let letters = 1;
    const settled = a >= 1 && b <= 0;
    if (a <= 0 || b >= 1) {
      opacity = 0;
      reveal = 0;
      letters = 0;
    } else if (a < 1) {
      // Arriving: still in space while the camera approaches, swinging flat into the center
      const k = 1 - a;
      const D = hold + STRIDE * F * k;
      const x = s.side * 1.5 * vw * k ** 1.6;
      const y = s.lift * 0.4 * vh * k ** 1.6;
      transform = `perspective(${F}px) translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${(F - D).toFixed(1)}px) rotateY(${(-s.side * 38 * k ** 1.2).toFixed(2)}deg) rotateX(${(s.lift * 9 * k ** 1.2).toFixed(2)}deg)`;
      opacity = smooth(0, 0.35, a);
      reveal = smooth(0.08, 0.8, a);
      letters = smooth(0.15, 1, a);
    } else if (b > 0 && s.kind === 'hero') {
      // Takeoff: the hero is the ground. It sinks away below and tilts like a floor seen from
      // above as the camera rises, slowly, while the first title gathers ahead
      const e = smooth(0, 0.9, b);
      const D = hold * (1 + 0.7 * e);
      const y = 0.5 * vh * e ** 1.3;
      transform = `perspective(${F}px) translate3d(0px,${y.toFixed(1)}px,${(F - D).toFixed(1)}px) rotateX(${(32 * e).toFixed(2)}deg)`;
      opacity = 1 - smooth(0.2, 0.9, e);
    } else if (b > 0) {
      // Departing: peeling off to its side, or overhead for a title, as the camera passes
      const e = smooth(0, 0.6, b);
      const D = hold * (1 - 0.5 * e);
      const title = s.kind === 'title';
      const x = title ? 0 : s.side * 0.9 * vw * e ** 1.4;
      const y = title ? -0.8 * vh * e ** 1.4 : s.lift * 0.2 * vh * e ** 1.4;
      const ry = title ? 0 : -s.side * 50 * e;
      const rx = title ? 20 * e : 0;
      transform = `perspective(${F}px) translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${(F - D).toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg)`;
      opacity = 1 - smooth(0.1, 0.75, e);
    } else if (s.fit > 1) {
      transform = `perspective(${F}px) translateZ(${(F - hold).toFixed(1)}px)`;
    }
    opacity *= 1 - 0.6 * warp;
    const key = `${transform}|${opacity.toFixed(3)}|${reveal.toFixed(3)}|${letters.toFixed(3)}|${b > 0}|${settled}`;
    if (key === s.last) return opacity;
    s.last = key;
    const st = s.el.style;
    st.transform = transform;
    st.opacity = opacity.toFixed(3);
    st.zIndex = b > 0 ? '6' : '5';
    st.setProperty('--r', reveal.toFixed(3));
    st.setProperty('--a', letters.toFixed(3));
    s.el.classList.toggle('is-settled', settled);
    return opacity;
  }

  let captionKey = '';
  function render(u: number, rate: number) {
    const s0 = Math.floor(u);
    const t = smooth(HOLD, 1 - HOLD, u - s0);
    const warp = smooth(1.2, 3.5, rate);
    const zP = panelZ(u);
    stops.forEach((s, i) => {
      if (s.parts.length) {
        placeParts(s, i, zP, Math.abs(u - i) < 1.5, Math.abs(u - i) <= HOLD, warp);
        return;
      }
      let a = 1;
      let b = 0;
      if (i === s0) b = t;
      else if (i === s0 + 1) a = t;
      else if (i < s0) b = 1;
      else a = 0;
      const opacity = place(s, a, b, warp);
      if (s.kind === 'hero' && heroCaption) heroCaption.style.opacity = opacity.toFixed(3);
    });
    caption(u);
  }

  /**
   * A jump (a link or keyboard focus to a stop more than one away) is one move, straight there:
   * the plane being read leaves, the camera crosses the distance with nothing in between, and only
   * the destination arrives. Scrolling through every stop on the way flashed each plane past.
   */
  function renderFlight(f: Flight, t: number) {
    const zP = f.p0 + (f.p1 - f.p0) * glide(t);
    stops.forEach((s, i) => {
      if (s.parts.length) {
        // Only the stop being left and the one being reached are out there during a jump
        placeParts(s, i, zP, i === f.from || i === f.to, false, 0);
        return;
      }
      let a = 0;
      let b = 1;
      if (i === f.to) {
        a = smooth(0.5, 1, t);
        b = 0;
      } else if (i === f.from) {
        a = 1;
        b = smooth(0, 0.4, t);
      }
      const opacity = place(s, a, b, 0);
      if (s.kind === 'hero' && heroCaption) heroCaption.style.opacity = opacity.toFixed(3);
    });
    caption(eased);
  }

  // The caption names where the camera is heading
  function caption(u: number) {
    if (!viewCaption) return;
    const near = stops[Math.min(lastStop, Math.round(u))];
    const stage = Math.round(u) - lastStop - 1;
    const key =
      landing() > 0.35 ? 'dawn' : stage >= 0 ? HOME_STAGES[Math.min(stage, HOME_STAGES.length - 1)] : near.kind === 'hero' ? '' : near.section;
    if (key !== captionKey) {
      captionKey = key;
      const text = (CAPTIONS[lang] as Record<string, string>)[key] ?? '';
      captionName.textContent = text;
      viewCaption.hidden = !text;
    }
    // The distance from Earth counts down between places and holds while a stop is read
    const ly = key === 'dawn' ? 0 : distanceAt(u);
    const distance = ly > 0 ? formatDistance(ly, lang) : '';
    if (distance !== captionDistance.textContent) captionDistance.textContent = distance;
  }

  /** Distance from Earth along the route: each stop's place, gliding on a log scale between them. */
  function distanceAt(u: number) {
    const at = (i: number) => {
      const key = i > lastStop ? HOME_STAGES[Math.min(i - lastStop - 1, HOME_STAGES.length - 1)] : stops[i].section;
      return DISTANCE[key] ?? NaN;
    };
    const s0 = Math.max(0, Math.floor(u));
    const a = at(s0);
    const b = at(Math.min(s0 + 1, lastStop + HOME_STAGES.length));
    if (!Number.isFinite(a)) return b;
    if (!Number.isFinite(b)) return a;
    const t = smooth(HOLD, 1 - HOLD, u - s0);
    return 10 ** (Math.log10(a) + (Math.log10(b) - Math.log10(a)) * t);
  }

  // The camera follows the scroll position with a little lag, so wheel steps glide
  let target = 0, eased = 0, rate = 0, lastZ = 0, lastTime = 0, running = false;
  const landing = () => clamp(1 - (contactTop - scrollY) / vh);

  interface Flight {
    y0: number;
    y1: number;
    z0: number;
    z1: number;
    /** The text's camera distance at both ends (panelZ). */
    p0: number;
    p1: number;
    from: number;
    to: number;
    start: number;
    ms: number;
  }
  let flight: Flight | null = null;
  /** Smootherstep: starts and ends at rest, with no jolt in acceleration either. */
  const glide = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

  function send(z: number, speed: number) {
    const top = contactTop - scrollY;
    sink?.({
      type: 'camera',
      z,
      speed,
      u: eased,
      home: stairs(eased) - lastStop,
      end: landing(),
      horizonY: Number.isFinite(horizonFromContact) ? top + horizonFromContact : NaN,
    });
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 1 / 60);
    lastTime = now;
    if (flight) {
      // The page scrolls along with the jump, so the header, the address and the landing at the
      // end all stay true to where the camera is
      const t = clamp((now - flight.start) / flight.ms);
      const k = glide(t);
      const y = flight.y0 + (flight.y1 - flight.y0) * k;
      scrollTo({ top: y, behavior: 'instant' });
      eased = target = routeAt(y);
      const z = flight.z0 + (flight.z1 - flight.z0) * k;
      const speed = (z - lastZ) / dt;
      lastZ = z;
      renderFlight(flight, t);
      send(z, speed);
      if (t >= 1) {
        flight = null;
        rate = 0;
      }
      requestAnimationFrame(frame);
      return;
    }
    const before = eased;
    eased += (target - eased) * (1 - Math.exp(-dt / LAG));
    if (Math.abs(target - eased) < 0.0004) eased = target;
    rate += (Math.abs(eased - before) / dt - rate) * (1 - Math.exp(-dt / 0.12));
    const z = cameraZ(eased);
    const speed = (z - lastZ) / dt;
    lastZ = z;
    render(eased, rate);
    if (eased !== target || rate > 0.02) {
      send(z, speed);
      requestAnimationFrame(frame);
    } else {
      rate = 0;
      render(eased, 0);
      send(z, 0);
      running = false;
    }
  }

  function wake() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    lastZ = cameraZ(eased);
    requestAnimationFrame(frame);
  }

  function onScroll() {
    if (flight) return;
    target = routeAt(scrollY);
    wake();
  }

  /** Fly to a scroll position: one smooth jump if it is more than a stop away (see renderFlight). */
  function flyTo(y: number) {
    const u1 = routeAt(y);
    const distance = Math.abs(u1 - eased);
    if (distance <= 1.25) {
      scrollTo({ top: y, behavior: 'smooth' });
      return;
    }
    flight = {
      y0: scrollY,
      y1: y,
      z0: cameraZ(eased),
      z1: cameraZ(u1),
      p0: panelZ(eased),
      p1: panelZ(u1),
      from: Math.round(eased),
      to: Number.isInteger(u1) ? u1 : -1,
      start: performance.now(),
      // Longer jumps take a little longer, never more than two and a half seconds
      ms: 1000 * clamp(0.8 + 0.17 * distance, 1.1, 2.4),
    };
    wake();
  }
  // Any scrolling by the reader takes over from a jump in progress
  const takeOver = () => {
    if (!flight) return;
    flight = null;
    target = routeAt(scrollY);
  };
  addEventListener('wheel', takeOver, { passive: true });
  addEventListener('touchstart', takeOver, { passive: true });
  addEventListener('keydown', takeOver);

  /** Scroll position for an in-page link target: a section's first stop, or a stop's own hold. */
  function targetFor(id: string) {
    if (id === 'hero') return 0;
    if (id === 'contact') return root.scrollHeight - innerHeight;
    const el = document.getElementById(id);
    if (!el) return null;
    const stop = el.closest('[data-stop]') ?? el.querySelector('[data-stop]');
    const i = stops.findIndex((s) => s.el === stop);
    return i >= 0 ? stops[i].y : null;
  }

  // Start where the reader was: an anchor in the address, or the place they reloaded at
  history.scrollRestoration = 'manual';
  layout();
  eased = target = routeAt(scrollY);
  const anchor = location.hash.slice(1);
  const saved = Number(sessionStorage.getItem(`journey:${location.pathname}`) ?? NaN);
  const start = anchor ? targetFor(anchor) : Number.isFinite(saved) ? saved : null;
  if (start !== null) {
    scrollTo({ top: start, behavior: 'instant' });
    eased = target = routeAt(scrollY);
  }
  render(eased, 0);
  lastZ = cameraZ(eased);
  addEventListener('pagehide', () => sessionStorage.setItem(`journey:${location.pathname}`, String(scrollY)));
  addEventListener('scroll', onScroll, { passive: true });

  let resizeTimer: ReturnType<typeof setTimeout>;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 150);
  });
  // Fonts and late layout change the planes' sizes
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 150);
  });
  stops.forEach((s) => observer.observe(s.el));
  // Crossing into a narrow screen or reduced motion: the page becomes the plain dome again
  matchMedia(JOURNEY_QUERY).addEventListener('change', () => location.reload());

  // In-page links fly the camera to their stop
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a || a.classList.contains('skip-link')) return;
    const id = decodeURIComponent(a.hash.slice(1));
    const y = targetFor(id);
    if (y === null) return;
    e.preventDefault();
    history.pushState(null, '', `#${id}`);
    flyTo(y);
  });
  // A role's full list of highlights, on request (two per group show until then)
  document.addEventListener('click', (e) => {
    const button = (e.target as Element).closest?.('.more') as HTMLButtonElement | null;
    if (!button) return;
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    button.closest('.role')?.classList.toggle('is-open', open);
    const other = button.dataset.less ?? '';
    button.dataset.less = button.textContent?.trim() ?? '';
    button.textContent = other;
  });

  // The mouse leans the camera a little (px and py, -1..1, eased): the parts shift by their depth
  // and the sky leans the same way
  let tx = 0, ty = 0, leaning = false;
  const lean = () => {
    px += (tx - px) * 0.08;
    py += (ty - py) * 0.08;
    if (!running && !flight) render(eased, 0);
    sink?.({ type: 'lean', x: px, y: py });
    if (Math.abs(tx - px) + Math.abs(ty - py) > 0.002) requestAnimationFrame(lean);
    else leaning = false;
  };
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      tx = (e.clientX / innerWidth) * 2 - 1;
      ty = (e.clientY / innerHeight) * 2 - 1;
      if (!leaning) {
        leaning = true;
        requestAnimationFrame(lean);
      }
    },
    { passive: true },
  );

  // Keyboard focus moving into a plane that is not on screen brings it there
  document.addEventListener('focusin', (e) => {
    const stop = (e.target as Element).closest?.('[data-stop]');
    const i = stops.findIndex((s) => s.el === stop);
    if (i >= 0 && Math.abs(eased - i) > HOLD) flyTo(stops[i].y);
  });

  return {
    /** Connect the sky; it gets the route and the camera from then on. */
    attach(post: (msg: JourneyMessage) => void) {
      sink = post;
      layout();
      send(cameraZ(eased), 0);
    },
  };
}
