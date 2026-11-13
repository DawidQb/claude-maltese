import type { SupabaseClient } from '@supabase/supabase-js';
import type { RawTopic, Row, Triple } from './words';

/** One row of the `topics` table. */
export interface TopicRow {
  id: number;
  name: string;
  note: string | null;
  position: number;
}

/** One row of the `words` table. */
export interface WordRow {
  id: number;
  topic_id: number;
  mt: string;
  pl: string;
  en: string;
  position: number;
  plural_of: string | null;
  form_of: string | null;
}

const CACHE_KEY = 'nahla:deck';
/** Supabase returns at most this many rows per request by default. */
const PAGE = 1000;

const byOrder = (a: { position: number; id: number }, b: { position: number; id: number }) =>
  a.position - b.position || a.id - b.id;

/**
 * Turns the database's rows into the app's deck: topics and words in position order, each
 * plural right after its singular. Rows the app could not use are left out: blank text,
 * a repeated Maltese word or translation (every question must have one answer), a plural
 * whose singular is missing, and topics left without words.
 */
export function deckFromRows(topicRows: TopicRow[], wordRows: WordRow[]): RawTopic[] {
  const clean = (s: string | null | undefined) => (typeof s === 'string' ? s.trim() : '');
  const seen = { mt: new Set<string>(), pl: new Set<string>(), en: new Set<string>() };
  const claim = (w: WordRow): Triple | null => {
    const t: Triple = [clean(w.mt), clean(w.pl), clean(w.en)];
    if (t.some((x) => x === '') || seen.mt.has(t[0]) || seen.pl.has(t[1]) || seen.en.has(t[2])) return null;
    seen.mt.add(t[0]);
    seen.pl.add(t[1]);
    seen.en.add(t[2]);
    return t;
  };

  const sorted = [...wordRows].sort(byOrder);
  const pluralOf = new Map<string, WordRow>();
  for (const w of sorted) if (w.plural_of && !pluralOf.has(w.plural_of)) pluralOf.set(w.plural_of, w);

  const deck: RawTopic[] = [];
  for (const topic of [...topicRows].sort(byOrder)) {
    const name = clean(topic.name);
    if (!name || deck.some((t) => t.topic === name)) continue;
    const rows: Row[] = [];
    for (const w of sorted) {
      if (w.topic_id !== topic.id || w.plural_of) continue;
      const single = claim(w);
      if (!single) continue;
      const plural = pluralOf.get(w.mt);
      const pluralTriple = plural ? claim(plural) : null;
      if (pluralTriple) rows.push([...single, pluralTriple]);
      else if (clean(w.form_of)) rows.push([...single, clean(w.form_of)]);
      else rows.push(single);
    }
    if (rows.length === 0) continue;
    const note = clean(topic.note);
    deck.push(note ? { topic: name, note, words: rows } : { topic: name, words: rows });
  }
  return deck;
}

async function fetchAll<T>(supabase: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data as T[]));
    if (data.length < PAGE) return all;
  }
}

/** Downloads the deck from the database. Resolves null when it holds no usable words. */
export async function fetchDeck(supabase: SupabaseClient): Promise<RawTopic[] | null> {
  const [topics, words] = await Promise.all([
    fetchAll<TopicRow>(supabase, 'topics', 'id, name, note, position'),
    fetchAll<WordRow>(supabase, 'words', 'id, topic_id, mt, pl, en, position, plural_of, form_of'),
  ]);
  const deck = deckFromRows(topics, words);
  return deck.length > 0 ? deck : null;
}

/** The deck downloaded last time, so the app starts with it even offline. */
export function loadCachedDeck(): RawTopic[] | null {
  try {
    const deck = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as unknown;
    return Array.isArray(deck) && deck.length > 0 ? (deck as RawTopic[]) : null;
  } catch {
    return null;
  }
}

export function saveCachedDeck(deck: RawTopic[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(deck));
  } catch {
    // Without storage the next start downloads the deck again.
  }
}
