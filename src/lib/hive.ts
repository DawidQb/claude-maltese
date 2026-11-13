/**
 * Rules for the "Protect the hive" game: words creep down the field in lanes towards the hive,
 * and the player shoots one down by tapping it and its answer in the tray below the field.
 * Pure functions on plain data, so the rules can be tested without a screen. Functions that
 * move or remove invaders change the array they are given, as the game loop keeps one list.
 */
import { doorLabel, promptLabel } from './bounce';
import { shuffle, takeDistinct, type Rng } from './games';
import type { Direction } from './srs';
import type { ShowLang } from './store';
import type { Word } from './words';

/** Cells of honey at the start of a run; a word reaching the hive costs one. */
export const HONEY = 3;
/** How far every word lurches towards the hive after a wrong pair, as a share of the fall. */
export const SURGE = 0.06;
/** The field stands still this long after a landing, to show what the word meant. */
export const REVEAL_MS = 1400;
/** The "Wave N" banner shows this long between waves. */
export const WAVE_PAUSE_MS = 1200;
/** With the field empty, the next word comes after this long instead of the usual gap. */
export const QUICK_SPAWN_MS = 600;
/** A topic with fewer usable words than this is played with the whole deck. */
export const MIN_POOL = 12;
/** Longest line on the word that creeps down… */
export const MAX_QUESTION = 18;
/** …and on an answer chip in the tray. */
export const MAX_ANSWER = 20;
/**
 * A field at least this wide has three lanes, a narrower one two. The plan said 560 px, but the
 * app's column is at most 560 px wide with its padding, so the field never got there.
 */
export const THREE_LANES_FROM = 480;
/** Decoys that look like a word are drawn at random from this many of the best look-alikes. */
const PREFERRED = 4;

export interface WaveSpec {
  /** Words in the wave. */
  words: number;
  /** Words on the field at once, at most. */
  onScreen: number;
  /** Time for a word to creep from the top of the field to the hive. */
  crossMs: number;
  /** Time between one word entering and the next. */
  gapMs: number;
  /** Answer chips in the tray. */
  tray: number;
  /** Decoys chosen for looking like the words on the field, rather than at random from the topic. */
  lookalikes: boolean;
}

/**
 * The waves, each row from its first wave on. Difficulty grows by the number of words, not by
 * speed: the slowest crossing never drops below 14 s, so a word can always be read.
 */
export const WAVES: { from: number; spec: WaveSpec }[] = [
  { from: 1, spec: { words: 5, onScreen: 2, crossMs: 20_000, gapMs: 5000, tray: 4, lookalikes: false } },
  { from: 2, spec: { words: 6, onScreen: 3, crossMs: 20_000, gapMs: 4000, tray: 4, lookalikes: false } },
  { from: 3, spec: { words: 8, onScreen: 3, crossMs: 18_000, gapMs: 3500, tray: 6, lookalikes: true } },
  { from: 5, spec: { words: 10, onScreen: 4, crossMs: 16_000, gapMs: 3000, tray: 6, lookalikes: true } },
  { from: 7, spec: { words: 12, onScreen: 4, crossMs: 14_000, gapMs: 2500, tray: 6, lookalikes: true } },
];

/** The spec of wave number `wave`, counting from 1. */
export function waveSpec(wave: number): WaveSpec {
  let spec = WAVES[0].spec;
  for (const row of WAVES) if (wave >= row.from) spec = row.spec;
  return { ...spec };
}

/** A word on the field. `y` runs from 0 (just above the top, out of sight) to 1 (its bottom touches the hive). */
export interface Invader {
  id: number;
  word: Word;
  lane: number;
  y: number;
}

/** Lanes on a field this many px wide. */
export function laneCount(width: number): 2 | 3 {
  return width >= THREE_LANES_FROM ? 3 : 2;
}

/** Words short enough to read while they move, as a falling word and as an answer chip. */
export function hiveWords(words: readonly Word[], dir: Direction, show: ShowLang): Word[] {
  return words.filter(
    (w) =>
      promptLabel(w, dir, show).every((line) => line.length <= MAX_QUESTION) &&
      doorLabel(w, dir, show).every((line) => line.length <= MAX_ANSWER),
  );
}

/** The words of the topic that fit; the whole deck's when the topic has too few. */
export function hivePool(inTopic: readonly Word[], all: readonly Word[], dir: Direction, show: ShowLang): Word[] {
  const pool = hiveWords(inTopic, dir, show);
  return pool.length >= MIN_POOL ? pool : hiveWords(all, dir, show);
}

/** Two different words that could be taken for each other: they share their Maltese, Polish or English. */
export function clash(a: Word, b: Word): boolean {
  return a.id !== b.id && (a.mt === b.mt || a.pl === b.pl || a.en === b.en);
}

/** A word may enter the field unless it is already there, or shares a side with a word that is. */
export function canEnter(word: Word, invaders: readonly Invader[]): boolean {
  return invaders.every((i) => i.word.id !== word.id && !clash(i.word, word));
}

/** Moves every word down by `dtMs`, and takes out and returns those that reached the hive. */
export function advance(invaders: Invader[], dtMs: number, crossMs: number): Invader[] {
  const step = dtMs / crossMs;
  const landed: Invader[] = [];
  for (let i = invaders.length - 1; i >= 0; i--) {
    invaders[i].y += step;
    if (invaders[i].y >= 1) landed.unshift(...invaders.splice(i, 1));
  }
  return landed;
}

