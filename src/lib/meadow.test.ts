import { describe, expect, it } from 'vitest';
import type { Rng } from './games';
import {
  CARRY_MS,
  carrierPos,
  FEED_MS,
  FIRST_MS,
  FRESH_AHEAD,
  hold,
  landingPoint,
  meadowWeights,
  MIN_GAP,
  newCycle,
  newMeadow,
  NO_REPEAT,
  PACE,
  PACES,
  pickWord,
  placeFlowers,
  SHOW_MS,
  showEarly,
  stepCycle,
  stepMeadow,
  WEIGHT,
  type Cycle,
  type Pace,
} from './meadow';
import { addDays, cardKey, type CardState } from './srs';
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

const today = '2026-11-13';
const word = (mt: string): Word => ({ id: mt, mt, pl: `${mt}-pl`, en: `${mt}-en`, topic: 't' });
const weightOf = (w: Word, card: CardState) => meadowWeights([w], { [cardKey('mt2x', w.id)]: card }, 'mt2x', today)[0]?.weight;

describe('meadowWeights', () => {
  const w = word('kelb');

  it('weighs a card by how shaky it is and how soon it comes back', () => {
    expect(weightOf(w, { box: 1, due: addDays(today, 1) })).toBe(WEIGHT.shaky);
    expect(weightOf(w, { box: 4, due: addDays(today, 1) })).toBe(WEIGHT.soon);
    expect(weightOf(w, { box: 4, due: addDays(today, -2) })).toBe(WEIGHT.soon);
    expect(weightOf(w, { box: 4, due: addDays(today, 10) })).toBe(WEIGHT.known);
    // Shaky and due: the larger weight.
    expect(weightOf(w, { box: 2, due: today })).toBe(WEIGHT.shaky);
    expect(WEIGHT).toEqual({ shaky: 6, soon: 4, fresh: 2, known: 1 });
  });

  it('without cards, gives the first twenty words in deck order and leaves out the rest', () => {
    const out = meadowWeights(WORDS, {}, 'mt2x', today);
    expect(out.map((o) => o.word)).toEqual(WORDS.slice(0, FRESH_AHEAD));
    for (const o of out) expect(o.weight).toBe(WEIGHT.fresh);
  });

  it('counts only the cards of the direction shown', () => {
    const cards: Record<string, CardState> = {};
    for (const x of WORDS.slice(0, 40)) cards[cardKey('x2mt', x.id)] = { box: 1, due: today };
    expect(meadowWeights(WORDS, cards, 'mt2x', today)).toEqual(meadowWeights(WORDS, {}, 'mt2x', today));
  });

  it('skips words with cards when counting the next twenty new ones', () => {
    const cards = { [cardKey('mt2x', WORDS[0].id)]: { box: 4, due: addDays(today, 20) } };
    const out = meadowWeights(WORDS, cards, 'mt2x', today);
    expect(out[0]).toEqual({ word: WORDS[0], weight: WEIGHT.known });
    expect(out.filter((o) => o.weight === WEIGHT.fresh).map((o) => o.word)).toEqual(WORDS.slice(1, FRESH_AHEAD + 1));
  });
});

describe('pickWord', () => {
  const pool = Array.from({ length: 30 }, (_, i) => ({ word: word(`w${i}`), weight: i === 0 ? 6 : 1 }));

  it('never draws one of the last twelve', () => {
    const rng = seeded(3);
    const recent: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const w = pickWord(pool, recent, rng);
      expect(recent.slice(-NO_REPEAT)).not.toContain(w.id);
      recent.push(w.id);
    }
  });

  it('draws by weight: a weight-6 word about six times as often as a weight-1 word', () => {
    const rng = seeded(5);
    const counts = new Map<string, number>();
    for (let i = 0; i < 35_000; i++) {
      const w = pickWord(pool, [], rng);
      counts.set(w.id, (counts.get(w.id) ?? 0) + 1);
    }
    const others = [...counts].filter(([id]) => id !== 'w0').map(([, n]) => n);
    const ratio = counts.get('w0')! / (others.reduce((a, b) => a + b, 0) / others.length);
    expect(ratio).toBeGreaterThan(5);
    expect(ratio).toBeLessThan(7);
  });

  it('works with a pool of three, never the same word twice running, and with one', () => {
    const three = ['a', 'b', 'c'].map((id) => ({ word: word(id), weight: 1 }));
    const rng = seeded(9);
    const recent: string[] = [];
    for (let i = 0; i < 300; i++) {
      const w = pickWord(three, recent, rng);
      if (recent.length) expect(w.id).not.toBe(recent[recent.length - 1]);
      recent.push(w.id);
    }
    expect(pickWord([{ word: word('x'), weight: 1 }], ['x'], rng).id).toBe('x');
  });
});

