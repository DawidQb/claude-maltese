import type { Word } from './words';

export type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A missed word comes back no sooner than this many turns later… */
const REPEAT_AFTER = 8;
/** …and repeats are at least this many turns apart, so most turns are fresh words. */
const REPEAT_GAP = 4;

/**
 * An endless supply of words in random order. Every word comes up once before
 * the deck starts again, and the same word never appears twice in a row.
 * Missed words are brought back later, but only now and then: however many
 * are missed, at least three turns in four are words from the deck.
 */
export class WordStream {
  private bag: Word[] = [];
  private last: Word | null = null;
  private turn = 0;
  private lastRepeat = -REPEAT_GAP;
  private missed: { word: Word; at: number }[] = [];

  constructor(
    private readonly words: readonly Word[],
    private readonly rng: Rng = Math.random,
  ) {}

  next(): Word {
    this.turn += 1;
    const due = this.missed[0];
    if (due && due.at <= this.turn && this.turn - this.lastRepeat >= REPEAT_GAP && due.word !== this.last) {
      this.missed.shift();
      this.lastRepeat = this.turn;
      this.last = due.word;
      return due.word;
    }
    if (this.bag.length === 0) {
      this.bag = shuffle(this.words, this.rng);
      if (this.bag.length > 1 && this.bag[0] === this.last) {
        [this.bag[0], this.bag[1]] = [this.bag[1], this.bag[0]];
      }
    }
    this.last = this.bag.shift()!;
    return this.last;
  }

  /** Queues a missed word to come back later. */
  repeatLater(word: Word): void {
    if (this.missed.some((m) => m.word === word)) return;
    this.missed.push({ word, at: this.turn + REPEAT_AFTER });
  }
}

/** Takes candidates in order, skipping any that share Maltese, Polish or English text with one already taken. */
export function takeDistinct(candidates: readonly Word[], count: number, start: Word[] = []): Word[] {
  const picked = [...start];
  for (const w of candidates) {
    if (picked.length >= count) break;
    if (picked.some((p) => p.mt === w.mt || p.pl === w.pl || p.en === w.en)) continue;
    picked.push(w);
  }
  return picked;
}

/** Picks up to `count` random words that cannot be confused with each other. */
export function pickDistinct(words: readonly Word[], count: number, rng: Rng = Math.random): Word[] {
  return takeDistinct(shuffle(words, rng), count);
}

export interface Question {
  answer: Word;
  /** The answer and its distractors, shuffled. */
  options: Word[];
}

/** With a preference, wrong options are drawn at random from this many of the best-scoring words. */
const PREFERRED = 4;

/**
 * Wrong options come from the answer's own topic first, so they can't be ruled out at a glance.
 * `prefer` scores the candidates (higher is better): the wrong options then come from the best
 * few in the topic, in random order, so the same word does not always get the same decoy.
 */
export function makeQuestion(
  words: readonly Word[],
  answer: Word,
  rng: Rng = Math.random,
  optionCount = 4,
  prefer?: (candidate: Word) => number,
): Question {
  let sameTopic = shuffle(words.filter((w) => w.topic === answer.topic), rng);
  if (prefer) {
    const ranked = sameTopic.filter((w) => w.mt !== answer.mt).sort((a, b) => prefer(b) - prefer(a));
    sameTopic = [...shuffle(ranked.slice(0, PREFERRED), rng), ...ranked.slice(PREFERRED)];
  }
  const others = shuffle(words.filter((w) => w.topic !== answer.topic), rng);
  return { answer, options: shuffle(takeDistinct([...sameTopic, ...others], optionCount, [answer]), rng) };
}

export interface PairsRound {
  /** Maltese side, in display order. */
  left: Word[];
  /** Translation side, in display order. */
  right: Word[];
}

export function makePairsRound(words: readonly Word[], rng: Rng = Math.random, pairCount = 6): PairsRound {
  const picked = pickDistinct(words, pairCount, rng);
  return { left: shuffle(picked, rng), right: shuffle(picked, rng) };
}
