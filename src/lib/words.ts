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
  /** On a conjugated verb form: the dictionary form of the verb. */
  formOf?: string;
}

type Triple = [string, string, string];
/**
 * [Maltese, Polish, English], optionally followed by a fourth item:
 * the plural form as its own triple, or the verb a conjugated form belongs to.
 */
type Row = Triple | [...Triple, Triple] | [...Triple, string];

interface RawTopic {
  topic: string;
  note?: string;
  words: Row[];
}

/** Every card in deck order. A plural form is its own card, right after its singular. */
export const WORDS: Word[] = (raw as unknown as RawTopic[]).flatMap((t) =>
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

export const TOPICS: string[] = (raw as unknown as RawTopic[]).map((t) => t.topic);

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
