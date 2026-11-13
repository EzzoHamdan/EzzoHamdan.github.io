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
 * - At the stop: the plane is flat, centered and fully crisp. The camera slows to half its average
 *   speed (EVEN) and the text to a quarter (TEXT_EVEN), but neither ever stops, so every bit of
 *   scrolling moves the scene. Reading happens wherever the reader stops scrolling near it (within
 *   SETTLED, it counts as settled).
 * - Depart: the plane peels off to its side (titles rise overhead) and fades as the camera moves on.
 * Content planes alternate sides; titles always come straight down the middle. Only the next plane
 * is ever visible while one is read, and every plane dims while the camera is moving fast, so a
 * fast scroll reads as a warp between stops, not a pile of flying text.
 *
 * The camera position is eased (LAG) and shared with the sky through `camera` messages, with the
 * same focal length as the CSS perspective, so stars, galaxies and text move as one space.
 */
import type { JourneyMessage } from './sky/journey';
import { GENESIS } from './sky/genesis';
import { ammanClock, daylight, mainLook, now, type Look } from './sky/astro';
import { latestWeather, weatherLine } from './weather';

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

/**
 * How evenly the camera moves between stops: this share of its travel is at a constant speed, the
 * rest eases, so it slows to that share of its average speed at each stop and never stops (owner's
 * request, 2026-11-13). It used to hold almost still for 40% of every stop's scroll, which made
 * each title and each card a full stop to scroll through.
 */
const EVEN = 0.5;
/**
 * The same for the text planes, which slow down more near their stop (to a quarter of their
 * average speed), so a reader who stops a little past one still finds it whole, while the stars
 * behind keep moving at half speed. Nothing in space sits beside the text to show the difference.
 */
const TEXT_EVEN = 0.25;
/** How far along its arrival or departure a plane still counts as settled: crisp and clickable. */
const SETTLED = 0.05;
/** Camera travel per stop, in focal lengths. */
const STRIDE = 4;
/** Scroll length of a content stop, in viewport heights. */
const PACE = 0.95;
/**
 * Scroll length of each kind of stop, relative to PACE. The hero's is long because the first leg
 * holds the whole beginning (sky/genesis.ts): about 2.8 screens from the hero to "In short".
 */
const WEIGHT: Record<Kind, number> = { hero: 5.25, title: 0.65, panel: 1 };
/** How long the camera takes to catch up with the scroll position, in seconds. */
const LAG = 0.14;
/**
 * A menu jump that crosses the beginning or the homecoming slows down through them, so the Big
 * Bang and the dive home play as they do when scrolled slowly: milliseconds of flight per unit of
 * route there, against OPEN_MS across open space. In the first leg, the hero holding before the
 * light goes at STILL_MS, the light and the blast at GENESIS_MS, and the gas after it at DUST_MS:
 * quicker, close to the feel of a move between sections (owner's report, 2026-11-13: at the
 * blast's pace the gas dragged while everything else flew). LAND_MS is the whole landing in
 * Amman. The pace changes gradually between them (`paceAt`), so the camera never brakes or
 * lurches, and the flight keeps an even speed with soft ends (`cruise`, RAMP of its time at each
 * end).
 */
const PACED = { GENESIS_MS: 5460, STILL_MS: 1150, DUST_MS: 2100, HOME_MS: 900, OPEN_MS: 150, LAND_MS: 900, BASE_MS: 500, MAX_MS: 7000, RAMP: 0.2 } as const;

/**
 * Where a paced flight speeds up out of the beginning, on the route: from the end of the gas to
 * open space. The end is also where scrolling stops being paced (`throughBang`).
 */
const BLAST_OUT = [GENESIS.dust[1], 2.2] as const;
/**
 * Scrolling back through the beginning, toward the hero, goes this many times faster than forward,
 * except through the blast, which plays backwards at its own pace: the universe falls back into
 * the point (owner's request, 2026-11-13). At the forward pace the whole way, the hero took two
 * seconds to return after the reader had reached the top.
 */
const REWIND = 2.5;

