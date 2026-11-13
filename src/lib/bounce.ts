/**
 * Physics and rules for the "Bouncy bee" game: a bee flies between two walls, and the wall
 * it is heading for has a door per answer. The right door leads on into the next room;
 * a wrong door or the solid wall sends it back.
 * Pure functions on plain data, so the rules can be tested without a screen.
 */
import type { Direction } from './srs';
import type { ShowLang } from './store';
import type { Word } from './words';

export type Rng = () => number;

export interface Arena {
  width: number;
  height: number;
}

export interface Door {
  top: number;
  bottom: number;
  /** Which answer option this door stands for. */
  option: number;
  correct: boolean;
}

export interface Bee {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 1 = flying right, -1 = flying left. */
  dir: 1 | -1;
  /** Doors on the wall the bee is flying towards. */
  doors: Door[];
}

/** What happened when the bee reached a wall. */
export type WallEvent = 'correct' | 'wrong' | 'bump';

/** A wall reached: what happened, and the door flown through (none for a bump). */
export interface WallHit {
  event: WallEvent;
  door?: Door;
}

export const BEE_RADIUS = 15;
export const WALL = 12;
const GRAVITY = 1500;
const FLAP = 430;
/** Holding on: after the first flap the bee keeps climbing, gaining speed up to a steady rise. */
const HOLD_LIFT = 1400;
const HOLD_RISE = 280;
/** A press counts as holding only after this long, so a quick tap is still just a flap. */
export const HOLD_DELAY_MS = 150;
/** The floor is soft: the bee hops back up instead of crashing. */
const FLOOR_HOP = 330;
const DOOR_PAD = 14;
const DOOR_GAP = 28;
/** No door is ever shorter than this, however hard the game gets. */
export const MIN_DOOR = 72;
/** A third door is added only if each of the three bands has room for a door this tall. */
const MIN_THIRD_DOOR = 84;

/** Bumps into the solid wall forgiven per question; the next one counts as a wrong answer. */
export const MAX_BUMPS = 1;

/** What a bump into the solid wall counts as, given how many this question has had already. */
export function bumpCounts(bumpsSoFar: number): 'bump' | 'wrong' {
  return bumpsSoFar < MAX_BUMPS ? 'bump' : 'wrong';
}

/**
 * Horizontal speed as a fraction of the arena width per second. It starts at about
 * three seconds per crossing and never drops below two, so the labels stay readable.
 */
export const SPEED = { start: 0.3, min: 0.25, max: 0.48, faster: 0.012, slower: 0.04 };

export function nextSpeed(speed: number, event: WallEvent): number {
  if (event === 'correct') return Math.min(SPEED.max, speed + SPEED.faster);
  if (event === 'wrong') return Math.max(SPEED.min, speed - SPEED.slower);
  return speed;
}

/**
 * The game tightens as the run of right answers grows: from `lookalikes` on, the wrong answers
 * look like the right one; from `narrow`, the doors shrink to `narrowScale`; from `threeDoors`,
 * a third door is added, or, where three would not fit, two doors shrink to `crampedScale`.
 */
export const DIFFICULTY = { lookalikes: 3, narrow: 6, threeDoors: 9, narrowScale: 0.85, crampedScale: 0.7 };

export interface Difficulty {
  doors: 2 | 3;
  /** Door size, as a share of the full size. */
  scale: number;
  /** Wrong answers chosen for looking like the right one. */
  lookalikes: boolean;
}

/** How hard the next question is, after `run` right answers in a row. A miss starts again from 0. */
export function difficulty(run: number, arena: Arena, headroom = 0): Difficulty {
  const lookalikes = run >= DIFFICULTY.lookalikes;
  if (run < DIFFICULTY.narrow) return { doors: 2, scale: 1, lookalikes };
  if (run < DIFFICULTY.threeDoors) return { doors: 2, scale: DIFFICULTY.narrowScale, lookalikes };
  if (doorRoom(arena, headroom, 3) >= MIN_THIRD_DOOR) return { doors: 3, scale: DIFFICULTY.narrowScale, lookalikes };
  return { doors: 2, scale: DIFFICULTY.crampedScale, lookalikes };
}

/** Margins of door `i` of `count`: the top and bottom doors keep clear of the ceiling and floor, the others of each other. */
const above = (i: number) => (i === 0 ? DOOR_PAD : DOOR_GAP / 2);
const below = (i: number, count: number) => (i === count - 1 ? DOOR_PAD : DOOR_GAP / 2);

/** The tallest door that fits in every band when the space below `headroom` is split into `count`. */
function doorRoom(arena: Arena, headroom: number, count: number): number {
  const band = (arena.height - headroom) / count;
  return Math.min(...Array.from({ length: count }, (_, i) => band - above(i) - below(i, count)));
}

/**
 * The space below `headroom` is split into `count` equal bands, with one door at a random height
 * in each; with two doors, one in the upper half and one in the lower half. `headroom` keeps a
 * strip at the top free of doors, for the word being asked. `scale` shrinks the doors, but never
 * below `MIN_DOOR`.
 */
export function placeDoors(
  arena: Arena,
  correctOption: number,
  rng: Rng = Math.random,
  headroom = 0,
  count = 2,
  scale = 1,
): Door[] {
  const band = (arena.height - headroom) / count;
  const room = doorRoom(arena, headroom, count);
  const size = Math.min(room, Math.max(MIN_DOOR, Math.max(96, Math.min(150, arena.height * 0.26)) * scale));
  const slack = room - size;
  return Array.from({ length: count }, (_, option) => {
    const top = headroom + option * band + above(option) + rng() * slack;
    return { top, bottom: top + size, option, correct: correctOption === option };
  });
}

