import { describe, expect, it } from 'vitest';
import type { Rng } from './games';
import { toKeys } from './letters';
import {
  areNeighbours,
  cellAt,
  COMB,
  FALSE_STARTS,
  hexCentre,
  judge,
  layPath,
  LEVELS,
  makeComb,
  MAX_KEYS,
  MIN_KEYS,
  MIN_POOL,
  neighbours,
  RADIUS,
  spellPool,
  spellWords,
  trace,
  type Comb,
} from './spell';
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

const word = (mt: string, topic = 't'): Word => ({ id: mt, mt, pl: `${mt}-pl`, en: `${mt}-en`, topic });
/** The index of the cell at (q, r). */
const at = (q: number, r: number) => COMB.findIndex((h) => h.q === q && h.r === r);
const CENTRE = at(0, 0);

describe('COMB', () => {
  it('has 19 cells in rows of 3, 4, 5, 4, 3, in reading order', () => {
    expect(COMB).toHaveLength(19);
    const rows = [-2, -1, 0, 1, 2].map((r) => COMB.filter((h) => h.r === r).length);
    expect(rows).toEqual([3, 4, 5, 4, 3]);
    for (let i = 1; i < COMB.length; i++) {
      const a = hexCentre(i - 1, 10);
      const b = hexCentre(i, 10);
      expect(b.y > a.y || (b.y === a.y && b.x > a.x)).toBe(true);
    }
    for (const h of COMB) expect(Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r))).toBeLessThanOrEqual(RADIUS);
  });

  it('knows its neighbours: symmetric, never itself, six round the centre, three at each corner', () => {
    for (let a = 0; a < COMB.length; a++) {
      expect(areNeighbours(a, a)).toBe(false);
      for (let b = 0; b < COMB.length; b++) expect(areNeighbours(a, b)).toBe(areNeighbours(b, a));
      expect(neighbours(a).length).toBeGreaterThanOrEqual(3);
      expect(neighbours(a).length).toBeLessThanOrEqual(6);
    }
    expect(neighbours(CENTRE)).toHaveLength(6);
    for (const [q, r] of [
      [0, -2],
      [2, -2],
      [2, 0],
      [0, 2],
      [-2, 2],
      [-2, 0],
    ]) {
      expect(neighbours(at(q, r))).toHaveLength(3);
    }
  });

  it('places neighbours one cell width apart', () => {
    const size = 40;
    for (let a = 0; a < COMB.length; a++) {
      for (const b of neighbours(a)) {
        const p = hexCentre(a, size);
        const q = hexCentre(b, size);
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeCloseTo(size * Math.sqrt(3));
      }
    }
  });
});

describe('cellAt', () => {
  const size = 40;

  it('finds each cell at its own centre, and near it', () => {
    for (let i = 0; i < COMB.length; i++) {
      const c = hexCentre(i, size);
      expect(cellAt(c.x, c.y, size)).toBe(i);
      expect(cellAt(c.x + size * 0.5, c.y - size * 0.3, size)).toBe(i);
    }
  });

  it('finds nothing where three cells meet, nor halfway between two, nor outside the comb', () => {
    // The top corner of the centre cell is shared with its two upper neighbours.
    expect(cellAt(0, -size, size)).toBeNull();
    const a = hexCentre(CENTRE, size);
    const b = hexCentre(at(1, 0), size);
    expect(cellAt((a.x + b.x) / 2, (a.y + b.y) / 2, size)).toBeNull();
    expect(cellAt(size * 10, 0, size)).toBeNull();
  });
});

