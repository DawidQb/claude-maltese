import { describe, expect, it } from 'vitest';
import { deckFromRows, type TopicRow, type WordRow } from './deck';
import { SHIPPED_DECK, type RawTopic } from './words';

/** The rows the seed script puts in the database for a deck. */
function toRows(deck: RawTopic[]): { topics: TopicRow[]; words: WordRow[] } {
  const topics: TopicRow[] = [];
  const words: WordRow[] = [];
  let id = 1;
  deck.forEach((t, ti) => {
    topics.push({ id: ti + 1, name: t.topic, note: t.note ?? null, position: ti * 10 });
    t.words.forEach(([mt, pl, en, extra], i) => {
      const row = { topic_id: ti + 1, plural_of: null, form_of: null };
      words.push({ ...row, id: id++, mt, pl, en, position: i * 10, form_of: typeof extra === 'string' ? extra : null });
      if (Array.isArray(extra)) words.push({ ...row, id: id++, mt: extra[0], pl: extra[1], en: extra[2], position: i * 10 + 1, plural_of: mt });
    });
  });
  return { topics, words };
}

const topic = (id: number, name: string, position = id): TopicRow => ({ id, name, note: null, position });
const word = (id: number, topicId: number, mt: string, pl: string, en: string, extra: Partial<WordRow> = {}): WordRow => ({
  id, topic_id: topicId, mt, pl, en, position: id, plural_of: null, form_of: null, ...extra,
});

describe('deckFromRows', () => {
  it('gives back the shipped deck from the rows the seed script creates', () => {
    const { topics, words } = toRows(SHIPPED_DECK);
    // Database order is arbitrary; positions decide.
    expect(deckFromRows(topics.reverse(), words.reverse())).toEqual(SHIPPED_DECK);
  });

  it('orders topics and words by position and puts a plural right after its singular', () => {
    const deck = deckFromRows(
      [topic(1, 'Home', 20), topic(2, 'Food', 10)],
      [
        word(1, 1, 'kotba', 'książki', 'books', { plural_of: 'ktieb', position: 1 }),
        word(2, 1, 'dar', 'dom', 'house', { position: 5 }),
        word(3, 1, 'ktieb', 'książka', 'book', { position: 2 }),
        word(4, 2, 'ħobż', 'chleb', 'bread'),
      ],
    );
    expect(deck).toEqual([
      { topic: 'Food', words: [['ħobż', 'chleb', 'bread']] },
      { topic: 'Home', words: [['ktieb', 'książka', 'book', ['kotba', 'książki', 'books']], ['dar', 'dom', 'house']] },
    ]);
  });

  it('leaves out rows the app cannot use', () => {
    const deck = deckFromRows(
      [topic(1, 'Food'), topic(2, '  '), topic(3, 'Empty')],
      [
        word(1, 1, 'ħobż', 'chleb', 'bread'),
        word(2, 1, 'ilma', 'chleb', 'water'), // repeats a Polish answer
        word(3, 1, '', 'ser', 'cheese'),
        word(4, 1, 'xorbiet', 'zupy', 'soups', { plural_of: 'soppa' }), // singular missing
        word(5, 2, 'tuffieħa', 'jabłko', 'apple'), // nameless topic
        word(6, 1, ' bajda ', 'jajko', 'egg'),
      ],
    );
    expect(deck).toEqual([{ topic: 'Food', words: [['ħobż', 'chleb', 'bread'], ['bajda', 'jajko', 'egg']] }]);
  });
});
