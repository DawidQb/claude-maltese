import shipped from '../data/words.json';
import { setLetters } from './letters';

export interface Word {
  /** Stable key for saved progress: the word being learned itself. */
  id: string;
  /** The word being learned: Maltese, or English when English is learned (see `toEnglish`). */
  mt: string;
  pl: string;
  en: string;
  topic: string;
  note?: string;
  /** On a singular noun: its Maltese plural. */
  plural?: string;
  /** On a plural form: the Maltese singular it belongs to. */
  pluralOf?: string;
  /** On a conjugated verb form: the dictionary form of the verb. */
  formOf?: string;
}

export type Triple = [string, string, string];
/**
 * [Maltese, Polish, English], optionally followed by a fourth item:
 * the plural form as its own triple, or the verb a conjugated form belongs to.
 */
export type Row = Triple | [...Triple, Triple] | [...Triple, string];

/** The deck as stored in src/data/words.json and in the local copy of the database's deck. */
export interface RawTopic {
  topic: string;
  note?: string;
  words: Row[];
}

/** The deck the app was built with, used until the database's deck has been downloaded. */
export const SHIPPED_DECK = shipped as unknown as RawTopic[];

/** The language being learned. English is learned through Polish, from the same deck. */
export type Learn = 'mt' | 'en';

/**
 * The deck with English as the word to learn: English takes the place of Maltese everywhere
 * (the card's key, its plural and verb links), and Polish is the only translation left.
 * Topic notes are about Maltese, so they are left out.
 */
function toEnglish(words: Word[]): Word[] {
  const english = new Map(words.map((w) => [w.mt, w.en]));
  const link = (mt: string | undefined) => (mt === undefined ? undefined : (english.get(mt) ?? mt));
  return words.map((w) => {
    const card: Word = { id: w.en, mt: w.en, pl: w.pl, en: w.pl, topic: w.topic };
    if (w.plural) card.plural = link(w.plural);
    if (w.pluralOf) card.pluralOf = link(w.pluralOf);
    if (w.formOf) card.formOf = link(w.formOf);
    return card;
  });
}

/** Every card in deck order. A plural form is its own card, right after its singular. */
export function buildWords(deck: RawTopic[], learn: Learn = 'mt'): Word[] {
  const words = maltese(deck);
  return learn === 'en' ? toEnglish(words) : words;
}

function maltese(deck: RawTopic[]): Word[] {
  return deck.flatMap((t) =>
    t.words.flatMap(([mt, pl, en, extra]) => {
      const base: Word = { id: mt, mt, pl, en, topic: t.topic, note: t.note };
      if (!extra) return [base];
      if (typeof extra === 'string') return [{ ...base, formOf: extra }];
      const [pmt, ppl, pen] = extra;
      return [
        { ...base, plural: pmt },
        { id: pmt, mt: pmt, pl: ppl, en: pen, topic: t.topic, note: t.note, pluralOf: mt },
      ];
    }),
  );
}

// Live bindings: every importer sees the deck set by the latest setDeck() and setLearn().
export let DECK: RawTopic[] = SHIPPED_DECK;
export let WORDS: Word[] = buildWords(SHIPPED_DECK);
export let TOPICS: string[] = SHIPPED_DECK.map((t) => t.topic);
export let LEARN: Learn = 'mt';
/** Names for the screen: the language being learned, and what it is learned through. */
export let TARGET = 'Maltese';
export let SOURCE = 'Polish / English';

/** Switches the whole app to another deck. Call before rendering, or re-render after. */
export function setDeck(deck: RawTopic[]): void {
  DECK = deck;
  WORDS = buildWords(deck, LEARN);
  TOPICS = deck.map((t) => t.topic);
}

/** Switches the whole app to another language to learn. Call before rendering; does nothing when already there. */
export function setLearn(learn: Learn): void {
  if (learn === LEARN) return;
  LEARN = learn;
  TARGET = learn === 'en' ? 'English' : 'Maltese';
  SOURCE = learn === 'en' ? 'Polish' : 'Polish / English';
  WORDS = buildWords(DECK, learn);
  setLetters(learn);
}

export const ALL_TOPICS = 'all';

/** Which optional kinds of card to include. Both default to on. */
export interface Include {
  plurals?: boolean;
  verbForms?: boolean;
}

export function wordsInTopic(topic: string, { plurals = true, verbForms = true }: Include = {}): Word[] {
  return WORDS.filter(
    (w) => (topic === ALL_TOPICS || w.topic === topic) && (plurals || !w.pluralOf) && (verbForms || !w.formOf),
  );
}

/** Topics that still have cards with these choices (a topic of only verb forms can empty out). */
export function topicsWith(include: Include): string[] {
  return TOPICS.filter((t) => wordsInTopic(t, include).length > 0);
}
