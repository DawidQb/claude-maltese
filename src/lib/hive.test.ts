import { describe, expect, it } from 'vitest';
import { doorLabel, promptLabel } from './bounce';
import type { Rng } from './games';
import {
  advance,
  canEnter,
  clash,
  fillTray,
  HONEY,
  laneCount,
  hivePool,
  hiveWords,
  honeyAfterWave,
  MAX_ANSWER,
  MAX_QUESTION,
  MIN_POOL,
  pickLane,
  QUICK_SPAWN_MS,
  spawnDue,
  SURGE,
  THREE_LANES_FROM,
  surge,
  waveSpec,
  type Invader,
} from './hive';
import { similarity } from './letters';
import type { ShowLang } from './store';
import { ALL_TOPICS, WORDS, wordsInTopic, type Word } from './words';

function seeded(seed: number): Rng {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const word = (mt: string, topic = 't', pl = `${mt}-pl`, en = `${mt}-en`): Word => ({ id: mt, mt, pl, en, topic });
let nextId = 1;
const inv = (w: Word, lane = 0, y = 0): Invader => ({ id: nextId++, word: w, lane, y });

describe('waveSpec', () => {
  it('follows the table, row by row', () => {
    expect(waveSpec(1)).toEqual({ words: 5, onScreen: 2, crossMs: 20_000, gapMs: 5000, tray: 4, lookalikes: false });
    expect(waveSpec(2)).toEqual({ words: 6, onScreen: 3, crossMs: 20_000, gapMs: 4000, tray: 4, lookalikes: false });
    for (const w of [3, 4]) expect(waveSpec(w)).toEqual({ words: 8, onScreen: 3, crossMs: 18_000, gapMs: 3500, tray: 6, lookalikes: true });
    for (const w of [5, 6]) expect(waveSpec(w)).toEqual({ words: 10, onScreen: 4, crossMs: 16_000, gapMs: 3000, tray: 6, lookalikes: true });
    expect(waveSpec(7)).toEqual({ words: 12, onScreen: 4, crossMs: 14_000, gapMs: 2500, tray: 6, lookalikes: true });
  });

  it('stays on the last row however far the run goes, never under 14 seconds a crossing', () => {
    expect(waveSpec(50)).toEqual(waveSpec(7));
    for (let w = 1; w <= 200; w++) expect(waveSpec(w).crossMs).toBeGreaterThanOrEqual(14_000);
  });

  it('never lets more words on screen than the tray can answer', () => {
    for (let w = 1; w <= 10; w++) expect(waveSpec(w).onScreen).toBeLessThanOrEqual(4);
  });
});

describe('hiveWords and hivePool', () => {
  const shows: ShowLang[] = ['pl', 'en', 'both'];

  it('keeps only words whose lines fit, in both directions and for every language choice', () => {
    for (const dir of ['mt2x', 'x2mt'] as const) {
      for (const show of shows) {
        const kept = hiveWords(WORDS, dir, show);
        expect(kept.length).toBeGreaterThan(MIN_POOL);
        expect(kept.length).toBeLessThan(WORDS.length);
        for (const w of kept) {
          expect(promptLabel(w, dir, show).every((l) => l.length <= MAX_QUESTION)).toBe(true);
          expect(doorLabel(w, dir, show).every((l) => l.length <= MAX_ANSWER)).toBe(true);
        }
        const dropped = WORDS.filter((w) => !kept.includes(w));
        for (const w of dropped) {
          const long = [...promptLabel(w, dir, show).filter((l) => l.length > MAX_QUESTION), ...doorLabel(w, dir, show).filter((l) => l.length > MAX_ANSWER)];
          expect(long.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('drops a long translation only when that language is shown', () => {
    const w = word('kelb', 't', 'pies', 'a very long english translation');
    expect(hiveWords([w], 'x2mt', 'pl')).toEqual([w]);
    expect(hiveWords([w], 'x2mt', 'en')).toEqual([]);
    expect(hiveWords([w], 'mt2x', 'both')).toEqual([]);
  });

  it('falls back to the whole deck when the topic has too few words', () => {
    const few = wordsInTopic(ALL_TOPICS).slice(0, 3);
    expect(hivePool(few, WORDS, 'x2mt', 'both').length).toBeGreaterThan(MIN_POOL);
    const many = hiveWords(WORDS, 'x2mt', 'both').slice(0, 20);
    expect(hivePool(many, WORDS, 'x2mt', 'both')).toEqual(many);
  });
});

describe('advance and surge', () => {
  it('moves every word by its share of the crossing', () => {
    const list = [inv(word('a'), 0, 0), inv(word('b'), 1, 0.5)];
    expect(advance(list, 1000, 20_000)).toEqual([]);
    expect(list[0].y).toBeCloseTo(0.05);
    expect(list[1].y).toBeCloseTo(0.55);
  });

  it('reports each landing once, and takes it off the field', () => {
    const a = inv(word('a'), 0, 0.98);
    const b = inv(word('b'), 1, 0.2);
    const list = [a, b];
    expect(advance(list, 1000, 20_000)).toEqual([a]);
    expect(list).toEqual([b]);
    expect(advance(list, 1000, 20_000)).toEqual([]);
  });

  it('a surge keeps the spacing between words, and a word pushed to the hive lands next time', () => {
    const list = [inv(word('a'), 0, 0.1), inv(word('b'), 0, 0.4), inv(word('c'), 1, 0.97)];
    surge(list);
    expect(list.map((i) => i.y)).toEqual([0.1 + SURGE, 0.4 + SURGE, 0.97 + SURGE]);
    expect(list[1].y - list[0].y).toBeCloseTo(0.3);
    expect(advance(list, 0, 20_000).map((i) => i.word.mt)).toEqual(['c']);
  });
});

describe('spawnDue', () => {
  const spec = waveSpec(1);

  it('waits for the gap while words are on the field', () => {
    const field = [inv(word('a'), 0, 0.3)];
    expect(spawnDue(spec, field, 3, spec.gapMs - 1)).toBe(false);
    expect(spawnDue(spec, field, 3, spec.gapMs)).toBe(true);
  });

  it('brings the next word quickly onto an empty field', () => {
    expect(spawnDue(spec, [], 3, QUICK_SPAWN_MS - 1)).toBe(false);
    expect(spawnDue(spec, [], 3, QUICK_SPAWN_MS)).toBe(true);
  });

  it('respects the most words on screen', () => {
    const full = [inv(word('a'), 0, 0.5), inv(word('b'), 1, 0.3)];
    expect(full.length).toBe(spec.onScreen);
    expect(spawnDue(spec, full, 3, 60_000)).toBe(false);
  });

  it('stops when the wave has no words left to send', () => {
    expect(spawnDue(spec, [], 0, 60_000)).toBe(false);
  });
});

describe('pickLane', () => {
  it('never picks a lane with a word near the top', () => {
    const field = [inv(word('a'), 0, 0.05), inv(word('b'), 1, 0.5)];
    for (let s = 1; s < 50; s++) expect(pickLane(2, field, 0.1, seeded(s))).toBe(1);
  });

  it('prefers the emptiest lane', () => {
    const field = [inv(word('a'), 0, 0.5), inv(word('b'), 1, 0.5), inv(word('c'), 1, 0.8)];
    for (let s = 1; s < 50; s++) expect(pickLane(3, field, 0.1, seeded(s))).toBe(2);
  });

  it('gives null when every lane is blocked', () => {
    const field = [inv(word('a'), 0, 0.02), inv(word('b'), 1, 0.09)];
    expect(pickLane(2, field, 0.1)).toBeNull();
  });

  it('uses every lane on an empty field', () => {
    const lanes = new Set(Array.from({ length: 60 }, (_, s) => pickLane(3, [], 0.1, seeded(s + 1))));
    expect(lanes).toEqual(new Set([0, 1, 2]));
  });
});

describe('fillTray', () => {
  const pool = hiveWords(WORDS, 'x2mt', 'both');
  const sameText = (a: Word, b: Word) => a.mt === b.mt || a.pl === b.pl || a.en === b.en;

  const check = (tray: Word[], field: Invader[], size: number) => {
    expect(tray).toHaveLength(size);
    for (const i of field) expect(tray.filter((w) => w.id === i.word.id)).toHaveLength(1);
    for (let a = 0; a < tray.length; a++) for (let b = a + 1; b < tray.length; b++) expect(sameText(tray[a], tray[b])).toBe(false);
    for (const w of tray) for (const i of field) if (w.id !== i.word.id) expect(sameText(w, i.word)).toBe(false);
  };

  it('over many seeded runs: always full, every answer once, nothing that could be confused', () => {
    for (let s = 1; s <= 150; s++) {
      const rng = seeded(s);
      const size = s % 2 ? 4 : 6;
      const field: Invader[] = [];
      let tray: (Word | null)[] = [];
      for (let turn = 0; turn < 12; turn++) {
        // A word enters, or (sometimes, with a full field) one leaves and its chip empties.
        if (field.length > 0 && (field.length >= 4 || rng() < 0.4)) {
          const gone = field.splice(Math.floor(rng() * field.length), 1)[0];
          tray = tray.map((w) => (w && w.id === gone.word.id ? null : w));
        } else {
          let w = pool[Math.floor(rng() * pool.length)];
          while (!canEnter(w, field)) w = pool[Math.floor(rng() * pool.length)];
          field.push(inv(w));
        }
        const before = tray;
        tray = fillTray(tray, field, pool, size, rng, (c) => similarity(c.mt, field[field.length - 1]?.word.mt ?? ''));
        check(tray as Word[], field, size);
        // Chips that were valid answers keep their slots.
        before.forEach((w, k) => {
          if (w && field.some((i) => i.word.id === w.id)) expect(tray[k]).toBe(w);
        });
      }
    }
  });

  it('keeps untouched chips in their slots and fills only the empty one', () => {
    const rng = seeded(7);
    const field = [inv(pool[0]), inv(pool[1])];
    const first = fillTray([], field, pool, 4, rng);
    const emptied = [...first];
    const decoy = first.findIndex((w) => w.id !== pool[0].id && w.id !== pool[1].id);
    emptied[decoy] = null as unknown as Word;
    const next = fillTray(emptied, field, pool, 4, rng);
    next.forEach((w, k) => {
      if (k !== decoy) expect(w).toBe(first[k]);
    });
    check(next, field, 4);
  });

  it('turns a decoy into the answer when its word enters the field', () => {
    const rng = seeded(3);
    const tray = fillTray([], [inv(pool[0])], pool, 4, rng);
    const decoy = tray.find((w) => w.id !== pool[0].id)!;
    const field = [inv(pool[0]), inv(decoy)];
    expect(fillTray(tray, field, pool, 4, rng)).toEqual(tray);
  });

  it('puts a new answer over a decoy when no slot is empty', () => {
    const rng = seeded(5);
    const tray = fillTray([], [inv(pool[0])], pool, 4, rng);
    const newcomer = pool.find((w) => !tray.includes(w) && tray.every((t) => !sameText(t, w)))!;
    const next = fillTray(tray, [inv(pool[0]), inv(newcomer)], pool, 4, rng);
    expect(next.filter((w, k) => w !== tray[k])).toEqual([newcomer]);
  });

  it('drops a decoy that shares a side with a word that entered', () => {
    const a = word('a', 't', 'kot', 'cat');
    const b = word('b', 't', 'pies', 'dog');
    const twin = word('c', 't', 'pies', 'hound');
    const others = Array.from({ length: 10 }, (_, k) => word(`x${k}`));
    const tray = fillTray([a, b, others[0], others[1]], [inv(a)], [a, b, twin, ...others], 4);
    expect(tray).toContain(b);
    const next = fillTray(tray, [inv(a), inv(twin)], [a, b, twin, ...others], 4);
    expect(next).not.toContain(b);
    expect(next).toContain(twin);
  });

  it('grows from 4 chips to 6 and keeps the four', () => {
    const rng = seeded(11);
    const field = [inv(pool[0]), inv(pool[1])];
    const four = fillTray([], field, pool, 4, rng);
    const six = fillTray(four, field, pool, 6, rng);
    check(six, field, 6);
    expect(six.slice(0, 4)).toEqual(four);
  });

  it('takes decoys from the field’s topic first', () => {
    const topic = pool[0].topic;
    const inTopic = pool.filter((w) => w.topic === topic);
    expect(inTopic.length).toBeGreaterThan(6);
    const tray = fillTray([], [inv(pool[0])], pool, 4, seeded(9));
    for (const w of tray) expect(w.topic).toBe(topic);
  });
});

describe('laneCount', () => {
  it('gives a phone two lanes and a wide field three', () => {
    expect(laneCount(358)).toBe(2);
    expect(laneCount(THREE_LANES_FROM - 1)).toBe(2);
    expect(laneCount(THREE_LANES_FROM)).toBe(3);
    expect(laneCount(528)).toBe(3);
  });
});

describe('clash and canEnter', () => {
  it('a word clashes with another sharing any side, never with itself', () => {
    const a = word('a', 't', 'kot', 'cat');
    expect(clash(a, a)).toBe(false);
    expect(clash(a, word('b', 't', 'kot', 'tomcat'))).toBe(true);
    expect(clash(a, word('b', 't', 'kotek', 'cat'))).toBe(true);
    expect(clash(a, word('b'))).toBe(false);
  });

  it('keeps a word off the field while it, or a word like it, is there', () => {
    const a = word('a', 't', 'kot', 'cat');
    expect(canEnter(a, [inv(a)])).toBe(false);
    expect(canEnter(word('b', 't', 'kot', 'x'), [inv(a)])).toBe(false);
    expect(canEnter(word('b'), [inv(a)])).toBe(true);
  });
});

describe('honeyAfterWave', () => {
  it('gives a cell back after a clean wave, never above the full pot', () => {
    expect(honeyAfterWave(1, 0)).toBe(2);
    expect(honeyAfterWave(HONEY, 0)).toBe(HONEY);
    expect(honeyAfterWave(2, 1)).toBe(2);
    expect(honeyAfterWave(1, 3)).toBe(1);
  });
});
