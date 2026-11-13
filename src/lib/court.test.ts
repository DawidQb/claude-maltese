import { describe, expect, it } from 'vitest';
import {
  AUDIENCES,
  courtVerbs,
  LOOKALIKE_POOL,
  makeOrder,
  MIN_FORMS,
  ORDERS,
  paradigm,
  planAudience,
  planRun,
  WALK,
  walkMs,
  WORKERS,
  type Verb,
} from './court';
import type { Rng } from './games';
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

const word = (mt: string, formOf?: string): Word => ({ id: mt, mt, pl: `${mt}-pl`, en: `${mt}-en`, topic: 't', formOf });
const forms = (verb: string, n: number) => Array.from({ length: n }, (_, i) => word(`${verb}${i}`, verb));

describe('courtVerbs', () => {
  it('keeps verbs with enough forms and a dictionary row, in deck order', () => {
    const deck = [
      word('ghad'),
      ...forms('tlieta', 3),
      word('tlieta'),
      word('erba'),
      ...forms('erba', 4),
      ...forms('nieqes', 6),
      word('kbir'),
      ...forms('kbir', 7),
    ];
    // 'tlieta' has three forms, 'nieqes' has no row of its own: both are out.
    const verbs = courtVerbs(deck);
    expect(verbs.map((v) => v.verb.id)).toEqual(['erba', 'kbir']);
    expect(verbs[0].forms.map((w) => w.id)).toEqual(['erba0', 'erba1', 'erba2', 'erba3']);
    expect(verbs[1].forms).toHaveLength(7);
  });

  it('follows the deck when forms come before their verb', () => {
    const deck = [...forms('b', 4), word('a'), ...forms('a', 4), word('b')];
    expect(courtVerbs(deck).map((v) => v.verb.id)).toEqual(['a', 'b']);
  });

  it('finds 24 verbs in the shipped deck, each with at least four forms of its own', () => {
    const verbs = courtVerbs(WORDS);
    expect(verbs).toHaveLength(24);
    expect(verbs.reduce((n, v) => n + v.forms.length, 0)).toBe(260);
    for (const v of verbs) {
      expect(v.forms.length).toBeGreaterThanOrEqual(MIN_FORMS);
      expect(v.verb.formOf).toBeUndefined();
      for (const f of v.forms) expect(f.formOf).toBe(v.verb.id);
    }
  });

  it('every order in the shipped deck has exactly one right form: translations are unique within a verb', () => {
    for (const v of courtVerbs(WORDS)) {
      expect(new Set(v.forms.map((f) => f.mt)).size).toBe(v.forms.length);
      expect(new Set(v.forms.map((f) => f.pl)).size).toBe(v.forms.length);
      expect(new Set(v.forms.map((f) => f.en)).size).toBe(v.forms.length);
    }
  });
});

describe('planRun', () => {
  it('takes four different verbs, or all there are', () => {
    const verbs = courtVerbs(WORDS);
    for (let seed = 1; seed <= 50; seed++) {
      const run = planRun(verbs, seeded(seed));
      expect(run).toHaveLength(AUDIENCES);
      expect(new Set(run.map((v) => v.verb.id)).size).toBe(AUDIENCES);
    }
    expect(planRun(verbs.slice(0, 2), seeded(1))).toHaveLength(2);
    expect(planRun([], seeded(1))).toEqual([]);
  });
});

describe('planAudience', () => {
  const verbs = courtVerbs(WORDS);
  const kiel = verbs.find((v) => v.verb.id === 'kiel')!;

  it('asks five different forms, all of that verb', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const asked = planAudience(kiel, seeded(seed));
      expect(asked).toHaveLength(ORDERS);
      expect(new Set(asked.map((w) => w.id)).size).toBe(ORDERS);
      for (const w of asked) expect(w.formOf).toBe('kiel');
    }
  });

  it('asks every form of a four-form verb', () => {
    const small: Verb = { verb: word('erba'), forms: forms('erba', 4) };
    const asked = planAudience(small, seeded(3));
    expect(asked).toHaveLength(4);
    expect(new Set(asked.map((w) => w.id))).toEqual(new Set(small.forms.map((w) => w.id)));
  });
});

describe('makeOrder', () => {
  const verbs = courtVerbs(WORDS);

  it('gives four options of the same verb, the answer exactly once', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = seeded(seed);
      const verb = verbs[Math.floor(rng() * verbs.length)];
      const form = verb.forms[Math.floor(rng() * verb.forms.length)];
      const order = makeOrder(verb, form, seed % 7, rng);
      expect(order.answer).toBe(form);
      expect(order.options).toHaveLength(WORKERS);
      expect(order.options.filter((w) => w.id === form.id)).toHaveLength(1);
      expect(new Set(order.options.map((w) => w.id)).size).toBe(WORKERS);
      for (const w of order.options) expect(w.formOf).toBe(verb.verb.id);
    }
  });

  it('from a run of three, picks the wrong forms from the four most like the answer', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = seeded(seed);
      const verb = verbs[Math.floor(rng() * verbs.length)];
      const form = verb.forms[Math.floor(rng() * verb.forms.length)];
      const scores = verb.forms
        .filter((w) => w.id !== form.id)
        .map((w) => similarity(w.mt, form.mt))
        .sort((a, b) => b - a);
      const floor = scores[LOOKALIKE_POOL - 1];
      const order = makeOrder(verb, form, 3, rng);
      for (const w of order.options) {
        if (w.id !== form.id) expect(similarity(w.mt, form.mt)).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('below a run of three, sometimes picks forms that look nothing like the answer', () => {
    const kiel = verbs.find((v) => v.verb.id === 'kiel')!;
    const kielu = kiel.forms.find((w) => w.id === 'kielu')!;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) for (const w of makeOrder(kiel, kielu, 0, seeded(seed)).options) seen.add(w.id);
    expect(seen.size).toBe(kiel.forms.length);
  });

  it('works for a verb with only four forms', () => {
    const small: Verb = { verb: word('erba'), forms: forms('erba', 4) };
    const order = makeOrder(small, small.forms[2], 5, seeded(9));
    expect(new Set(order.options.map((w) => w.id))).toEqual(new Set(small.forms.map((w) => w.id)));
  });
});

describe('walkMs', () => {
  it('starts at 12 s, gets shorter with each right answer, never under 8 s', () => {
    expect(walkMs(0)).toBe(WALK.start);
    expect(walkMs(0)).toBe(12_000);
    expect(walkMs(1)).toBe(11_750);
    expect(walkMs(4)).toBe(11_000);
    expect(walkMs(16)).toBe(8_000);
    expect(walkMs(100)).toBe(8_000);
    for (let r = 0; r <= 100; r++) expect(walkMs(r)).toBeGreaterThanOrEqual(WALK.min);
  });
});

describe('paradigm', () => {
  it('marks each form by its order, in deck order', () => {
    const verb: Verb = { verb: word('kiteb'), forms: forms('kiteb', 6) };
    const asked = new Map([
      ['kiteb4', true],
      ['kiteb1', false],
      ['kiteb2', true],
    ]);
    expect(paradigm(verb, asked).map((r) => [r.form.id, r.state])).toEqual([
      ['kiteb0', 'unasked'],
      ['kiteb1', 'wrong'],
      ['kiteb2', 'right'],
      ['kiteb3', 'unasked'],
      ['kiteb4', 'right'],
      ['kiteb5', 'unasked'],
    ]);
  });
});
