import { describe, expect, it } from 'vitest';
import { makePairsRound, makeQuestion, pickDistinct, shuffle, WordStream, type Rng } from './games';
import { TOPICS, WORDS, wordsInTopic, type Word } from './words';

/** Deterministic random numbers, so the tests are repeatable. */
function seeded(seed: number): Rng {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const word = (mt: string, pl = `${mt}-pl`, en = `${mt}-en`): Word => ({ id: mt, mt, pl, en, topic: 't' });

describe('shuffle', () => {
  it('keeps every item and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, seeded(1));
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('WordStream', () => {
  it('shows every word once before repeating, and never the same word twice in a row', () => {
    const words = wordsInTopic('Body & health');
    expect(words.length).toBeGreaterThan(10);
    const stream = new WordStream(words, seeded(7));
    const seen: Word[] = [];
    for (let i = 0; i < words.length * 20; i++) seen.push(stream.next());

    expect(new Set(seen.slice(0, words.length)).size).toBe(words.length);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('brings a missed word back later, not straight away', () => {
    const stream = new WordStream(WORDS, seeded(3));
    const missed = stream.next();
    stream.repeatLater(missed);
    const upcoming = Array.from({ length: 12 }, () => stream.next());
    expect(upcoming.slice(0, 7)).not.toContain(missed);
    expect(upcoming).toContain(missed);
  });

  it('keeps moving through the deck even when every word is missed', () => {
    const stream = new WordStream(WORDS, seeded(9));
    const seen: Word[] = [];
    for (let i = 0; i < 200; i++) {
      const w = stream.next();
      seen.push(w);
      stream.repeatLater(w);
    }
    // At most one turn in four is a repeat, so at least 150 of 200 are different words.
    expect(new Set(seen).size).toBeGreaterThanOrEqual(150);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('eventually shows every card in the deck', () => {
    const stream = new WordStream(WORDS, seeded(4));
    const seen = new Set<Word>();
    for (let i = 0; i < WORDS.length; i++) seen.add(stream.next());
    expect(seen.size).toBe(WORDS.length);
  });

  it('works with a single word', () => {
    const only = word('a');
    const stream = new WordStream([only], seeded(1));
    expect([stream.next(), stream.next(), stream.next()]).toEqual([only, only, only]);
  });
});

describe('pickDistinct', () => {
  it('never returns two words that share a translation', () => {
    const words = [word('a', 'x', 'one'), word('b', 'x', 'two'), word('c', 'y', 'one'), word('d', 'z', 'three')];
    for (let seed = 1; seed <= 20; seed++) {
      const picked = pickDistinct(words, 4, seeded(seed));
      expect(new Set(picked.map((w) => w.pl)).size).toBe(picked.length);
      expect(new Set(picked.map((w) => w.en)).size).toBe(picked.length);
    }
  });

  it('returns fewer words when the topic is too small', () => {
    expect(pickDistinct([word('a'), word('b')], 6, seeded(1))).toHaveLength(2);
  });
});

describe('makeQuestion', () => {
  it('offers four different options including the answer, for every word in every topic', () => {
    const rng = seeded(11);
    for (const topic of TOPICS) {
      const words = wordsInTopic(topic);
      for (const answer of words) {
        const q = makeQuestion(words, answer, rng);
        expect(q.options).toHaveLength(4);
        expect(q.options).toContain(answer);
        expect(new Set(q.options).size).toBe(4);
      }
    }
  });

  it('takes the wrong options from the same topic as the answer', () => {
    const rng = seeded(17);
    for (const answer of WORDS) {
      const q = makeQuestion(WORDS, answer, rng);
      expect(q.options.every((w) => w.topic === answer.topic), answer.mt).toBe(true);
    }
  });

  it('falls back to other topics when the answer has too few neighbours', () => {
    const words = [word('a'), word('b'), { ...word('c'), topic: 'u' }, { ...word('d'), topic: 'u' }, { ...word('e'), topic: 'u' }];
    const q = makeQuestion(words, words[0], seeded(2));
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain(words[0]);
    expect(q.options).toContain(words[1]);
  });

  it('does not always put the answer in the same place', () => {
    const rng = seeded(5);
    const positions = new Set(WORDS.slice(0, 40).map((w) => makeQuestion(WORDS, w, rng).options.indexOf(w)));
    expect(positions.size).toBe(4);
  });
});

describe('makePairsRound', () => {
  it('gives six pairs with the same words on both sides, in every topic', () => {
    const rng = seeded(13);
    for (const topic of TOPICS) {
      const round = makePairsRound(wordsInTopic(topic), rng);
      expect(round.left).toHaveLength(6);
      expect(new Set(round.left)).toEqual(new Set(round.right));
    }
  });
});
