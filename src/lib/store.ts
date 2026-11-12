import { useCallback, useState } from 'react';
import { applyGrade, bumpStreak, cardKey, type CardState, type Direction, type Grade, type Streak } from './srs';
import { ALL_TOPICS, TOPICS } from './words';

export type ShowLang = 'both' | 'pl' | 'en';

export interface Settings {
  newPerDay: number;
  /** Which translations appear on the card. */
  show: ShowLang;
  direction: Direction;
  /** A topic name, or ALL_TOPICS. */
  topic: string;
  /** Type the Maltese word instead of flipping the card (Polish/English → Maltese only). */
  typing: boolean;
  /** Include plural forms of nouns as cards of their own. */
  plurals: boolean;
  /** Include conjugated verb forms ("he eats", "we danced") as cards of their own. */
  verbForms: boolean;
}

export interface AppData {
  version: 1;
  /** Progress per direction and word, keyed by cardKey(). */
  cards: Record<string, CardState>;
  settings: Settings;
  streak: Streak;
  /** New words first seen on `date`, per direction. */
  introduced: { date: string; mt2x: number; x2mt: number };
  /** Minigame records. Games never change the review schedule. */
  games: { speedBest: number };
}

// The key keeps the app's first name, Kelma: renaming it would orphan everyone's saved progress.
const STORAGE_KEY = 'kelma:v1';

export function emptyData(): AppData {
  return {
    version: 1,
    cards: {},
    settings: { newPerDay: 10, show: 'both', direction: 'mt2x', topic: ALL_TOPICS, typing: false, plurals: true, verbForms: true },
    streak: { count: 0, last: null },
    introduced: { date: '', mt2x: 0, x2mt: 0 },
    games: { speedBest: 0 },
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts anything (saved state or an imported file) and returns valid data, or null. */
export function sanitize(input: unknown): AppData | null {
  if (typeof input !== 'object' || input === null) return null;
  const src = input as Record<string, unknown>;
  if (src.version !== 1 || typeof src.cards !== 'object' || src.cards === null) return null;

  const base = emptyData();
  const cards: Record<string, CardState> = {};
  for (const [key, value] of Object.entries(src.cards as Record<string, unknown>)) {
    const c = value as Partial<CardState> | null;
    if (!c || typeof c.box !== 'number' || typeof c.due !== 'string' || !ISO_DATE.test(c.due)) continue;
    if (!key.startsWith('mt2x:') && !key.startsWith('x2mt:')) continue;
    cards[key] = { box: Math.min(5, Math.max(1, Math.round(c.box))), due: c.due };
  }

  const s = (src.settings ?? {}) as Partial<Settings>;
  const settings: Settings = {
    newPerDay: typeof s.newPerDay === 'number' && s.newPerDay >= 0 ? Math.min(50, Math.round(s.newPerDay)) : base.settings.newPerDay,
    show: s.show === 'pl' || s.show === 'en' || s.show === 'both' ? s.show : base.settings.show,
    direction: s.direction === 'x2mt' ? 'x2mt' : 'mt2x',
    topic: typeof s.topic === 'string' && TOPICS.includes(s.topic) ? s.topic : ALL_TOPICS,
    typing: s.typing === true,
    plurals: s.plurals !== false,
    verbForms: s.verbForms !== false,
  };

  const st = (src.streak ?? {}) as Partial<Streak>;
  const streak: Streak =
    typeof st.count === 'number' && typeof st.last === 'string' && ISO_DATE.test(st.last)
      ? { count: Math.max(0, Math.round(st.count)), last: st.last }
      : base.streak;

  const intro = (src.introduced ?? {}) as Partial<AppData['introduced']>;
  const introduced =
    typeof intro.date === 'string' && typeof intro.mt2x === 'number' && typeof intro.x2mt === 'number'
      ? { date: intro.date, mt2x: intro.mt2x, x2mt: intro.x2mt }
      : base.introduced;

  const g = (src.games ?? {}) as Partial<AppData['games']>;
  const games = { speedBest: typeof g.speedBest === 'number' && g.speedBest > 0 ? Math.round(g.speedBest) : 0 };

  return { version: 1, cards, settings, streak, introduced, games };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitize(JSON.parse(raw)) ?? emptyData();
  } catch {
    // Storage blocked or corrupt: start fresh for this visit.
  }
  return emptyData();
}

function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Private windows can refuse writes; the app still works for the session.
  }
}

/** New words that may still be introduced today in this direction. */
export function newLeft(data: AppData, dir: Direction, today: string): number {
  const used = data.introduced.date === today ? data.introduced[dir] : 0;
  return data.settings.newPerDay - used;
}

export function recordAnswer(data: AppData, dir: Direction, wordId: string, grade: Grade, today: string): AppData {
  const key = cardKey(dir, wordId);
  const prev = data.cards[key];
  const introduced = data.introduced.date === today ? { ...data.introduced } : { date: today, mt2x: 0, x2mt: 0 };
  if (!prev) introduced[dir] += 1;
  return {
    ...data,
    cards: { ...data.cards, [key]: applyGrade(prev, grade, today) },
    streak: bumpStreak(data.streak, today),
    introduced,
  };
}

export type Update = (fn: (data: AppData) => AppData) => void;

export function useStore(): [AppData, Update] {
  const [data, setData] = useState<AppData>(loadData);
  const update = useCallback<Update>((fn) => {
    setData((prev) => {
      const next = fn(prev);
      saveData(next);
      return next;
    });
  }, []);
  return [data, update];
}
