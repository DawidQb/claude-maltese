/**
 * Physics and rules for the "Busy bee" game: a bee bounces between two walls,
 * and the wall it is heading for has two doors, one per answer.
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

export const BEE_RADIUS = 15;
export const WALL = 12;
const GRAVITY = 1500;
const FLAP = 430;
/** The floor is soft: the bee hops back up instead of crashing. */
const FLOOR_HOP = 330;
const DOOR_PAD = 14;
const DOOR_GAP = 28;

/**
 * Horizontal speed as a fraction of the arena width per second. It starts at about
 * three seconds per crossing and never drops below two, so the labels stay readable.
 */
export const SPEED = { start: 0.3, min: 0.25, max: 0.48, faster: 0.006, slower: 0.04 };

export function nextSpeed(speed: number, event: WallEvent): number {
  if (event === 'correct') return Math.min(SPEED.max, speed + SPEED.faster);
  if (event === 'wrong') return Math.max(SPEED.min, speed - SPEED.slower);
  return speed;
}

/**
 * One door in the upper half and one in the lower half, at random heights.
 * `headroom` keeps a strip at the top free of doors, for the word being asked.
 */
export function placeDoors(arena: Arena, correctOption: number, rng: Rng = Math.random, headroom = 0): Door[] {
  const half = (arena.height - headroom) / 2;
  const room = half - DOOR_PAD - DOOR_GAP / 2;
  const size = Math.min(room, Math.max(96, Math.min(150, arena.height * 0.26)));
  const slack = room - size;
  const upperTop = headroom + DOOR_PAD + rng() * slack;
  const lowerTop = headroom + half + DOOR_GAP / 2 + rng() * slack;
  return [
    { top: upperTop, bottom: upperTop + size, option: 0, correct: correctOption === 0 },
    { top: lowerTop, bottom: lowerTop + size, option: 1, correct: correctOption === 1 },
  ];
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

/** Advances the bee by `dt` seconds. Returns an event when it reaches the wall it was heading for. */
export function step(bee: Bee, dt: number, arena: Arena): WallEvent | null {
  bee.vy += GRAVITY * dt;
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
  if (!door) return 'bump';
  return door.correct ? 'correct' : 'wrong';
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
