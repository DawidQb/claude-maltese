import { describe, expect, it } from 'vitest';
import { emptyData, newLeft, recordAnswer, sanitize } from './store';

const TODAY = '2026-03-10';

describe('recordAnswer', () => {
  it('saves the card, counts the new word, and starts the streak', () => {
    const next = recordAnswer(emptyData(), 'mt2x', 'ħobż', 'knew', TODAY);
    expect(next.cards['mt2x:ħobż']).toEqual({ box: 1, due: '2026-03-11' });
    expect(next.introduced).toEqual({ date: TODAY, mt2x: 1, x2mt: 0 });
    expect(next.streak).toEqual({ count: 1, last: TODAY });
    expect(newLeft(next, 'mt2x', TODAY)).toBe(9);
    expect(newLeft(next, 'x2mt', TODAY)).toBe(10);
  });

  it('does not count a review as a new word', () => {
    const first = recordAnswer(emptyData(), 'mt2x', 'ħobż', 'knew', TODAY);
    const second = recordAnswer(first, 'mt2x', 'ħobż', 'knew', '2026-03-11');
    expect(second.introduced).toEqual({ date: '2026-03-11', mt2x: 0, x2mt: 0 });
    expect(second.cards['mt2x:ħobż'].box).toBe(2);
    expect(second.streak.count).toBe(2);
  });

  it('resets the daily new-word allowance on a new day', () => {
    const first = recordAnswer(emptyData(), 'mt2x', 'ħobż', 'knew', TODAY);
    expect(newLeft(first, 'mt2x', '2026-03-11')).toBe(10);
  });
});

describe('sanitize', () => {
  it('round-trips valid data', () => {
    const data = recordAnswer(emptyData(), 'x2mt', 'ilma', 'almost', TODAY);
    expect(sanitize(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('rejects files that are not app data', () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize('hello')).toBeNull();
    expect(sanitize({ version: 2, cards: {} })).toBeNull();
    expect(sanitize({ version: 1 })).toBeNull();
  });

  it('drops malformed cards and repairs settings', () => {
    const out = sanitize({
      version: 1,
      cards: {
        'mt2x:ilma': { box: 9, due: '2026-03-11' },
        'mt2x:bad': { box: 'x', due: '2026-03-11' },
        'other:ilma': { box: 1, due: '2026-03-11' },
        'x2mt:dar': { box: 2, due: 'soon' },
      },
      settings: { newPerDay: -4, show: 'de', direction: 'x2mt', topic: 'Dinosaurs', typing: 'yes' },
    });
    expect(out?.cards).toEqual({ 'mt2x:ilma': { box: 5, due: '2026-03-11' } });
    expect(out?.settings).toEqual({ newPerDay: 10, show: 'both', direction: 'x2mt', topic: 'all', typing: false, plurals: true });
  });

  it('fills in settings added after a progress file was saved', () => {
    const out = sanitize({ version: 1, cards: {}, settings: { newPerDay: 5, show: 'pl', direction: 'mt2x' } });
    expect(out?.settings).toEqual({ newPerDay: 5, show: 'pl', direction: 'mt2x', topic: 'all', typing: false, plurals: true });
  });

  it('keeps the speed-round record and ignores a broken one', () => {
    expect(sanitize({ version: 1, cards: {}, games: { speedBest: 17 } })?.games).toEqual({ speedBest: 17 });
    expect(sanitize({ version: 1, cards: {}, games: { speedBest: 'lots' } })?.games).toEqual({ speedBest: 0 });
    expect(sanitize({ version: 1, cards: {} })?.games).toEqual({ speedBest: 0 });
  });

  it('keeps a valid topic and the typing switch', () => {
    const out = sanitize({ version: 1, cards: {}, settings: { topic: 'Numbers', typing: true } });
    expect(out?.settings.topic).toBe('Numbers');
    expect(out?.settings.typing).toBe(true);
  });

  it('keeps plural forms switched off when saved that way', () => {
    expect(sanitize({ version: 1, cards: {}, settings: { plurals: false } })?.settings.plurals).toBe(false);
    expect(sanitize({ version: 1, cards: {}, settings: { plurals: 'no' } })?.settings.plurals).toBe(true);
  });
});