describe('layPath', () => {
  it('lays every length from 3 to 9 on different cells, each next to the one before', () => {
    for (let length = MIN_KEYS; length <= MAX_KEYS; length++) {
      for (let seed = 1; seed <= 200; seed++) {
        const path = layPath(length, seeded(seed * 31 + length));
        expect(path).toHaveLength(length);
        expect(new Set(path).size).toBe(length);
        for (let k = 1; k < path.length; k++) expect(areNeighbours(path[k - 1], path[k])).toBe(true);
      }
    }
  });

  it('starts anywhere', () => {
    const starts = new Set(Array.from({ length: 400 }, (_, seed) => layPath(5, seeded(seed + 1))[0]));
    expect(starts.size).toBe(COMB.length);
  });
});

describe('makeComb', () => {
  const others = (comb: Comb) => comb.letters.filter((_, i) => !comb.path.includes(i));

  it('lays the word along its path and fills every cell', () => {
    const nine = spellWords(WORDS).find((w) => toKeys(w.mt).length === MAX_KEYS)!.mt;
    for (const mt of ['ħobż', 'għasfur', 'qattus', 'iva', nine]) {
      for (let seed = 1; seed <= 30; seed++) {
        const comb = makeComb(word(mt), seed % 8, seeded(seed));
        expect(comb.letters).toHaveLength(19);
        for (const l of comb.letters) expect(l).not.toBe('');
        expect(comb.path.map((i) => comb.letters[i])).toEqual(toKeys(mt));
      }
    }
  });

  it('puts "għ" in one cell', () => {
    const comb = makeComb(word('għasfur'), 0, seeded(4));
    expect(comb.path).toHaveLength(6);
    expect(comb.letters[comb.path[0]]).toBe('għ');
  });

  it('at first marks the first cell and fills the rest with letters the word does not have', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const comb = makeComb(word('ħobż'), 0, seeded(seed));
      expect(comb.marked).toBe(true);
      for (const l of others(comb)) expect(['ħ', 'o', 'b', 'ż']).not.toContain(l);
    }
  });

  it('from a run of 3, fills with look-alikes of the word’s letters', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const comb = makeComb(word('ħobż'), LEVELS.lookalikes, seeded(seed));
      expect(comb.marked).toBe(true);
      const rest = others(comb);
      expect(rest).toEqual(expect.arrayContaining(['h', 'għ', 'z']));
      for (const l of rest) expect(['ħ', 'o', 'b', 'ż']).not.toContain(l);
    }
    // A word with h gets ħ or għ.
    for (let seed = 1; seed <= 100; seed++) {
      const rest = others(makeComb(word('hemm'), LEVELS.lookalikes, seeded(seed)));
      expect(rest.includes('ħ') || rest.includes('għ')).toBe(true);
    }
  });

  it('from a run of 6, stops marking the first cell and adds false starts away from it', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const w = word(['qattus', 'ħobż', 'għasfur', 'kelb'][seed % 4]);
      const comb = makeComb(w, LEVELS.hard + (seed % 3), seeded(seed));
      expect(comb.marked).toBe(false);
      const first = toKeys(w.mt)[0];
      const start = comb.path[0];
      const copies = comb.letters.flatMap((l, i) => (l === first && !comb.path.includes(i) ? [i] : []));
      expect(copies).toHaveLength(FALSE_STARTS);
      for (const i of copies) expect(areNeighbours(i, start)).toBe(false);
    }
  });
});