/** After a wrong pair every word lurches closer. Anything pushed to the hive lands on the next `advance`. */
export function surge(invaders: Invader[], by = SURGE): void {
  for (const i of invaders) i.y += by;
}

/**
 * Whether the next word of the wave should enter now: some are left to come, there is room on
 * the field, and the gap since the last one has passed (a short one when the field is empty).
 */
export function spawnDue(spec: WaveSpec, invaders: readonly Invader[], toSpawn: number, sinceSpawnMs: number): boolean {
  if (toSpawn <= 0 || invaders.length >= spec.onScreen) return false;
  return sinceSpawnMs >= (invaders.length === 0 ? QUICK_SPAWN_MS : spec.gapMs);
}

/**
 * A lane for a new word: one whose highest word has moved at least `clear` down the field, so
 * the new one does not cover it. The emptiest lanes first, at random among equals; null while
 * every lane is blocked.
 */
export function pickLane(lanes: number, invaders: readonly Invader[], clear: number, rng: Rng = Math.random): number | null {
  const free: { lane: number; count: number }[] = [];
  for (let lane = 0; lane < lanes; lane++) {
    const here = invaders.filter((i) => i.lane === lane);
    if (here.every((i) => i.y >= clear)) free.push({ lane, count: here.length });
  }
  if (free.length === 0) return null;
  const fewest = Math.min(...free.map((f) => f.count));
  const best = free.filter((f) => f.count === fewest);
  return best[Math.floor(rng() * best.length)].lane;
}

/**
 * The tray of answer chips, `size` slots. It holds the answer to every word on the field once,
 * and decoys in the other slots. Chips that are still valid keep their slots; `null` marks a
 * slot to fill. A missing answer goes into an empty slot, or over a random decoy. A chip that
 * is already the answer to a word that just entered simply stays. Decoys come from the field's
 * topics first; `prefer` scores them (higher is better), and they are then drawn from the best
 * few. No two chips, and no chip and word on the field, share Maltese, Polish or English text,
 * so every word has exactly one answer.
 */
export function fillTray(
  tray: readonly (Word | null)[],
  invaders: readonly Invader[],
  pool: readonly Word[],
  size: number,
  rng: Rng = Math.random,
  prefer?: (candidate: Word) => number,
): Word[] {
  const answers = new Map<string, Word>();
  for (const i of invaders) answers.set(i.word.id, i.word);
  const slots: (Word | null)[] = Array.from({ length: size }, (_, k) => tray[k] ?? null);

  // Answers already in place stay, once each.
  const seen = new Set<string>();
  for (let k = 0; k < size; k++) {
    const w = slots[k];
    if (!w || !answers.has(w.id)) continue;
    if (seen.has(w.id)) slots[k] = null;
    else seen.add(w.id);
  }
  // Decoys stay unless they could be taken for a word on the field or for a chip kept before them.
  const kept: Word[] = [...answers.values()];
  for (let k = 0; k < size; k++) {
    const w = slots[k];
    if (!w || answers.has(w.id)) continue;
    if (kept.some((p) => p.id === w.id || clash(p, w))) slots[k] = null;
    else kept.push(w);
  }

  // Missing answers into empty slots first, then over decoys.
  for (const word of answers.values()) {
    if (seen.has(word.id)) continue;
    const empty = slots.flatMap((w, k) => (w === null ? [k] : []));
    const decoys = slots.flatMap((w, k) => (w !== null && !answers.has(w.id) ? [k] : []));
    const choices = empty.length > 0 ? empty : decoys;
    if (choices.length === 0) break;
    slots[choices[Math.floor(rng() * choices.length)]] = word;
    seen.add(word.id);
  }

  // Decoys for whatever is left.
  const holes = slots.filter((w) => w === null).length;
  if (holes > 0) {
    const taken = slots.filter((w): w is Word => w !== null);
    const start = [...new Map([...answers.values(), ...taken].map((w) => [w.id, w])).values()];
    const topics = new Set([...answers.values()].map((w) => w.topic));
    let near = shuffle(pool.filter((w) => topics.has(w.topic)), rng);
    if (prefer) {
      const score = new Map(near.map((w) => [w, prefer(w)]));
      const ranked = [...near].sort((a, b) => score.get(b)! - score.get(a)!);
      near = [...shuffle(ranked.slice(0, PREFERRED), rng), ...ranked.slice(PREFERRED)];
    }
    const far = shuffle(pool.filter((w) => !topics.has(w.topic)), rng);
    const fresh = takeDistinct([...near, ...far], start.length + holes, start).slice(start.length);
    for (let k = 0; k < size && fresh.length > 0; k++) if (slots[k] === null) slots[k] = fresh.shift()!;
  }
  return slots.filter((w): w is Word => w !== null);
}

/** Honey after a wave: a cell back, up to the full `HONEY`, when no word reached the hive. */
export function honeyAfterWave(honey: number, landedThisWave: number): number {
  return landedThisWave === 0 ? Math.min(HONEY, honey + 1) : honey;
}
