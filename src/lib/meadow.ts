/**
 * Rules for "Watch the flowers": not a game but a meadow to look at. Bees wander about a few
 * flowers, and now and then one brings a word to a flower, which opens to show what it means.
 * Pure functions on plain data, so the meadow can be tested without a screen. Functions that move
 * bees change the array they are given, as the screen's loop keeps one list.
 */
import { shuffle, type Rng } from './games';
import { addDays, cardKey, type CardState, type Direction } from './srs';
import { newSwarm, stepSwarm, SWARM, type SwarmBee } from './swarm';
import type { Word } from './words';

/** How often a word is drawn, by how it stands in the review schedule. */
export const WEIGHT = { shaky: 6, soon: 4, fresh: 2, known: 1 };
/** A card in this box or lower is shaky. */
export const SHAKY_BOX = 2;
/** A card due within this many days, or overdue, is coming back soon. */
export const SOON_DAYS = 3;
/** Of the words never studied, only this many, the next in deck order, are shown. */
export const FRESH_AHEAD = 20;
/** A word is not drawn again until this many others have been (fewer in a small pool). */
export const NO_REPEAT = 12;
/** The gap between words, by the pace chosen. */
export const PACE = { seldom: 25_000, normal: 10_000, often: 3000 };
/** The first word comes this soon after the screen opens. */
export const FIRST_MS = 2000;
/** A word is carried to its flower in this long… */
export const CARRY_MS = 4000;
/** …and shown there with its meaning this long. */
export const SHOW_MS = 5000;
/** Flowers stand no closer than this. */
export const MIN_GAP = 90;
/** Flowers' heads stand between these shares of the way down the field. */
export const HEAD_BAND = { top: 0.45, bottom: 0.7 };
/** The strip of ground at the bottom of the field, where the stems stand. */
export const GROUND_PX = 18;
/** One wandering bee per this many square px… */
export const AREA_PER_BEE = 45_000;
/** …but never fewer or more than these. */
export const BEES = { min: 4, max: 10 };
/** Wandering bees are this small to this big, smaller ones fainter. */
export const BEE_R = { min: 7, max: 11 };
/** Across the meadow, a wandering bee goes to a flower about this often… */
export const VISIT_EVERY_MS = 9000;
/** …and feeds there this long. */
export const FEED_MS = 2500;

export type Pace = keyof typeof PACE;
export const PACES: Pace[] = ['seldom', 'normal', 'often'];

/** The words to show, each with how often to draw it; words never studied beyond the next twenty are left out. */
export function meadowWeights(
  words: readonly Word[],
  cards: Readonly<Record<string, CardState>>,
  dir: Direction,
  today: string,
): { word: Word; weight: number }[] {
  const soon = addDays(today, SOON_DAYS);
  let fresh = 0;
  const out: { word: Word; weight: number }[] = [];
  for (const word of words) {
    const card = cards[cardKey(dir, word.id)];
    let weight = 0;
    if (card) weight = card.box <= SHAKY_BOX ? WEIGHT.shaky : card.due <= soon ? WEIGHT.soon : WEIGHT.known;
    else if (fresh < FRESH_AHEAD) {
      fresh += 1;
      weight = WEIGHT.fresh;
    }
    if (weight > 0) out.push({ word, weight });
  }
  return out;
}

/** A word drawn by weight, never one of the last `NO_REPEAT` drawn (the pool's size less one in a small pool). */
export function pickWord(weighted: readonly { word: Word; weight: number }[], recent: readonly string[], rng: Rng = Math.random): Word {
  const n = Math.max(0, Math.min(NO_REPEAT, weighted.length - 1));
  const block = new Set(n > 0 ? recent.slice(-n) : []);
  const open = weighted.filter((w) => !block.has(w.word.id));
  const pool = open.length > 0 ? open : weighted;
  let roll = rng() * pool.reduce((sum, w) => sum + w.weight, 0);
  for (const w of pool) {
    roll -= w.weight;
    if (roll < 0) return w.word;
  }
  return pool[pool.length - 1].word;
}

/** Where a word is in its cycle: none (`gap`), being carried in, or shown on its flower. */
export interface Cycle {
  phase: 'gap' | 'carry' | 'shown';
  leftMs: number;
  /** Shown and held open by a tap: it does not run down. */
  held: boolean;
  /** Its meaning shown early, by a tap on the bee carrying it. */
  early: boolean;
}

export function newCycle(): Cycle {
  return { phase: 'gap', leftMs: FIRST_MS, held: false, early: false };
}

/** Runs the cycle on by `dtMs`; `entered` is the phase just begun, once, when it changes. */
export function stepCycle(cycle: Cycle, dtMs: number, pace: Pace): { cycle: Cycle; entered?: Cycle['phase'] } {
  if (cycle.phase === 'shown' && cycle.held) return { cycle };
  const leftMs = cycle.leftMs - dtMs;
  if (leftMs > 0) return { cycle: { ...cycle, leftMs } };
  if (cycle.phase === 'gap') return { cycle: { phase: 'carry', leftMs: CARRY_MS, held: false, early: false }, entered: 'carry' };
  if (cycle.phase === 'carry') return { cycle: { ...cycle, phase: 'shown', leftMs: SHOW_MS }, entered: 'shown' };
  return { cycle: { phase: 'gap', leftMs: PACE[pace], held: false, early: false }, entered: 'gap' };
}

/** A tap on the open flower: holds it open, or lets it go, when it then shows in full again. */
export function hold(cycle: Cycle): Cycle {
  if (cycle.phase !== 'shown') return cycle;
  return cycle.held ? { ...cycle, held: false, leftMs: SHOW_MS } : { ...cycle, held: true };
}