describe('trace', () => {
  // Along the middle row: (-2,0) (-1,0) (0,0) (1,0) (2,0).
  const row = [-2, -1, 0, 1, 2].map((q) => at(q, 0));

  it('starts on any cell', () => {
    expect(trace([], row[2], 'drag')).toEqual([row[2]]);
    expect(trace([], row[4], 'tap')).toEqual([row[4]]);
  });

  it('adds a free neighbour, by drag or tap', () => {
    expect(trace([row[0]], row[1], 'drag')).toEqual([row[0], row[1]]);
    expect(trace([row[0], row[1]], row[2], 'tap')).toEqual([row[0], row[1], row[2]]);
  });

  it('while dragging, ignores a cell already used, a far cell and the last cell', () => {
    // Round the centre: (0,0) → (1,0) → (1,-1) → (0,-1); (0,0) is used and next to (0,-1).
    const loop = [CENTRE, at(1, 0), at(1, -1), at(0, -1)];
    expect(trace(loop, CENTRE, 'drag')).toEqual(loop);
    expect(trace([row[0], row[1]], row[4], 'drag')).toEqual([row[0], row[1]]);
    expect(trace([row[0], row[1]], row[1], 'drag')).toEqual([row[0], row[1]]);
  });

  it('steps back on the cell before the last', () => {
    expect(trace([row[0], row[1], row[2]], row[1], 'drag')).toEqual([row[0], row[1]]);
    expect(trace([row[0], row[1], row[2]], row[1], 'tap')).toEqual([row[0], row[1]]);
  });

  it('takes the last cell off when it is tapped again', () => {
    expect(trace([row[0], row[1]], row[1], 'tap')).toEqual([row[0]]);
    expect(trace([row[0]], row[0], 'tap')).toEqual([]);
  });

  it('starts again from a far cell, or a used one, that is tapped', () => {
    expect(trace([row[0], row[1]], row[4], 'tap')).toEqual([row[4]]);
    expect(trace([row[0], row[1], row[2]], row[0], 'tap')).toEqual([row[0]]);
  });
});

describe('judge', () => {
  // "kelb" on the middle row from the left, and the same letters again on the top row.
  const top = [0, 1, 2].map((q) => at(q, -2));
  const row = [-2, -1, 0, 1].map((q) => at(q, 0));
  const letters = new Array(19).fill('x');
  ['k', 'e', 'l', 'b'].forEach((l, k) => (letters[row[k]] = l));
  letters[top[0]] = 'k';
  letters[top[1]] = 'e';
  letters[top[2]] = 'l';
  letters[at(2, -1)] = 'b';
  const comb: Comb = { letters, path: row, marked: true };
  const kelb = word('kelb');

  it('is open while the trace is shorter than the word', () => {
    expect(judge(comb, [], kelb)).toBe('open');
    expect(judge(comb, row.slice(0, 3), kelb)).toBe('open');
  });

  it('is right on the path, and on another path with the same letters', () => {
    expect(judge(comb, row, kelb)).toBe('right');
    expect(judge(comb, [...top, at(2, -1)], kelb)).toBe('right');
  });

  it('is wrong at full length when the letters differ', () => {
    expect(judge(comb, [row[0], row[1], row[2], at(0, 1)], kelb)).toBe('wrong');
  });
});

describe('spellWords and spellPool', () => {
  it('drops phrases, hyphenated words, two-letter words and words over nine letters', () => {
    const words = ['kelb', 'il-kelb', 'grazzi ħafna', "ta'", 'iva', 'le', 'ħobż', 'iddeċidejniex', 'għasfur', "x'inhu"].map((mt) => word(mt));
    expect(spellWords(words).map((w) => w.mt)).toEqual(['kelb', 'iva', 'ħobż', 'għasfur']);
  });

  it('keeps most of the shipped deck, every word fitting a comb', () => {
    const fit = spellWords(WORDS);
    expect(fit.length).toBeGreaterThan(WORDS.length * 0.85);
    for (const w of fit) {
      const keys = toKeys(w.mt);
      expect(keys.length).toBeGreaterThanOrEqual(MIN_KEYS);
      expect(keys.length).toBeLessThanOrEqual(MAX_KEYS);
    }
  });

  it('falls back to the whole deck when the topic has too few words', () => {
    const words = 'abdefhijklmnorstu'.split('').map((l) => word(`kel${l}`));
    const few = words.slice(0, MIN_POOL - 1);
    expect(spellPool([...few, word('le')], WORDS)).toEqual(spellWords(WORDS));
    const many = words.slice(0, MIN_POOL);
    expect(spellPool([...many, word('le')], WORDS)).toEqual(many);
  });
});
