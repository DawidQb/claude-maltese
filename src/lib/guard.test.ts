import { describe, expect, it } from 'vitest';
import type { Rng } from './games';
import {
  AFTER_RIGHT_MS,
  AFTER_WRONG_MS,
  guardPool,
  impostorFor,
  judge,
  LEVELS,
  LOOKALIKE_POOL,
  makeVisitor,
  MAX_SAME,
  MIN_POOL,
  nextHonest,
  PENALTY_MS,
  relatives,
  type Visitor,
} from './guard';
import { similarity } from './letters';
import { WORDS, type Word } from './words';

function seeded(seed: number): Rng {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const find = (id: string) => WORDS.find((w) => w.id === id)!;
const word = (mt: string, topic = 't'): Word => ({ id: mt, mt, pl: `${mt}-pl`, en: `${mt}-en`, topic });

describe('nextHonest', () => {
  it('is honest about half the time, never more than three of a kind in a row', () => {
    const rng = seeded(7);
    const history: boolean[] = [];
    for (let i = 0; i < 4000; i++) history.push(nextHonest(history, rng));
    const honest = history.filter(Boolean).length / history.length;
    expect(honest).toBeGreaterThan(0.45);
    expect(honest).toBeLessThan(0.55);
    let same = 1;
    for (let i = 1; i < history.length; i++) {
      same = history[i] === history[i - 1] ? same + 1 : 1;
      expect(same).toBeLessThanOrEqual(MAX_SAME);
    }
  });

  it('turns after three of a kind', () => {
    expect(nextHonest([true, true, true], () => 0)).toBe(false);
    expect(nextHonest([false, false, false], () => 0.99)).toBe(true);
    expect(nextHonest([true, false, false], () => 0)).toBe(true);
  });
});

describe('relatives', () => {
  it('gives a singular its plural and a plural its singular', () => {
    expect(relatives(find('dar'), WORDS).map((w) => w.id)).toEqual(['djar']);
    expect(relatives(find('djar'), WORDS).map((w) => w.id)).toEqual(['dar']);
  });

  it('gives a verb form its sibling forms and its verb, and a verb its forms', () => {
    const kilna = find('kilna');
    const near = relatives(kilna, WORDS);
    expect(near.map((w) => w.id)).toContain('kiel');
    expect(near.map((w) => w.id)).toContain('kielu');
    expect(near.map((w) => w.id)).not.toContain('kilna');
    for (const w of near) expect(w.id === 'kiel' || w.formOf === 'kiel').toBe(true);
    const kiel = relatives(find('kiel'), WORDS);
    expect(kiel.length).toBeGreaterThan(5);
    for (const w of kiel) expect(w.formOf).toBe('kiel');
  });

  it('gives a plain word nothing, and leaves out relatives missing from the pool', () => {
    const plain = WORDS.find((w) => !w.plural && !w.pluralOf && !w.formOf && !WORDS.some((x) => x.formOf === w.id))!;
    expect(relatives(plain, WORDS)).toEqual([]);
    expect(relatives(find('dar'), WORDS.filter((w) => w.id !== 'djar'))).toEqual([]);
  });
});

describe('impostorFor', () => {
  const homes = WORDS.filter((w) => w.topic === find('dar').topic);

  it('never gives the word itself, nor a word sharing its text', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = seeded(seed);
      const w = WORDS[Math.floor(rng() * WORDS.length)];
      const claim = impostorFor(w, WORDS, seed % 12, rng);
      expect(claim.id).not.toBe(w.id);
      expect(claim.pl).not.toBe(w.pl);
      expect(claim.en).not.toBe(w.en);
    }
  });

  it('at first takes any other word of the same topic', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const claim = impostorFor(find('dar'), WORDS, 0, seeded(seed));
      expect(claim.topic).toBe(find('dar').topic);
      seen.add(claim.id);
    }
    expect(seen.size).toBeGreaterThan(LOOKALIKE_POOL * 2);
  });

  it('from a run of 4, takes one of the four words in the topic that look most like it', () => {
    const ħobż = find('ħobż');
    const scores = WORDS.filter((w) => w.topic === ħobż.topic && w.id !== ħobż.id)
      .map((w) => similarity(w.mt, ħobż.mt))
      .sort((a, b) => b - a);
    for (let seed = 1; seed <= 200; seed++) {
      const claim = impostorFor(ħobż, WORDS, LEVELS.lookalikes, seeded(seed));
      expect(claim.topic).toBe(ħobż.topic);
      expect(similarity(claim.mt, ħobż.mt)).toBeGreaterThanOrEqual(scores[LOOKALIKE_POOL - 1]);
    }
  });

  it('from a run of 8, takes a relative about half the time when there is one, never otherwise', () => {
    const kilna = find('kilna');
    const near = new Set(relatives(kilna, WORDS).map((w) => w.id));
    const verbForms = WORDS.filter((w) => w.topic === kilna.topic);
    // In the verb forms' own topic every look-alike is a relative too, so use a mixed pool.
    const pool = [...WORDS.filter((w) => w.topic !== kilna.topic), kilna, ...verbForms.filter((w) => near.has(w.id))];
    let hits = 0;
    for (let seed = 1; seed <= 1000; seed++) if (near.has(impostorFor({ ...kilna, topic: 'Food & drink' }, pool, LEVELS.relatives, seeded(seed)).id)) hits += 1;
    expect(hits / 1000).toBeGreaterThan(0.4);
    expect(hits / 1000).toBeLessThan(0.6);

    const plain = homes.find((w) => relatives(w, WORDS).length === 0)!;
    for (let seed = 1; seed <= 200; seed++) {
      const claim = impostorFor(plain, WORDS, LEVELS.relatives, seeded(seed));
      expect(claim.topic).toBe(plain.topic);
    }
  });

  it('falls back to the rest of the pool when the topic has no other word', () => {
    const lonely = word('waħdu', 'alone');
    const pool = [lonely, word('kelb'), word('qattus')];
    for (let seed = 1; seed <= 50; seed++) expect(['kelb', 'qattus']).toContain(impostorFor(lonely, pool, 0, seeded(seed)).id);
  });
});

describe('makeVisitor and judge', () => {
  it('carries the word’s own meaning when honest, another word’s when not', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const v = makeVisitor(find('dar'), WORDS, 0, [], seeded(seed));
      expect(v.claim.id === v.word.id).toBe(v.honest);
    }
  });

  it('is right to let in the honest and sting the rest', () => {
    const honest: Visitor = { word: find('dar'), claim: find('dar'), honest: true };
    const impostor: Visitor = { word: find('dar'), claim: find('djar'), honest: false };
    expect(judge(honest, true)).toBe(true);
    expect(judge(honest, false)).toBe(false);
    expect(judge(impostor, true)).toBe(false);
    expect(judge(impostor, false)).toBe(true);
  });
});

describe('guardPool and the clock', () => {
  it('uses the topic, or the whole deck when the topic is too small', () => {
    const few = WORDS.slice(0, MIN_POOL - 1);
    expect(guardPool(few, WORDS)).toEqual(WORDS);
    expect(guardPool(WORDS.slice(0, MIN_POOL), WORDS)).toEqual(WORDS.slice(0, MIN_POOL));
  });

  it('makes guessing cost more than twice a careful call', () => {
    expect(AFTER_RIGHT_MS + AFTER_WRONG_MS + PENALTY_MS).toBeGreaterThan(2 * (1200 + AFTER_RIGHT_MS));
  });
});
