import { describe, expect, it } from 'vitest';
import { checkAnswer } from './answer';
import { keyLabel, letterKeys, padSize, toKeys } from './letters';
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

  it('keeps ten keys for words of up to ten letters', () => {
    expect(padSize('id')).toBe(10);
    expect(padSize('ħobż')).toBe(10);
    expect(padSize('tkellimtu')).toBe(10);
    expect(padSize('interessanti'.slice(0, 10))).toBe(10);
  });

  it('grows the pad, a whole row at a time, for words longer than ten letters', () => {
    expect(toKeys('interessanti')).toHaveLength(12);
    expect(padSize('interessanti')).toBe(15);
    expect(letterKeys('interessanti', seeded(1))).toHaveLength(15);
    expect(toKeys('titkellem bl-Ingliż?')).toHaveLength(19);
    expect(padSize('titkellem bl-Ingliż?')).toBe(20);
    expect(letterKeys('titkellem bl-Ingliż?', seeded(1))).toHaveLength(20);
  });

  it('always leaves at least two decoys, even when the word uses many different letters', () => {
    const rng = seeded(11);
    for (const w of WORDS) {
      const keys = letterKeys(w.mt, rng);
      const needed = new Set(toKeys(w.mt));
      expect(keys.length % 5, w.mt).toBe(0);
      expect(keys.length, w.mt).toBeGreaterThanOrEqual(toKeys(w.mt).length);
      expect(keys.filter((k) => !needed.has(k)).length, w.mt).toBeGreaterThanOrEqual(2);
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
