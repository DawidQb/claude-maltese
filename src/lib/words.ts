import raw from '../data/words.json';

export interface Word {
  /** Stable key for saved progress: the Maltese word itself. */
  id: string;
  mt: string;
  pl: string;
  en: string;
  topic: string;
  note?: string;
  /** On a singular noun: its Maltese plural. */
  plural?: string;
  /** On a plural form: the Maltese singular it belongs to. */
  pluralOf?: string;
}

type Triple = [string, string, string];
/** [Maltese, Polish, English] with an optional plural form as a fourth item. */
type Row = Triple | [...Triple, Triple];

interface RawTopic {
  topic: string;
  note?: string;
  words: Row[];
}

/** Every card in deck order. A plural form is its own card, right after its singular. */
export const WORDS: Word[] = (raw as unknown as RawTopic[]).flatMap((t) =>
  t.words.flatMap(([mt, pl, en, plural]) => {
    const base: Word = { id: mt, mt, pl, en, topic: t.topic, note: t.note };
    if (!plural) return [base];
    const [pmt, ppl, pen] = plural;
    return [
      { ...base, plural: pmt },
      { id: pmt, mt: pmt, pl: ppl, en: pen, topic: t.topic, note: t.note, pluralOf: mt },
    ];
  }),
);

export const TOPICS: string[] = (raw as unknown as RawTopic[]).map((t) => t.topic);

export const ALL_TOPICS = 'all';

export function wordsInTopic(topic: string, plurals = true): Word[] {
  return WORDS.filter((w) => (topic === ALL_TOPICS || w.topic === topic) && (plurals || !w.pluralOf));
}
