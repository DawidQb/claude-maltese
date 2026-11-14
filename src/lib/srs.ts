import { LEARN } from './words';

/** Which side of the card is the question. */
export type Direction = 'mt2x' | 'x2mt';
export type Grade = 'no' | 'almost' | 'knew';

export interface CardState {
  /** 1–5. A card with no saved state is "new" (box 0). */
  box: number;
  /** Local date (YYYY-MM-DD) of the next review. */
  due: string;
}

export const MAX_BOX = 5;
/** Days until the next review, indexed by box. */
export const INTERVALS = [0, 1, 3, 7, 14, 30];

export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  // UTC arithmetic so daylight-saving changes never skip or repeat a day.
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The key of a card's saved progress. English cards have keys of their own, so the two languages never share progress. */
export function cardKey(dir: Direction, wordId: string): string {
  return LEARN === 'en' ? `${dir}:en:${wordId}` : `${dir}:${wordId}`;
}

export function applyGrade(prev: CardState | undefined, grade: Grade, today: string): CardState {
  const box = prev?.box ?? 0;
  if (grade === 'knew') {
    const next = Math.min(MAX_BOX, box + 1);
    return { box: next, due: addDays(today, INTERVALS[next]) };
  }
  if (grade === 'almost') {
    return { box: Math.max(1, box), due: addDays(today, 1) };
  }
  return { box: 1, due: addDays(today, 1) };
}

export function isDue(state: CardState | undefined, today: string): boolean {
  return state !== undefined && state.due <= today;
}

export interface SessionInput {
  wordIds: string[];
  cards: Record<string, CardState>;
  dir: Direction;
  today: string;
  /** How many new words may still be introduced today. */
  newLeft: number;
  shuffle?: <T>(items: T[]) => T[];
}

export function countDue(input: Omit<SessionInput, 'newLeft' | 'shuffle'>): number {
  return input.wordIds.filter((id) => isDue(input.cards[cardKey(input.dir, id)], input.today)).length;
}

export function countNew(input: Omit<SessionInput, 'shuffle'>): number {
  const unseen = input.wordIds.filter((id) => !input.cards[cardKey(input.dir, id)]).length;
  return Math.min(Math.max(0, input.newLeft), unseen);
}

/** Due reviews first (shuffled), then new words in deck order. */
export function buildSession(input: SessionInput): string[] {
  const { wordIds, cards, dir, today, newLeft, shuffle = fisherYates } = input;
  const due = wordIds.filter((id) => isDue(cards[cardKey(dir, id)], today));
  const fresh = wordIds.filter((id) => !cards[cardKey(dir, id)]).slice(0, Math.max(0, newLeft));
  return [...shuffle(due), ...fresh];
}

export function fisherYates<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Streak {
  count: number;
  /** Local date of the last day with at least one answer. */
  last: string | null;
}

export function bumpStreak(streak: Streak, today: string): Streak {
  if (streak.last === today) return streak;
  if (streak.last === addDays(today, -1)) return { count: streak.count + 1, last: today };
  return { count: 1, last: today };
}

/** The streak to show: it lapses once a full day has been missed. */
export function currentStreak(streak: Streak, today: string): number {
  if (streak.last === today || streak.last === addDays(today, -1)) return streak.count;
  return 0;
}