/** An even cruise with soft ends: speed rises gently over RAMP of the time, holds, then eases off. */
const cruise = (t: number) => {
  const r = PACED.RAMP;
  const top = 1 / (1 - r);
  const ramp = (x: number) => 0.5 * top * (x - (r / Math.PI) * Math.sin((Math.PI * x) / r));
  if (t < r) return ramp(t);
  if (t > 1 - r) return 1 - ramp(1 - t);
  return 0.5 * top * r + top * (t - r);
};
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
    genesis: 'The beginning',
    dawn: 'Cosmic dawn, the first stars',
    milkyway: 'The Milky Way, our galaxy',
    sun: 'The Solar System, in the Orion Arm',
  },
  ar: {
    about: 'مجرة القبعة المكسيكية',
    experience: 'مجرة الدوامة',
    projects: 'مجرة المثلث',
    education: 'المرأة المسلسلة، «اللطخة السحابية» عند الصوفي',
    genesis: 'البداية',
    dawn: 'الفجر الكوني، النجوم الأولى',
    milkyway: 'درب التبانة، مجرّتنا',
    sun: 'المجموعة الشمسية، في ذراع الجبّار',
  },
};

/** The Earth's caption names the side of it Amman is on right now. */
const EARTH_CAPTIONS: Record<'en' | 'ar', Record<Look, string>> = {
  en: {
    night: 'Earth, night over Amman',
    dawn: 'Earth, as dawn reaches Amman',
    day: 'Earth, with Amman in daylight',
    dusk: 'Earth, as dusk falls on Amman',
  },
  ar: {
    night: 'الأرض، والليل يخيّم على عمّان',
    dawn: 'الأرض، والفجر يبلغ عمّان',
    day: 'الأرض، وعمّان في وضح النهار',
    dusk: 'الأرض، والغروب يحلّ على عمّان',
  },
};

