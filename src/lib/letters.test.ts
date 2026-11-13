import { describe, expect, it } from 'vitest';
import { checkAnswer } from './answer';
import { keyLabel, letterKeys, padSize, similarity, toKeys } from './letters';
import { WORDS } from './words';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('toKeys', () => {
  it('treats għ as one key and lower-cases the word', () => {
    expect(toKeys('għajn')).toEqual(['għ', 'a', 'j', 'n']);
    expect(toKeys('Ġunju')).toEqual(['ġ', 'u', 'n', 'j', 'u']);
    expect(toKeys('xagħar')).toEqual(['x', 'a', 'għ', 'a', 'r']);
  });

  it('keeps spaces, hyphens and apostrophes but drops other punctuation', () => {
    expect(toKeys('kif int?')).toEqual(['k', 'i', 'f', ' ', 'i', 'n', 't']);
    expect(toKeys('jisimni…')).toEqual(['j', 'i', 's', 'i', 'm', 'n', 'i']);
    expect(toKeys("sema'")).toEqual(['s', 'e', 'm', 'a', "'"]);
    expect(toKeys('bil-ġuħ')).toEqual(['b', 'i', 'l', '-', 'ġ', 'u', 'ħ']);
  });
});

describe('letterKeys', () => {
  it('gives ten different keys including every letter of the word', () => {
    const keys = letterKeys('ħobż', seeded(1));
    expect(keys).toHaveLength(10);
    expect(new Set(keys).size).toBe(10);
    for (const k of ['ħ', 'o', 'b', 'ż']) expect(keys).toContain(k);
  });

  it('adds the look-alike letters as decoys', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const keys = letterKeys('ħobż', seeded(seed));
      expect(keys).toContain('h');
      expect(keys).toContain('z');
      expect(letterKeys('ġar', seeded(seed))).toContain('g');
    }
  });

  it('lays the keys out in alphabet order, with space and punctuation last', () => {
    expect(letterKeys('ilma', seeded(3)).join('')).toMatch(/^[a-zċġħżg]+$/);
    const keys = letterKeys('kif int?', seeded(2));
    expect(keys[keys.length - 1]).toBe(' ');
    const letters = letterKeys('dar', seeded(5));
    const order = 'abċdefġghħijklmnopqrstuvwxżz';
    const positions = letters.map((k) => order.indexOf(k[0]));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  const different = (word: string) => new Set(toKeys(word)).size;

  it('keeps ten keys for any word with up to ten different letters, however long it is', () => {
    expect(padSize('id')).toBe(10);
    expect(padSize('ħobż')).toBe(10);
    // Twelve letters long, but only seven different ones.
    expect(toKeys('interessanti')).toHaveLength(12);
    expect(different('interessanti')).toBe(7);
    expect(padSize('interessanti')).toBe(10);
    // Nine different letters: ten keys, one of them a decoy.
    expect(different('perikoluż')).toBe(9);
    expect(letterKeys('perikoluż', seeded(1))).toHaveLength(10);
  });

  it('grows the pad a whole row at a time once a word has more than ten different letters', () => {
    expect(different('titkellem bl-Ingliż?')).toBe(12);
    expect(padSize('titkellem bl-Ingliż?')).toBe(15);
    const keys = letterKeys('titkellem bl-Ingliż?', seeded(1));
    expect(keys).toHaveLength(15);
    for (const k of toKeys('titkellem bl-Ingliż?')) expect(keys).toContain(k);
  });

  it('sizes every pad in the deck by its different letters only', () => {
    const rng = seeded(11);
    for (const w of WORDS) {
      const keys = letterKeys(w.mt, rng);
      const n = different(w.mt);
      expect(keys.length, w.mt).toBe(n <= 10 ? 10 : Math.ceil(n / 5) * 5);
    }
  });

  it('lets every word in the deck be typed correctly with its own keys', () => {
    const rng = seeded(7);
    for (const w of WORDS) {
      const needed = toKeys(w.mt);
      const keys = letterKeys(w.mt, rng);
      expect(keys.length, w.mt).toBeGreaterThanOrEqual(10);
      expect(new Set(keys).size, w.mt).toBe(keys.length);
      for (const k of needed) expect(keys, w.mt).toContain(k);
      expect(checkAnswer(needed.join(''), w.mt), w.mt).toBe('correct');
    }
  });
});

describe('keyLabel', () => {
  it('shows the space key as a visible sign', () => {
    expect(keyLabel(' ')).toBe('␣');
    expect(keyLabel('għ')).toBe('għ');
  });
});

describe('similarity', () => {
  it('counts look-alike letters as the same', () => {
    expect(similarity('ħobż', 'hobz')).toBe(1);
    expect(similarity('għada', 'hada')).toBe(1);
    expect(similarity('ċaw', 'kaw')).toBe(1);
  });

  it('ranks words that look alike above unrelated ones', () => {
    for (const [word, alike, unrelated] of [
      ['ħobż', 'hobz', 'ilma'],
      ['ħobż', 'ħolma', 'tifel'],
      ['dar', 'dawra', 'kelb'],
      ['ġobon', 'gobon', 'xemx'],
    ]) {
      expect(similarity(word, alike), `${alike} vs ${unrelated}`).toBeGreaterThan(similarity(word, unrelated));
    }
  });

  it('is the same both ways and stays between 0 and 1', () => {
    for (const [a, b] of [
      ['ħobż', 'ilma'],
      ['xagħar', 'għajn'],
      ['jiekol', 'jieklu'],
    ]) {
      expect(similarity(a, b)).toBeCloseTo(similarity(b, a), 10);
      expect(similarity(a, b)).toBeGreaterThanOrEqual(0);
      expect(similarity(a, b)).toBeLessThanOrEqual(1);
    }
  });
});
