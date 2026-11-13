/**
 * Rules for the "Honeycomb spell" game: the letters of a Maltese word are hidden in a comb of
 * nineteen cells, each next to the one before, and the player traces the word from cell to cell.
 * Pure functions on plain data, so the rules can be tested without a screen.
 */
import { shuffle, type Rng } from './games';
import { ALPHABET, LOOKALIKES, toKeys } from './letters';
import type { Word } from './words';

/** The comb reaches this many cells out from its centre: 19 cells in rows of 3, 4, 5, 4, 3. */
export const RADIUS = 2;
/** Words with this many letters (keys; "għ" is one) and no more than `MAX_KEYS` can be asked. */
export const MIN_KEYS = 3;
export const MAX_KEYS = 9;
/** A topic with fewer usable words than this is played with the whole deck. */
export const MIN_POOL = 12;
/** Failed traces before the word is shown. */
export const TRIES = 3;
/** From the hard level on, this many other cells hold copies of the first letter. */
export const FALSE_STARTS = 2;
/** The run of words spelled at which look-alike letters fill the comb, and at which the first cell is no longer marked. */
export const LEVELS = { lookalikes: 3, hard: 6 };
/** A failed trace flashes this long before it clears. */
export const FLASH_MS = 600;
/** A word spelled stays this long before the next comb. */
export const SPELLED_MS = 700;
/** A word shown stays until a tap, or this long. */
export const SHOWN_MS = 2400;

/** A cell in axial coordinates. */
export interface Hex {
  q: number;
  r: number;
}

/** The nineteen cells in reading order, top row first, left to right; a cell is known by its index. */
export const COMB: Hex[] = (() => {
  const cells: Hex[] = [];
  for (let r = -RADIUS; r <= RADIUS; r++) {
    for (let q = -RADIUS; q <= RADIUS; q++) {
      if (Math.abs(q + r) <= RADIUS) cells.push({ q, r });
    }
  }
  return cells;
})();

const STEPS: Hex[] = [
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 },
];

/** Whether two cells, by index, share a side. */
export function areNeighbours(a: number, b: number): boolean {
  const ha = COMB[a];
  const hb = COMB[b];
  if (!ha || !hb) return false;
  return STEPS.some((s) => ha.q + s.q === hb.q && ha.r + s.r === hb.r);
}

const NEIGHBOURS: number[][] = COMB.map((_, i) => COMB.flatMap((_, j) => (areNeighbours(i, j) ? [j] : [])));

/** The cells that share a side with cell `i`, in index order. */
export function neighbours(i: number): number[] {
  return NEIGHBOURS[i] ?? [];
}

/** The centre of cell `i` in px, relative to the comb's centre, for pointy-top cells of radius `size`. */
export function hexCentre(i: number, size: number): { x: number; y: number } {
  const { q, r } = COMB[i];
  return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
}

/** A point counts as on a cell when it is this close to its centre, as a share of the cell's radius. */
const HIT = 0.75;

/**
 * The cell under a point (relative to the comb's centre), or null. Only the middle of a cell
 * counts, so a finger cutting the corner between two cells does not pick up a third.
 */
export function cellAt(x: number, y: number, size: number): number | null {
  for (let i = 0; i < COMB.length; i++) {
    const c = hexCentre(i, size);
    if (Math.hypot(x - c.x, y - c.y) <= HIT * size) return i;
  }
  return null;
}

/** A random walk of `length` different cells, each a neighbour of the one before, starting anywhere. */
export function layPath(length: number, rng: Rng = Math.random): number[] {
  const n = Math.max(0, Math.min(length, COMB.length));
  const path: number[] = [];
  const used = new Set<number>();
  const walk = (cell: number): boolean => {
    path.push(cell);
    used.add(cell);
    if (path.length === n) return true;
    for (const next of shuffle(neighbours(cell), rng)) {
      if (!used.has(next) && walk(next)) return true;
    }
    // A dead end: back out and try another way.
    path.pop();
    used.delete(cell);
    return false;
  };
  if (n === 0) return [];
  for (const start of shuffle(
    COMB.map((_, i) => i),
    rng,
  )) {
    if (walk(start)) return path;
  }
  return path;
}

