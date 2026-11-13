/**
 * Rules for the "True or sting" game: the player guards the door of the hive. Each visitor
 * carries a Maltese word and a meaning; let it in when the meaning is the word's own, sting it
 * when it belongs to another word. Pure functions on plain data, tested without a screen.
 */
import { shuffle, type Rng } from './games';
import { clash } from './hive';
import { similarity } from './letters';
import type { Word } from './words';

/** A round lasts this long. */
export const ROUND_MS = 30_000;
/** After a right call the next visitor comes this soon. */
export const AFTER_RIGHT_MS = 200;
/** After a wrong call the correction stays this long, while the clock keeps running… */
export const AFTER_WRONG_MS = 1200;
/** …and this much more is taken off the clock. */
export const PENALTY_MS = 2000;
/** No more than this many honest visitors in a row, nor impostors. */
export const MAX_SAME = 3;
/** A topic with fewer words than this is played with the whole deck. */
export const MIN_POOL = 8;
/** The run of right calls from which false meanings come from look-alike words, and from relatives of the word. */
export const LEVELS = { lookalikes: 4, relatives: 8 };
/** Look-alike impostors are drawn from this many of the most similar words. */
export const LOOKALIKE_POOL = 4;
/** From `LEVELS.relatives`, the share of impostors that are relatives of the word, when it has any. */
export const RELATIVE_SHARE = 0.5;

/** A Maltese word and the meaning it claims: its own (`claim` is `word`), or another word's. */
export interface Visitor {
  word: Word;
  claim: Word;
  honest: boolean;
}

/** Whether the next visitor is honest: at random, but never more than `MAX_SAME` of a kind in a row. */
export function nextHonest(history: readonly boolean[], rng: Rng = Math.random): boolean {
  const last = history.slice(-MAX_SAME);
  if (last.length === MAX_SAME && last.every((h) => h === last[0])) return !last[0];
  return rng() < 0.5;
}

/**
 * The words in `pool` related to `word`: its plural or singular, the other forms of its verb and
 * the verb itself for a verb form, the forms of a verb for the verb.
 */
export function relatives(word: Word, pool: readonly Word[]): Word[] {
  return pool.filter((w) => {
    if (w.id === word.id) return false;
    if (word.plural && w.id === word.plural) return true;
    if (word.pluralOf && w.id === word.pluralOf) return true;
    if (word.formOf && (w.formOf === word.formOf || w.id === word.formOf)) return true;
    return w.formOf === word.id;
  });
}

/** One of `items` at random. */
function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

/**
 * The word whose meaning an impostor carries for `word`: any other word of its topic at first;
 * from `LEVELS.lookalikes` one of the topic's words that look most like it; from
 * `LEVELS.relatives`, half of the time, a relative of the word when the pool has one. A topic
 * with no other word falls back to the rest of the pool. Never `word`, nor a word sharing its text.
 */
export function impostorFor(word: Word, pool: readonly Word[], run: number, rng: Rng = Math.random): Word {
  const others = pool.filter((w) => w.id !== word.id && !clash(w, word));
  if (run >= LEVELS.relatives) {
    const near = relatives(word, others);
    if (near.length > 0 && rng() < RELATIVE_SHARE) return pick(near, rng);
  }
  const topic = others.filter((w) => w.topic === word.topic);
  const candidates = topic.length > 0 ? topic : others;
  if (candidates.length === 0) return word;
  if (run >= LEVELS.lookalikes) {
    const score = new Map(candidates.map((w) => [w.id, similarity(w.mt, word.mt)]));
    const ranked = shuffle(candidates, rng).sort((a, b) => score.get(b.id)! - score.get(a.id)!);
    return pick(ranked.slice(0, LOOKALIKE_POOL), rng);
  }
  return pick(candidates, rng);
}

/** The next visitor for `word`, after visitors whose truth is `history`. */
export function makeVisitor(word: Word, pool: readonly Word[], run: number, history: readonly boolean[], rng: Rng = Math.random): Visitor {
  const honest = nextHonest(history, rng);
  return { word, claim: honest ? word : impostorFor(word, pool, run, rng), honest };
}

/** Whether the call was right: honest visitors are let in, impostors stung. */
export function judge(visitor: Visitor, letIn: boolean): boolean {
  return letIn === visitor.honest;
}

/** The topic's words, or the whole deck's when the topic has fewer than `MIN_POOL`. */
export function guardPool(inTopic: readonly Word[], all: readonly Word[]): Word[] {
  return inTopic.length >= MIN_POOL ? [...inTopic] : [...all];
}
