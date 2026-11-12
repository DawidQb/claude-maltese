import raw from '../data/words.json';

export interface Word {
  /** Stable key for saved progress: the Maltese word itself. */
  id: string;
  mt: string;
  pl: string;
  en: string;
  topic: string;
  note?: string;
}

interface RawTopic {
  topic: string;
  note?: string;
  words: string[][];
}

export const WORDS: Word[] = (raw as RawTopic[]).flatMap((t) =>
  t.words.map(([mt, pl, en]) => ({ id: mt, mt, pl, en, topic: t.topic, note: t.note })),
);

export const TOPICS: string[] = (raw as RawTopic[]).map((t) => t.topic);

export const ALL_TOPICS = 'all';

export function wordsInTopic(topic: string): Word[] {
  return topic === ALL_TOPICS ? WORDS : WORDS.filter((w) => w.topic === topic);
}