export interface Comb {
  /** The letter in each cell, by index. */
  letters: string[];
  /** The cells the word was laid on, in order. */
  path: number[];
  /** Whether the first cell is marked. */
  marked: boolean;
}

/**
 * A comb for `word`: its letters along a random path, and in the other cells letters it does not
 * have; from `LEVELS.lookalikes` the look-alikes of its letters come first; from `LEVELS.hard`
 * the first cell is not marked and `FALSE_STARTS` other cells, away from it, hold its first letter.
 */
export function makeComb(word: Word, run: number, rng: Rng = Math.random): Comb {
  const keys = toKeys(word.mt);
  const path = layPath(keys.length, rng);
  const letters: string[] = new Array(COMB.length).fill('');
  path.forEach((cell, k) => (letters[cell] = keys[k]));

  const own = new Set(keys);
  const random = shuffle(
    ALPHABET.filter((k) => !own.has(k)),
    rng,
  );
  const alike =
    run >= LEVELS.lookalikes
      ? shuffle(
          LOOKALIKES.filter((group) => group.some((k) => own.has(k)))
            .flat()
            .filter((k) => !own.has(k)),
          rng,
        )
      : [];
  const fill = [...new Set([...alike, ...random])];

  let free = shuffle(
    COMB.map((_, i) => i).filter((i) => !path.includes(i)),
    rng,
  );
  const hard = run >= LEVELS.hard;
  if (hard && path.length > 0) {
    const start = path[0];
    const away = free.filter((i) => !areNeighbours(i, start)).slice(0, FALSE_STARTS);
    for (const i of away) letters[i] = keys[0];
    free = free.filter((i) => !away.includes(i));
  }
  free.forEach((cell, k) => (letters[cell] = fill[k % fill.length]));
  return { letters, path, marked: !hard };
}

/**
 * The trace after a press on `cell`. An empty trace starts there; a free neighbour of the last
 * cell is added; the cell before the last takes the last off, as does a tap on the last cell.
 * Any other cell does nothing while dragging, and on a tap starts the trace again from there.
 */
export function trace(path: readonly number[], cell: number, how: 'drag' | 'tap'): number[] {
  if (path.length === 0) return [cell];
  const last = path[path.length - 1];
  if (path.length > 1 && cell === path[path.length - 2]) return path.slice(0, -1);
  if (cell === last) return how === 'tap' ? path.slice(0, -1) : [...path];
  if (areNeighbours(last, cell) && !path.includes(cell)) return [...path, cell];
  return how === 'tap' ? [cell] : [...path];
}

/** `right` when the traced letters spell the word, whichever cells they are; `wrong` at full length otherwise; else `open`. */
export function judge(comb: Comb, path: readonly number[], word: Word): 'open' | 'right' | 'wrong' {
  const keys = toKeys(word.mt);
  if (path.length < keys.length) return 'open';
  const traced = path.map((i) => comb.letters[i]);
  return traced.length === keys.length && traced.every((k, i) => k === keys[i]) ? 'right' : 'wrong';
}

/** A key that is a letter: no space, hyphen or apostrophe. */
const LETTER = /^\p{L}+$/u;

/** Words that fit a comb: letters only, `MIN_KEYS` to `MAX_KEYS` of them. */
export function spellWords(words: readonly Word[]): Word[] {
  return words.filter((w) => {
    const keys = toKeys(w.mt);
    return keys.length >= MIN_KEYS && keys.length <= MAX_KEYS && keys.every((k) => LETTER.test(k));
  });
}

/** The words of the topic that fit; the whole deck's when the topic has too few. */
export function spellPool(inTopic: readonly Word[], all: readonly Word[]): Word[] {
  const pool = spellWords(inTopic);
  return pool.length >= MIN_POOL ? pool : spellWords(all);
}
