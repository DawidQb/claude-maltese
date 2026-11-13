import type { CardState, Streak } from './srs';
import type { AppData } from './store';

/**
 * Merging two copies of progress, e.g. this device and the account.
 *
 * Every rule picks "the most progress", so merging is order-free and merging twice changes
 * nothing: devices can sync in any order and end up the same. Settings are not merged; each
 * device keeps its own.
 */

/** A review always moves the due date past today, so the later due date is the newer state. */
export function mergeCard(a: CardState | undefined, b: CardState | undefined): CardState | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.due !== b.due) return a.due > b.due ? a : b;
  return a.box >= b.box ? a : b;
}

export function mergeStreak(a: Streak, b: Streak): Streak {
  if (a.last === b.last) return a.count >= b.count ? a : b;
  if (a.last === null) return b;
  if (b.last === null) return a;
  return a.last > b.last ? a : b;
}

export function mergeIntroduced(a: AppData['introduced'], b: AppData['introduced']): AppData['introduced'] {
  if (a.date !== b.date) return a.date > b.date ? a : b;
  return { date: a.date, mt2x: Math.max(a.mt2x, b.mt2x), x2mt: Math.max(a.x2mt, b.x2mt) };
}

/** Merges `other`'s progress into `base`, keeping `base`'s settings. */
export function mergeData(base: AppData, other: AppData): AppData {
  const cards: Record<string, CardState> = { ...base.cards };
  for (const [key, card] of Object.entries(other.cards)) cards[key] = mergeCard(cards[key], card)!;
  return {
    ...base,
    cards,
    streak: mergeStreak(base.streak, other.streak),
    introduced: mergeIntroduced(base.introduced, other.introduced),
    games: {
      speedBest: Math.max(base.games.speedBest, other.games.speedBest),
      hiveBest: Math.max(base.games.hiveBest, other.games.hiveBest),
      queenBest: Math.max(base.games.queenBest, other.games.queenBest),
    },
  };
}

/** `base` with its progress replaced by `other`'s, keeping `base`'s settings. */
export function takeProgress(base: AppData, other: AppData): AppData {
  return { ...base, cards: other.cards, streak: other.streak, introduced: other.introduced, games: other.games };
}

/** The part of the data stored in the account. */
export function progressOf(data: AppData): Omit<AppData, 'settings'> {
  return { version: data.version, cards: data.cards, streak: data.streak, introduced: data.introduced, games: data.games };
}

/** A string that is equal for two copies exactly when they hold the same progress. */
export function progressKey(data: AppData): string {
  return stableJson(progressOf(data));
}

export function sameProgress(a: AppData, b: AppData): boolean {
  return progressKey(a) === progressKey(b);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : v,
  );
}
