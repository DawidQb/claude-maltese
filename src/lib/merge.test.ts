import { describe, expect, it } from 'vitest';
import { mergeCard, mergeData, mergeIntroduced, mergeStreak, sameProgress, takeProgress } from './merge';
import { emptyData, recordAnswer } from './store';

describe('mergeCard', () => {
  it('keeps the state with the later due date', () => {
    // Missed on another device today: box 1, due tomorrow, beats the older box 3 due today.
    expect(mergeCard({ box: 3, due: '2026-03-10' }, { box: 1, due: '2026-03-11' })).toEqual({ box: 1, due: '2026-03-11' });
    expect(mergeCard({ box: 4, due: '2026-03-20' }, { box: 2, due: '2026-03-12' })).toEqual({ box: 4, due: '2026-03-20' });
  });

  it('breaks a tie by the higher box and keeps a card only one side has', () => {
    expect(mergeCard({ box: 1, due: '2026-03-11' }, { box: 2, due: '2026-03-11' })).toEqual({ box: 2, due: '2026-03-11' });
    expect(mergeCard(undefined, { box: 2, due: '2026-03-11' })).toEqual({ box: 2, due: '2026-03-11' });
    expect(mergeCard({ box: 2, due: '2026-03-11' }, undefined)).toEqual({ box: 2, due: '2026-03-11' });
  });
});

describe('mergeStreak and mergeIntroduced', () => {
  it('keeps the streak from the later day', () => {
    expect(mergeStreak({ count: 5, last: '2026-03-09' }, { count: 1, last: '2026-03-10' })).toEqual({ count: 1, last: '2026-03-10' });
    expect(mergeStreak({ count: 2, last: '2026-03-10' }, { count: 3, last: '2026-03-10' })).toEqual({ count: 3, last: '2026-03-10' });
    expect(mergeStreak({ count: 0, last: null }, { count: 3, last: '2026-03-10' })).toEqual({ count: 3, last: '2026-03-10' });
  });

  it('counts new words from the later day, and the larger count on the same day', () => {
    expect(mergeIntroduced({ date: '2026-03-09', mt2x: 9, x2mt: 0 }, { date: '2026-03-10', mt2x: 1, x2mt: 0 })).toEqual({ date: '2026-03-10', mt2x: 1, x2mt: 0 });
    expect(mergeIntroduced({ date: '2026-03-10', mt2x: 4, x2mt: 0 }, { date: '2026-03-10', mt2x: 2, x2mt: 3 })).toEqual({ date: '2026-03-10', mt2x: 4, x2mt: 3 });
  });
});

describe('mergeData', () => {
  const phone = recordAnswer(emptyData(), 'mt2x', 'ħobż', 'knew', '2026-03-10');
  const laptop = recordAnswer({ ...emptyData(), games: { speedBest: 12, hiveBest: 0, queenBest: 0, stingBest: 0 } }, 'x2mt', 'ilma', 'no', '2026-03-10');

  it('keeps cards from both sides, the best game record and its own settings', () => {
    const laptopSettings = { ...laptop, settings: { ...laptop.settings, typing: true } };
    const merged = mergeData(laptopSettings, phone);
    expect(Object.keys(merged.cards).sort()).toEqual(['mt2x:ħobż', 'x2mt:ilma']);
    expect(merged.games.speedBest).toBe(12);
    expect(merged.settings.typing).toBe(true);
  });

  it('keeps the larger Protect the hive record from either side', () => {
    const a = { ...phone, games: { speedBest: 3, hiveBest: 40, queenBest: 0, stingBest: 0 } };
    const b = { ...laptop, games: { speedBest: 9, hiveBest: 25, queenBest: 0, stingBest: 0 } };
    expect(mergeData(a, b).games).toEqual({ speedBest: 9, hiveBest: 40, queenBest: 0, stingBest: 0 });
    expect(mergeData(b, a).games).toEqual({ speedBest: 9, hiveBest: 40, queenBest: 0, stingBest: 0 });
  });

  it('keeps the larger Queen’s orders record from either side', () => {
    const a = { ...phone, games: { speedBest: 3, hiveBest: 40, queenBest: 12, stingBest: 0 } };
    const b = { ...laptop, games: { speedBest: 9, hiveBest: 25, queenBest: 18, stingBest: 0 } };
    expect(mergeData(a, b).games.queenBest).toBe(18);
    expect(mergeData(b, a).games.queenBest).toBe(18);
  });

  it('keeps the larger True or sting record from either side', () => {
    const a = { ...phone, games: { ...phone.games, stingBest: 14 } };
    const b = { ...laptop, games: { ...laptop.games, stingBest: 9 } };
    expect(mergeData(a, b).games.stingBest).toBe(14);
    expect(mergeData(b, a).games.stingBest).toBe(14);
  });

  it('gives the same progress in either order and does nothing when repeated', () => {
    const ab = mergeData(phone, laptop);
    expect(sameProgress(ab, mergeData(laptop, phone))).toBe(true);
    expect(sameProgress(mergeData(ab, laptop), ab)).toBe(true);
  });

  it('takeProgress swaps progress but not settings', () => {
    const mine = { ...phone, settings: { ...phone.settings, newPerDay: 30 } };
    const out = takeProgress(mine, laptop);
    expect(out.cards).toEqual(laptop.cards);
    expect(out.settings.newPerDay).toBe(30);
  });
});
