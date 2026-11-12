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

/**
 * An endless supply of words in random order. Every word comes up once before
 * any repeats, and the same word never appears twice in a row.
 */
export class WordStream {
  private bag: Word[] = [];
  private last: Word | null = null;

  constructor(
    private readonly words: readonly Word[],
    private readonly rng: Rng = Math.random,
  ) {}

  next(): Word {
    if (this.bag.length === 0) {
      this.bag = shuffle(this.words, this.rng);
      if (this.bag.length > 1 && this.bag[0] === this.last) {
        [this.bag[0], this.bag[1]] = [this.bag[1], this.bag[0]];
      }
    }
    this.last = this.bag.shift()!;
    return this.last;
  }

  /** Brings a missed word back a few turns later. */
  repeatSoon(word: Word, after = 3): void {
    if (this.bag.includes(word)) return;
    this.bag.splice(Math.min(after, this.bag.length), 0, word);
  }
}

/** Takes candidates in order, skipping any that share Maltese, Polish or English text with one already taken. */
function takeDistinct(candidates: readonly Word[], count: number, start: Word[] = []): Word[] {
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

/** Wrong options come from the answer's own topic first, so they can't be ruled out at a glance. */
export function makeQuestion(words: readonly Word[], answer: Word, rng: Rng = Math.random, optionCount = 4): Question {
  const sameTopic = shuffle(words.filter((w) => w.topic === answer.topic), rng);
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
