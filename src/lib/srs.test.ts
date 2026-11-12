import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyGrade,
  buildSession,
  bumpStreak,
  cardKey,
  countDue,
  countNew,
  currentStreak,
  type CardState,
} from './srs';
import { ALL_TOPICS, TOPICS, WORDS, topicsWith, wordsInTopic } from './words';

const TODAY = '2026-03-10';
const same = <T,>(x: T[]) => x;

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is unaffected by daylight-saving changes', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
});

describe('applyGrade', () => {
  it('moves a new word to box 1, due tomorrow, when known', () => {
    expect(applyGrade(undefined, 'knew', TODAY)).toEqual({ box: 1, due: '2026-03-11' });
  });

  it('moves up one box per "knew", with growing gaps, capped at box 5', () => {
    let s: CardState | undefined;
    const dues: string[] = [];
    for (let i = 0; i < 6; i++) {
      s = applyGrade(s, 'knew', TODAY);
      dues.push(s.due);
    }
    expect(dues).toEqual(['2026-03-11', '2026-03-13', '2026-03-17', '2026-03-24', '2026-04-09', '2026-04-09']);
    expect(s?.box).toBe(5);
  });

  it('keeps the box on "almost" and brings the word back tomorrow', () => {
    expect(applyGrade({ box: 4, due: TODAY }, 'almost', TODAY)).toEqual({ box: 4, due: '2026-03-11' });
    expect(applyGrade(undefined, 'almost', TODAY)).toEqual({ box: 1, due: '2026-03-11' });
  });

  it('drops to box 1 on "no"', () => {
    expect(applyGrade({ box: 5, due: TODAY }, 'no', TODAY)).toEqual({ box: 1, due: '2026-03-11' });
  });
});

describe('sessions', () => {
  const wordIds = ['a', 'b', 'c', 'd', 'e'];
  const cards: Record<string, CardState> = {
    [cardKey('mt2x', 'a')]: { box: 2, due: '2026-03-09' },
    [cardKey('mt2x', 'b')]: { box: 1, due: TODAY },
    [cardKey('mt2x', 'c')]: { box: 3, due: '2026-03-11' },
    [cardKey('x2mt', 'd')]: { box: 1, due: TODAY },
  };

  it('puts due reviews first, then new words up to the daily limit', () => {
    const session = buildSession({ wordIds, cards, dir: 'mt2x', today: TODAY, newLeft: 1, shuffle: same });
    expect(session).toEqual(['a', 'b', 'd']);
  });

  it('tracks each direction separately', () => {
    const session = buildSession({ wordIds, cards, dir: 'x2mt', today: TODAY, newLeft: 10, shuffle: same });
    expect(session).toEqual(['d', 'a', 'b', 'c', 'e']);
  });

  it('adds no new words once the daily limit is used up', () => {
    const session = buildSession({ wordIds, cards, dir: 'mt2x', today: TODAY, newLeft: 0, shuffle: same });
    expect(session).toEqual(['a', 'b']);
  });

  it('counts due and new words', () => {
    expect(countDue({ wordIds, cards, dir: 'mt2x', today: TODAY })).toBe(2);
    expect(countNew({ wordIds, cards, dir: 'mt2x', today: TODAY, newLeft: 10 })).toBe(2);
    expect(countNew({ wordIds, cards, dir: 'mt2x', today: TODAY, newLeft: 1 })).toBe(1);
    expect(countNew({ wordIds, cards, dir: 'mt2x', today: TODAY, newLeft: -3 })).toBe(0);
  });
});

describe('streak', () => {
  it('starts, continues, and resets', () => {
    let s = bumpStreak({ count: 0, last: null }, '2026-03-08');
    expect(s).toEqual({ count: 1, last: '2026-03-08' });
    s = bumpStreak(s, '2026-03-08');
    expect(s.count).toBe(1);
    s = bumpStreak(s, '2026-03-09');
    expect(s.count).toBe(2);
    s = bumpStreak(s, '2026-03-12');
    expect(s).toEqual({ count: 1, last: '2026-03-12' });
  });

  it('shows zero after a missed day', () => {
    const s = { count: 4, last: '2026-03-08' };
    expect(currentStreak(s, '2026-03-08')).toBe(4);
    expect(currentStreak(s, '2026-03-09')).toBe(4);
    expect(currentStreak(s, '2026-03-10')).toBe(0);
  });
});

describe('seed deck', () => {
  it('has unique ids and complete entries', () => {
    expect(new Set(WORDS.map((w) => w.id)).size).toBe(WORDS.length);
    for (const w of WORDS) {
      expect(w.mt.trim(), w.id).not.toBe('');
      expect(w.pl.trim(), w.id).not.toBe('');
      expect(w.en.trim(), w.id).not.toBe('');
    }
    expect(WORDS.length).toBeGreaterThanOrEqual(800);
    expect(TOPICS.length).toBeGreaterThan(5);
  });

  it('never repeats a Polish or English translation, so no question has two right answers', () => {
    expect(new Set(WORDS.map((w) => w.pl)).size).toBe(WORDS.length);
    expect(new Set(WORDS.map((w) => w.en)).size).toBe(WORDS.length);
  });

  it('links each plural form to its singular, right after it in the same topic', () => {
    const plurals = WORDS.filter((w) => w.pluralOf);
    expect(plurals.length).toBeGreaterThan(150);
    for (const p of plurals) {
      const i = WORDS.indexOf(p);
      const singular = WORDS[i - 1];
      expect(singular.id, p.id).toBe(p.pluralOf);
      expect(singular.plural, p.id).toBe(p.id);
      expect(singular.topic, p.id).toBe(p.topic);
    }
  });

  it('can leave plural forms out', () => {
    const without = wordsInTopic('Home & things', { plurals: false });
    expect(without.some((w) => w.pluralOf)).toBe(false);
    expect(without.find((w) => w.id === 'ktieb')?.plural).toBe('kotba');
    expect(wordsInTopic('Home & things').length).toBeGreaterThan(without.length);
    expect(wordsInTopic(ALL_TOPICS).length).toBe(WORDS.length);
  });

  it('links every verb form to a verb in the Verbs topic', () => {
    const verbs = new Set(wordsInTopic('Verbs').map((w) => w.id));
    const forms = WORDS.filter((w) => w.formOf);
    expect(forms.length).toBeGreaterThan(300);
    for (const f of forms) expect(verbs.has(f.formOf!), f.id).toBe(true);
    // Every verb has at least one form.
    expect(new Set(forms.map((f) => f.formOf))).toEqual(verbs);
  });

  it('can leave verb forms out, which removes that topic', () => {
    expect(wordsInTopic(ALL_TOPICS, { verbForms: false }).some((w) => w.formOf)).toBe(false);
    expect(topicsWith({ verbForms: false })).not.toContain('Verb forms');
    expect(topicsWith({})).toContain('Verb forms');
  });
});