describe('stepCycle', () => {
  /** Runs the cycle in 50 ms steps until the phase changes; the time it took and what was reported. */
  function until(cycle: Cycle, pace: Pace) {
    let ms = 0;
    const entered: string[] = [];
    for (;;) {
      const r = stepCycle(cycle, 50, pace);
      ms += 50;
      if (r.entered) entered.push(r.entered);
      if (r.cycle.phase !== cycle.phase) return { cycle: r.cycle, ms, entered };
      cycle = r.cycle;
    }
  }

  it('goes gap, carry, shown, gap after the right times, at every pace, reporting each change once', () => {
    for (const pace of PACES) {
      let r = until(newCycle(), pace);
      expect([r.cycle.phase, r.ms, r.entered]).toEqual(['carry', FIRST_MS, ['carry']]);
      r = until(r.cycle, pace);
      expect([r.cycle.phase, r.ms, r.entered]).toEqual(['shown', CARRY_MS, ['shown']]);
      r = until(r.cycle, pace);
      expect([r.cycle.phase, r.ms, r.entered]).toEqual(['gap', SHOW_MS, ['gap']]);
      r = until(r.cycle, pace);
      expect([r.cycle.phase, r.ms]).toEqual(['carry', PACE[pace]]);
    }
  });

  it('holds a shown word until released, then shows it in full again', () => {
    let cycle: Cycle = { phase: 'shown', leftMs: 1000, held: false, early: false };
    cycle = hold(cycle);
    for (let i = 0; i < 1000; i++) cycle = stepCycle(cycle, 50, 'normal').cycle;
    expect(cycle).toEqual({ phase: 'shown', leftMs: 1000, held: true, early: false });
    cycle = hold(cycle);
    expect(cycle).toEqual({ phase: 'shown', leftMs: SHOW_MS, held: false, early: false });
    expect(hold(newCycle())).toEqual(newCycle());
  });

  it('shows the meaning early only while the word is carried', () => {
    const carry: Cycle = { phase: 'carry', leftMs: 2000, held: false, early: false };
    expect(showEarly(carry).early).toBe(true);
    const gap = newCycle();
    expect(showEarly(gap)).toBe(gap);
    const shown: Cycle = { phase: 'shown', leftMs: 2000, held: false, early: false };
    expect(showEarly(shown)).toBe(shown);
  });
});

describe('placeFlowers', () => {
  it('places three, four and five flowers inside the field, never too close', () => {
    for (const [width, n] of [
      [390, 3],
      [600, 4],
      [900, 5],
    ]) {
      for (let seed = 1; seed <= 100; seed++) {
        const flowers = placeFlowers(width, 500, seeded(seed));
        expect(flowers).toHaveLength(n);
        for (const f of flowers) {
          expect(f.x - f.r).toBeGreaterThanOrEqual(0);
          expect(f.x + f.r).toBeLessThanOrEqual(width);
          expect(f.headY).toBeGreaterThanOrEqual(500 * 0.45);
          expect(f.headY).toBeLessThanOrEqual(500 * 0.7);
          expect(f.baseY).toBeLessThanOrEqual(500);
        }
        for (let i = 1; i < flowers.length; i++) expect(flowers[i].x - flowers[i - 1].x).toBeGreaterThanOrEqual(MIN_GAP);
      }
    }
  });
});

describe('carrierPos', () => {
  it('starts at from, ends at to, and rises above the straight line on the way', () => {
    const from = { x: -20, y: 100 };
    const to = { x: 300, y: 260 };
    expect(carrierPos(from, to, 0)).toEqual(from);
    expect(carrierPos(from, to, 1)).toEqual(to);
    const mid = carrierPos(from, to, 0.5);
    const lineY = from.y + ((mid.x - from.x) / (to.x - from.x)) * (to.y - from.y);
    expect(mid.y).toBeLessThan(lineY);
  });
});

describe('stepMeadow', () => {
  it('never puts two bees on one flower, nor one on the taken flower, and feeding ends after FEED_MS', () => {
    const rng = seeded(11);
    const width = 390;
    const height = 600;
    const flowers = placeFlowers(width, height, rng);
    const bees = newMeadow(width, height, rng);
    expect(bees.length).toBeGreaterThanOrEqual(4);
    expect(bees.length).toBeLessThanOrEqual(10);
    const fedFor = new Map<object, number>();
    let feeds = 0;
    let taken: number | null = null;
    for (let step = 0; step < 20_000; step++) {
      if (step % 2000 === 0) taken = taken === null ? step % flowers.length : null;
      stepMeadow(bees, flowers, taken, 50, width, height, rng);
      const on = bees.filter((b) => b.flower !== null).map((b) => b.flower);
      expect(new Set(on).size).toBe(on.length);
      if (taken !== null) expect(on).not.toContain(taken);
      for (const b of bees) {
        if (b.state === 'feeding') {
          const n = (fedFor.get(b) ?? 0) + 50;
          fedFor.set(b, n);
          expect(n).toBeLessThanOrEqual(FEED_MS);
          const at = landingPoint(flowers[b.flower!]);
          expect([b.x, b.y]).toEqual([at.x, at.y]);
        } else if (fedFor.has(b)) {
          feeds += 1;
          fedFor.delete(b);
        }
      }
    }
    // About one visit every nine seconds over 1000 seconds.
    expect(feeds).toBeGreaterThan(50);
  });
});
