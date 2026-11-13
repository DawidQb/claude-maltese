/**
 * Rules for the "Spider web" game: guess the letters of a Maltese word before the spider comes
 * down its thread to the bee. Every wrong letter is one step of the spider. Pure functions on
 * plain data, so the rules can be tested without a screen.
 */
import { ALPHABET, toKeys } from './letters';
import type { Word } from './words';

/** Wrong letters before the spider reaches the bee, at the start of a run. */
export const STEPS = 6;
/** From this many bees freed in a row the spider needs five steps, from `four` four; never fewer. */
export const HARDER = { five: 4, four: 8 };
/** A word needs at least this many letters to guess… */
export const MIN_LETTERS = 3;
/** …and at most this many cells, the given ones included (two rows of nine on a phone). */
export const MAX_CELLS = 18;
/** A topic with fewer usable words than this is played with the whole deck. */
export const MIN_POOL = 12;
/** A word filled in stays this long before the next. */
export const FREED_MS = 800;
/** A word lost is shown until a tap, or this long. */
export const CAUGHT_MS = 2200;

/** Shown from the start and never guessed. */
const GIVEN = new Set(['-', "'", ' ']);

/** One cell of the word: what it shows once filled (capitals and `à`, `è` kept), and whether it is shown from the start. */
export interface Cell {
  key: string;
  given: boolean;
}

export interface Round {
  word: Word;
  cells: Cell[];
  /** Keys tapped so far, in order. */
  guessed: string[];
  misses: number;
  /** Misses that catch the bee. */
  steps: number;
}

/** The key of the pad that fills a cell: lower case, with `à` and `è` filled by `a` and `e`. */
function padKey(key: string): string {
  const k = key.toLowerCase();
  return k === 'à' ? 'a' : k === 'è' ? 'e' : k;
}

/** The cells of a word: one per key, the hyphen, apostrophe and space given. Dropped punctuation has none. */
export function webCells(mt: string): Cell[] {
  return toKeys(mt, true).map((key) => ({ key, given: GIVEN.has(key) }));
}

/** Words that fit: at most `MAX_CELLS` cells, at least `MIN_LETTERS` to guess, every one on the pad. */
export function webWords(words: readonly Word[]): Word[] {
  return words.filter((w) => {
    const cells = webCells(w.mt);
    const open = cells.filter((c) => !c.given);
    return cells.length <= MAX_CELLS && open.length >= MIN_LETTERS && open.every((c) => ALPHABET.includes(padKey(c.key)));
  });
}

/** The words of the topic that fit; the whole deck's when the topic has too few. */
export function webPool(inTopic: readonly Word[], all: readonly Word[]): Word[] {
  const pool = webWords(inTopic);
  return pool.length >= MIN_POOL ? pool : webWords(all);
}

/** Misses the spider needs with `run` bees freed in a row. */
export function stepsFor(run: number): number {
  return run >= HARDER.four ? 4 : run >= HARDER.five ? 5 : STEPS;
}

export function newRound(word: Word, run: number): Round {
  return { word, cells: webCells(word.mt), guessed: [], misses: 0, steps: stepsFor(run) };
}

/** `freed` once every cell is filled, `caught` once the spider has taken all its steps, else `open`. */
export function roundState(round: Round): 'open' | 'freed' | 'caught' {
  if (round.cells.every((c) => c.given || round.guessed.includes(padKey(c.key)))) return 'freed';
  if (round.misses >= round.steps) return 'caught';
  return 'open';
}

/**
 * Taps `key`: a hit fills every cell it stands for, a miss is one step of the spider. A key
 * already tapped, one not on the pad, or any tap once the word is over changes nothing.
 */
export function guess(round: Round, key: string): { round: Round; hit: boolean; state: 'open' | 'freed' | 'caught' } {
  const before = roundState(round);
  if (before !== 'open' || !ALPHABET.includes(key) || round.guessed.includes(key)) return { round, hit: false, state: before };
  const hit = round.cells.some((c) => !c.given && padKey(c.key) === key);
  const next = { ...round, guessed: [...round.guessed, key], misses: round.misses + (hit ? 0 : 1) };
  return { round: next, hit, state: roundState(next) };
}

/** Per cell, the letter to draw, or null while it is still hidden. */
export function shown(round: Round): (string | null)[] {
  return round.cells.map((c) => (c.given || round.guessed.includes(padKey(c.key)) ? c.key : null));
}