/** The caption over Amman at the end of the page: its time right now, as the scene shows it. */
export function ammanNow(lang: 'en' | 'ar') {
  const clock = ammanClock(now());
  return lang === 'ar' ? `عمّان الآن، ${clock}` : `Amman right now, ${clock}`;
}

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
/** Progress through one leg (0..1 between two stops): partly even (`even`), the rest eased. */
const ease = (f: number, even = EVEN) => even * f + (1 - even) * f * f * (3 - 2 * f);
/** Progress through a stretch from a to b, eased like a text plane's leg: how the first title gathers. */
const across = (a: number, b: number, x: number) => ease(clamp((x - a) / (b - a)), TEXT_EVEN);
/** Progress along the route: slower near each stop, faster between, never still. */
const along = (u: number, even = EVEN) => {
  const s = Math.floor(u);
  return s + ease(u - s, even);
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
  const scrollCue = document.getElementById('scroll-cue');
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

  let vw = 0, vh = 0, F = 1000, cy = 0, contactTop = 0, horizonFromContact = NaN, textFromContact = NaN;
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
    // The route now holds the scroll distance, so the contact section is far below (see the
    // .has-route rule in global.css)
    root.classList.add('has-route');

    // Where the skyline's far hills sit relative to the top of the contact section (see
    // Sky.astro::horizonNow for the mapping), so the horizon is known without reading layout
    // every frame
    if (contact && skyline) {
      const c = contact.getBoundingClientRect();
      const r = skyline.getBoundingClientRect();
      const box = skyline.viewBox.baseVal;
      const scale = Math.max(r.width / box.width, r.height / box.height);
      horizonFromContact = r.bottom - c.top - (box.height - Number(skyline.dataset.horizon)) * scale;
      // And where the contact text ends, which clouds keep below (sky/weather.ts)
      const words = contact.querySelector('.contact')?.getBoundingClientRect();
      textFromContact = words ? words.bottom - c.top : NaN;
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
    const st = along(u);
    const flight = Math.min(st, lastStop + 1);
    return STRIDE * F * (flight + 0.15 * Math.max(0, st - lastStop - 1));
  }

  /** The camera's distance along the route for the text: slower near stops than cameraZ (TEXT_EVEN). */
  const panelZ = (u: number) => STRIDE * F * along(u, TEXT_EVEN);

  // The mouse's lean moves the camera a little across; near things shift more than far ones
  let px = 0, py = 0;

  /**
   * A content stop's parts are fixed in space beside the route, cards on the stop's side and
   * visuals on the other. Nothing slides them into place: as the camera approaches, perspective
   * alone grows them and carries them outward to their side, and as it goes on they pass out of
   * view there, like signs along a road. When the reader stops scrolling, the camera stops and so
   * do they.
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
    const settled = a >= 1 - SETTLED && b <= SETTLED;
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
    const t = ease(u - s0, TEXT_EVEN);
    const warp = smooth(1.2, 3.5, rate);
    const zP = panelZ(u);
    // The first leg belongs to the beginning (sky/genesis.ts): the hero is gone before the
    // singularity is alone, and the first title gathers only after the blast and the dust
    const genesis = s0 === 0;
    stops.forEach((s, i) => {
      if (s.parts.length) {
        placeParts(s, i, zP, Math.abs(u - i) < 1.5, Math.abs(zP / (STRIDE * F) - i) <= SETTLED, warp);
        return;
      }
      let a = 1;
      let b = 0;
      if (i === s0) b = genesis ? smooth(GENESIS.hero[0], GENESIS.hero[1], u) : t;
      else if (i === s0 + 1) a = genesis ? across(GENESIS.title[0], GENESIS.title[1], u) : t;
      else if (i < s0) b = 1;
      else a = 0;
      place(s, a, b, warp);
    });
    caption(u);
    cue(u);
  }

  /**
   * A jump (a link or keyboard focus to a stop more than one away) is one move, straight there:
   * the plane being read leaves, the camera crosses the distance with nothing in between, and only
   * the destination arrives. Scrolling through every stop on the way flashed each plane past.
   */
  function renderFlight(f: Flight, t: number) {
    const zP = f.pace ? flightZ(eased) : f.p0 + (f.p1 - f.p0) * glide(t);
    stops.forEach((s, i) => {
      if (s.parts.length) {
        // Only the stop being left and the one being reached are out there during a jump
        placeParts(s, i, zP, i === f.from || i === f.to, false, 0);
        return;
      }
      let a = 0;
      let b = 1;
      // A paced flight's time goes mostly to its set pieces, so its planes leave and arrive by
      // distance along the route (within about a stop of either end), not by the clock
      if (i === f.to) {
        a = f.pace ? 1 - smooth(0.3, 1, Math.abs(f.u1 - eased)) : smooth(0.5, 1, t);
        b = 0;
      } else if (i === f.from) {
        a = 1;
        b = f.pace ? smooth(0.1, 0.6, Math.abs(eased - f.u0)) : smooth(0, 0.4, t);
      }
      // In the beginning the hero and the first title keep to the Big Bang's timing, whichever way
      // the jump goes: the hero is gone before the bang, the title gathers after the flash
      if (i === f.to || i === f.from) {
        if (i === 0) {
          a = 1;
          b = smooth(GENESIS.hero[0], GENESIS.hero[1], eased);
        } else if (i === 1 && eased < 1) {
          a = across(GENESIS.title[0], GENESIS.title[1], eased);
          b = 0;
        }
      }
      place(s, a, b, 0);
    });
    caption(eased);
    cue(eased);
  }

  // The scroll cue has done its job once the camera moves, and leaves before the hero does
  function cue(u: number) {
    if (scrollCue) scrollCue.style.opacity = (1 - smooth(0, GENESIS.hero[0] + 0.04, u)).toFixed(3);
  }

  // The caption names where the camera is heading
  function caption(u: number) {
    if (!viewCaption) return;
    const near = stops[Math.min(lastStop, Math.round(u))];
    const stage = Math.round(u) - lastStop - 1;
    // Between the hero and the first title lies the beginning (sky/journey.ts::GENESIS)
    const key =
      landing() > 0.35
        ? 'home'
        : stage >= 0
          ? HOME_STAGES[Math.min(stage, HOME_STAGES.length - 1)]
          : u > GENESIS.caption[0] && u < GENESIS.caption[2]
            ? u < GENESIS.caption[1] ? 'genesis' : 'dawn'
            : near.kind === 'hero'
              ? ''
              : near.section;
    // Over Amman the caption is a clock, so it is rewritten whenever its text changes, not only
    // when the place does
    if (key !== captionKey || key === 'home') {
      captionKey = key;
      const text =
        key === 'home'
          ? ammanNow(lang)
          : key === 'earth'
            ? EARTH_CAPTIONS[lang][mainLook(daylight(now()))]
            : ((CAPTIONS[lang] as Record<string, string>)[key] ?? '');
      if (text !== captionName.textContent) captionName.textContent = text;
      viewCaption.hidden = !text;
    }
    // The distance from Earth counts down between places, slowest at each stop
    const ly = key === 'home' || key === 'genesis' || key === 'dawn' ? 0 : distanceAt(u);
    // Over Amman the second line is its weather for this half of the day
    const weather = key === 'home' ? latestWeather() : null;
    const distance =
      key === 'genesis'
        ? lang === 'ar' ? 'قبل 13.8 مليار سنة' : '13.8 billion years ago'
        : key === 'dawn'
          ? lang === 'ar' ? 'قبل 13.7 مليار سنة' : '13.7 billion years ago'
          : weather
            ? weatherLine(weather, lang)
            : ly > 0
              ? formatDistance(ly, lang)
              : '';
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
    const t = ease(u - s0);
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
    /** Route positions at both ends. */
    u0: number;
    u1: number;
    start: number;
    ms: number;
    /**
     * A paced flight (through the beginning or the homecoming): scroll positions sampled along the
     * way, with the share of the flight's time spent reaching each (0..1). Absent for a flight
     * across open space, which moves evenly.
     */
    pace?: { ys: Float64Array; at: Float64Array };
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
      // A paced flight zooms home evenly
      home: (flight?.pace ? eased : along(eased)) - lastStop,
      end: landing(),
      horizonY: Number.isFinite(horizonFromContact) ? top + horizonFromContact : NaN,
      textY: Number.isFinite(textFromContact) ? top + textFromContact : NaN,
    });
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 1 / 60);
    lastTime = now;
    if (flight) {
      // The page scrolls along with the jump, so the header, the address and the landing at the
      // end all stay true to where the camera is
      const t = clamp((now - flight.start) / flight.ms);
      const k = flight.pace ? cruise(t) : glide(t);
      const y = flight.pace ? pacedY(flight.pace, k) : flight.y0 + (flight.y1 - flight.y0) * k;
      scrollTo({ top: y, behavior: 'instant' });
      eased = target = routeAt(y);
      const z = flight.pace ? flightZ(eased) : flight.z0 + (flight.z1 - flight.z0) * k;
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
    eased = throughBang(before, eased, dt);
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
  /**
   * Scrolling through the beginning plays it no faster than a menu jump does (paceAt): a flick
   * used to cross the hero's departure, the swelling light and the whole blast in a tenth of a
   * second, too fast for the flash to even brighten. Over the first leg (to BLAST_OUT's end) each
   * step is held to that pace, and the camera catches up with the scroll once the beginning has
   * played out. Back toward the hero it goes REWIND times faster, except through the blast, which
   * implodes at its own pace. Beyond it, and across open space, scrolling is unchanged.
   */
  function throughBang(from: number, to: number, dt: number) {
    const top = BLAST_OUT[1];
    if (Math.min(from, to) >= top) return to;
    const start = Math.min(from, top);
    const end = GENESIS.bang + GENESIS.blast;
    const inBlast = smooth(GENESIS.bang - 0.03, GENESIS.bang + 0.01, start) * (1 - smooth(end - 0.01, end + 0.03, start));
    const most = ((dt * 1000) / paceAt(start)) * (to < from ? REWIND - (REWIND - 1) * inBlast : 1);
    return to > from ? Math.min(to, start + most) : Math.max(to, start - most);
  }

  /** How far the landing in Amman has come at a scroll position (as `landing`, for any y). */
  const landingAt = (y: number) => clamp(1 - (contactTop - y) / vh);

  /**
   * The camera for a paced flight: as cameraZ, but without slowing near each stop, so the flight
   * passes stops and the homecoming's stages at its own pace. The two agree at every stop.
   */
  const flightZ = (u: number) => STRIDE * F * (Math.min(u, lastStop + 1) + 0.15 * Math.max(0, u - lastStop - 1));

  /** A paced flight's milliseconds per unit of route at a position, changing gradually (PACED). */
  // The camera changes speed as under a steady push: its speed squared changes evenly with the
  // distance covered (smoothly started and stopped), so it neither lingers nor lurches. Blending
  // the pace itself held the camera slow and then threw it forward, because a faster camera
  // covers more route a second and the change compounds. Out of the Big Bang it quickens to the
  // gas's pace as the flash fades, and from the end of the gas to open space (BLAST_OUT)
  const paceAt = (u: number) => {
    const sq = (ms: number) => 1 / (ms * ms);
    const blend = (a: number, b: number, k: number) => 1 / Math.sqrt(sq(a) + (sq(b) - sq(a)) * k);
    const end = GENESIS.bang + GENESIS.blast;
    // The hero leaving at STILL_MS, then the beginning's own pace as the light swells and bursts
    if (u < 0.104) return blend(PACED.STILL_MS, PACED.GENESIS_MS, smooth(0.041, 0.104, u));
    if (u < GENESIS.dust[1]) return blend(PACED.GENESIS_MS, PACED.DUST_MS, smooth(end - 0.02, end + 0.06, u));
    if (u < lastStop - 0.3) return blend(PACED.DUST_MS, PACED.OPEN_MS, smooth(BLAST_OUT[0], BLAST_OUT[1], u));
    return blend(PACED.OPEN_MS, PACED.HOME_MS, smooth(lastStop - 0.3, lastStop + 0.5, u));
  };


  /**
   * Plan a paced flight between two scroll positions: sample the way, give each step its time
   * (PACED: slow through the beginning and the homecoming, fast across open space), and keep the
   * running share of the total, so the flight can find where to be at any moment.
   */
  function planPace(y0: number, y1: number) {
    const N = 600;
    const ys = new Float64Array(N + 1);
    const at = new Float64Array(N + 1);
    let total = 0;
    let u = routeAt(y0);
    let land = landingAt(y0);
    ys[0] = y0;
    for (let k = 1; k <= N; k++) {
      const y = y0 + ((y1 - y0) * k) / N;
      const u2 = routeAt(y);
      const land2 = landingAt(y);
      const perU = paceAt((u + u2) / 2);
      // A little time for every step, so the scroll past the end of the landing still moves
      total += Math.abs(u2 - u) * perU + Math.abs(land2 - land) * PACED.LAND_MS + (Math.abs(y1 - y0) / N / vh) * 120;
      ys[k] = y;
      at[k] = total;
      u = u2;
      land = land2;
    }
    for (let k = 1; k <= N; k++) at[k] /= total || 1;
    return { pace: { ys, at }, ms: Math.min(PACED.MAX_MS, PACED.BASE_MS + total) };
  }

  /** Where a paced flight is after `share` (0..1) of its time. */
  function pacedY(pace: NonNullable<Flight['pace']>, share: number) {
    const { ys, at } = pace;
    let lo = 0;
    let hi = at.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (at[mid] < share) lo = mid;
      else hi = mid;
    }
    const span = at[hi] - at[lo];
    return ys[lo] + (ys[hi] - ys[lo]) * (span > 0 ? (share - at[lo]) / span : 0);
  }

  function flyTo(y: number) {
    const u1 = routeAt(y);
    const distance = Math.abs(u1 - eased);
    // A short hop between neighbouring stops scrolls there. Anything that starts or ends in the
    // beginning (the hero's leg) or the homecoming (past the last stop) always flies, however
    // short, and slows down through them: scrolled through, they replayed the Big Bang or the
    // dive home at speed
    const open = Math.min(u1, eased) >= 1 && Math.max(u1, eased) <= lastStop && landingAt(Math.max(scrollY, y)) === 0;
    if (distance <= 1.25 && open) {
      scrollTo({ top: y, behavior: 'smooth' });
      return;
    }
    const paced = open ? null : planPace(scrollY, y);
    flight = {
      y0: scrollY,
      y1: y,
      z0: cameraZ(eased),
      z1: cameraZ(u1),
      p0: panelZ(eased),
      p1: panelZ(u1),
      from: Math.round(eased),
      to: Number.isInteger(u1) ? u1 : -1,
      u0: eased,
      u1,
      start: performance.now(),
      // Across open space, longer jumps take a little longer, never more than two and a half
      // seconds; a paced flight takes the time its set pieces need (planPace)
      ms: paced ? paced.ms : 1000 * clamp(0.8 + 0.17 * distance, 1.1, 2.4),
      pace: paced?.pace,
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
    if (i >= 0 && Math.abs(along(eased, TEXT_EVEN) - i) > SETTLED) flyTo(stops[i].y);
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