export function newBee(arena: Arena, doors: Door[]): Bee {
  return { x: arena.width * 0.3, y: arena.height * 0.45, vx: 0, vy: 0, dir: 1, doors };
}

export function flap(bee: Bee): void {
  bee.vy = -FLAP;
}

/** Sends the bee back the other way, with new doors on the wall it now faces. */
export function turn(bee: Bee, arena: Arena, speed: number, doors: Door[]): void {
  bee.dir = bee.dir === 1 ? -1 : 1;
  bee.vx = bee.dir * speed * arena.width;
  bee.doors = doors;
}

/**
 * Carries the bee through the door it just flew through into the next room, which shares that
 * wall: the bee keeps its height and direction, sits in the doorway of the wall behind it, and
 * flies on to the far wall, which has `doors` for the next question. A full crossing, as before.
 */
export function enterRoom(bee: Bee, arena: Arena, speed: number, doors: Door[]): void {
  bee.x -= bee.dir * (arena.width - WALL);
  bee.vx = bee.dir * speed * arena.width;
  bee.doors = doors;
}

/**
 * Advances the bee by `dt` seconds; `lifting` while the player holds on. Returns what happened,
 * and through which door, when the bee reaches the wall it was heading for.
 */
export function step(bee: Bee, dt: number, arena: Arena, lifting = false): WallHit | null {
  if (lifting) bee.vy = Math.max(-HOLD_RISE, bee.vy - HOLD_LIFT * dt);
  else bee.vy += GRAVITY * dt;
  bee.y += bee.vy * dt;
  bee.x += bee.vx * dt;

  if (bee.y < BEE_RADIUS) {
    bee.y = BEE_RADIUS;
    bee.vy = Math.abs(bee.vy) * 0.25;
  }
  if (bee.y > arena.height - BEE_RADIUS) {
    bee.y = arena.height - BEE_RADIUS;
    bee.vy = -FLOOR_HOP;
  }

  const limit = bee.dir === 1 ? arena.width - WALL - BEE_RADIUS : WALL + BEE_RADIUS;
  const reached = bee.dir === 1 ? bee.x >= limit : bee.x <= limit;
  if (!reached || bee.vx === 0) return null;

  bee.x = limit;
  const door = bee.doors.find((d) => bee.y >= d.top && bee.y <= d.bottom);
  if (!door) return { event: 'bump' };
  return { event: door.correct ? 'correct' : 'wrong', door };
}

/* ---------- Pollen ---------- */

/**
 * Now and then a grain or two of pollen hangs in the air on the way across, to pick up by flying
 * through it. Per crossing: a chance of one grain and a chance of two, none in the first `after`
 * crossings of a round. Grains sit between `from` and `to` of the way from the wall being left,
 * clear of the door labels ahead, and between the prompt strip and `floor` px above the floor.
 * A grain is taken when the bee's centre comes within its radius plus `reach`.
 * Setting both chances to 0 switches pollen off.
 */
export const POLLEN = { one: 0.5, two: 0.15, after: 3, from: 0.22, to: 0.48, floor: 40, reach: 8 };

export interface Grain {
  x: number;
  y: number;
}

/**
 * The grains for crossing number `crossing` of the round (from 0), flying in direction `dir`.
 * The doors play no part, so where the pollen is never hints at the answer.
 */
export function placePollen(arena: Arena, dir: 1 | -1, headroom: number, crossing: number, rng: Rng = Math.random): Grain[] {
  if (crossing < POLLEN.after) return [];
  const roll = rng();
  const count = roll < POLLEN.two ? 2 : roll < POLLEN.two + POLLEN.one ? 1 : 0;
  const across = arena.width - 2 * WALL;
  const low = arena.height - POLLEN.floor;
  return Array.from({ length: count }, () => {
    const along = (POLLEN.from + rng() * (POLLEN.to - POLLEN.from)) * across;
    return { x: dir === 1 ? WALL + along : arena.width - WALL - along, y: headroom + rng() * (low - headroom) };
  });
}

/** Splits the grains into those the bee is touching now and those still left. */
export function collectPollen(bee: Bee, grains: Grain[]): { left: Grain[]; taken: Grain[] } {
  const near = (g: Grain) => Math.hypot(g.x - bee.x, g.y - bee.y) <= BEE_RADIUS + POLLEN.reach;
  return { left: grains.filter((g) => !near(g)), taken: grains.filter(near) };
}

/* ---------- Which words fit on a door ---------- */

const MAX_LABEL = 18;
/** The word being asked may be longer: it has the full width of the field. */
const MAX_PROMPT = 28;

/** The lines written next to a door for this word. */
export function doorLabel(word: Word, dir: Direction, show: ShowLang): string[] {
  if (dir === 'x2mt') return [word.mt];
  return [...(show !== 'en' ? [word.pl] : []), ...(show !== 'pl' ? [word.en] : [])];
}

/** The lines shown at the top of the field for this word: the other side of `doorLabel`. */
export function promptLabel(word: Word, dir: Direction, show: ShowLang): string[] {
  return doorLabel(word, dir === 'x2mt' ? 'mt2x' : 'x2mt', show);
}

/** Words short enough to read at a glance while flying, both as a question and as a door label. */
export function beeWords(words: readonly Word[], dir: Direction, show: ShowLang): Word[] {
  return words.filter(
    (w) =>
      doorLabel(w, dir, show).every((line) => line.length <= MAX_LABEL) &&
      promptLabel(w, dir, show).every((line) => line.length <= MAX_PROMPT),
  );
}