/** A tap on the bee carrying a word: its meaning shows at once. Only while it is carried. */
export function showEarly(cycle: Cycle): Cycle {
  return cycle.phase === 'carry' && !cycle.early ? { ...cycle, early: true } : cycle;
}

export interface Flower {
  x: number;
  /** The centre of its head… */
  headY: number;
  /** …and the foot of its stem. */
  baseY: number;
  /** The head's radius. */
  r: number;
}

/** How many flowers a field this wide holds. */
export function flowerCount(width: number): number {
  return width < 480 ? 3 : width <= 720 ? 4 : 5;
}

/** The flowers, spread evenly across the width with a little random shift, never closer than `MIN_GAP`. */
export function placeFlowers(width: number, height: number, rng: Rng = Math.random): Flower[] {
  const n = flowerCount(width);
  const slot = width / n;
  // Each may move this far either way and still keep `MIN_GAP` from its neighbours.
  const shift = Math.max(0, Math.min(slot * 0.15, (slot - MIN_GAP) / 2));
  const r = Math.max(12, Math.min(26, slot * 0.18));
  return Array.from({ length: n }, (_, i) => ({
    x: slot * (i + 0.5) + (rng() * 2 - 1) * shift,
    headY: height * (HEAD_BAND.top + rng() * (HEAD_BAND.bottom - HEAD_BAND.top)),
    baseY: height - GROUND_PX / 2,
    r,
  }));
}

/** Where a bee stands on a flower: on top of its head. */
export function landingPoint(flower: Flower): { x: number; y: number } {
  return { x: flower.x, y: flower.headY - flower.r * 0.9 };
}

/** Eases from 0 to 1, gently at both ends. */
const smooth = (t: number) => t * t * (3 - 2 * t);

/** The word-bee's place on its way in: `t` from 0 to 1, eased, along a curve rising above the straight line. */
export function carrierPos(from: { x: number; y: number }, to: { x: number; y: number }, t: number): { x: number; y: number } {
  const e = smooth(Math.max(0, Math.min(1, t)));
  const lift = 40 + Math.hypot(to.x - from.x, to.y - from.y) * 0.2;
  const c = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift };
  const a = (1 - e) * (1 - e);
  const b = 2 * (1 - e) * e;
  const d = e * e;
  return { x: a * from.x + b * c.x + d * to.x, y: a * from.y + b * c.y + d * to.y };
}

export interface MeadowBee extends SwarmBee {
  state: 'wander' | 'toFlower' | 'feeding';
  flower: number | null;
  /** Wandering: until it turns to a flower. Feeding: until it flies on. */
  leftMs: number;
}

/** A wandering bee's wait before it turns to a flower, so that across `count` bees one goes about every `VISIT_EVERY_MS`. */
function visitIn(count: number, rng: Rng): number {
  return VISIT_EVERY_MS * count * (0.5 + rng());
}

export function meadowSize(width: number, height: number): number {
  return Math.round(Math.min(BEES.max, Math.max(BEES.min, (width * height) / AREA_PER_BEE)));
}

/** The wandering bees for a field this size. */
export function newMeadow(width: number, height: number, rng: Rng = Math.random): MeadowBee[] {
  const count = meadowSize(width, height);
  return newSwarm(count, width, height * 0.8, rng).map((b) => ({
    ...b,
    r: BEE_R.min + ((b.r - SWARM.minR) / (SWARM.maxR - SWARM.minR)) * (BEE_R.max - BEE_R.min),
    state: 'wander' as const,
    flower: null,
    leftMs: visitIn(count, rng),
  }));
}

/**
 * Moves the bees on by `dtMs`. Wandering bees fly as the background bees do; now and then one
 * turns to a flower no bee is on and that is not `taken` (the word-bee's), lands, feeds for
 * `FEED_MS` and wanders on. A bee on or heading for the flower that becomes `taken` leaves it.
 */
export function stepMeadow(
  bees: MeadowBee[],
  flowers: readonly Flower[],
  taken: number | null,
  dtMs: number,
  width: number,
  height: number,
  rng: Rng = Math.random,
): void {
  const busy = (i: number, self: MeadowBee) => i === taken || bees.some((b) => b !== self && b.flower === i);
  const wander = (b: MeadowBee) => {
    b.state = 'wander';
    b.flower = null;
    b.heading = -Math.PI / 2 + (rng() * 2 - 1) * 1.2;
    b.leftMs = visitIn(bees.length, rng);
  };
  for (const b of bees) {
    if (b.flower !== null && (b.flower === taken || b.flower >= flowers.length)) wander(b);
    if (b.state === 'wander') {
      b.leftMs -= dtMs;
      if (b.leftMs <= 0) {
        const free = shuffle(
          flowers.map((_, i) => i).filter((i) => !busy(i, b)),
          rng,
        );
        if (free.length > 0) {
          b.state = 'toFlower';
          b.flower = free[0];
        } else b.leftMs = visitIn(bees.length, rng);
      }
    }
    if (b.state === 'toFlower' && b.flower !== null) {
      const to = landingPoint(flowers[b.flower]);
      const dx = to.x - b.x;
      const dy = to.y - b.y;
      const dist = Math.hypot(dx, dy);
      const stepPx = (b.speed * dtMs) / 1000;
      b.heading = Math.atan2(dy, dx);
      if (dist <= stepPx) {
        b.x = to.x;
        b.y = to.y;
        b.state = 'feeding';
        b.leftMs = FEED_MS;
      } else {
        b.x += (dx / dist) * stepPx;
        b.y += (dy / dist) * stepPx;
      }
    } else if (b.state === 'feeding') {
      b.leftMs -= dtMs;
      if (b.leftMs <= 0) wander(b);
    }
  }
  stepSwarm(
    bees.filter((b) => b.state === 'wander'),
    dtMs,
    width,
    height,
    rng,
  );
}
