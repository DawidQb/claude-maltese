import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkAnswer } from './answer';
import { courtVerbs } from './court';
import { ALPHABET, letterKeys, typeable } from './letters';
import { spellWords } from './spell';
import { cardKey } from './srs';
import { emptyData, recordAnswer, sanitize, viewOf } from './store';
import { webWords } from './web';
import { LEARN, SHIPPED_DECK, SOURCE, TARGET, TOPICS, WORDS, buildWords, setLearn, wordsInTopic } from './words';

const MALTESE = buildWords(SHIPPED_DECK);

describe('learning English', () => {
  beforeAll(() => setLearn('en'));
  afterAll(() => setLearn('mt'));

  it('puts English in the place of Maltese, with Polish as the only translation', () => {
    expect(LEARN).toBe('en');
    expect([TARGET, SOURCE]).toEqual(['English', 'Polish']);
    expect(WORDS).toHaveLength(MALTESE.length);
    WORDS.forEach((w, i) => {
      expect(w.mt).toBe(MALTESE[i].en);
      expect(w.id).toBe(w.mt);
      expect(w.pl).toBe(MALTESE[i].pl);
      expect(w.en).toBe(w.pl);
      expect(w.topic).toBe(MALTESE[i].topic);
    });
    expect(new Set(WORDS.map((w) => w.id)).size).toBe(WORDS.length);
  });

  it('keeps the topics and the kinds of card', () => {
    for (const t of TOPICS) expect(wordsInTopic(t).length).toBeGreaterThan(0);
    expect(wordsInTopic('all', { plurals: false, verbForms: false }).length).toBe(
      MALTESE.filter((w) => !w.pluralOf && !w.formOf).length,
    );
  });

  it('links plurals and verb forms to English cards', () => {
    const ids = new Set(WORDS.map((w) => w.id));
    const book = WORDS.find((w) => w.mt === 'book')!;
    expect(book.plural).toBe('books');
    expect(WORDS.find((w) => w.mt === 'books')!.pluralOf).toBe('book');
    for (const w of WORDS) {
      for (const link of [w.plural, w.pluralOf, w.formOf]) if (link) expect(ids).toContain(link);
    }
    expect(courtVerbs(WORDS).length).toBe(courtVerbs(MALTESE).length);
  });

  it('leaves out the notes, which are about Maltese', () => {
    expect(WORDS.some((w) => w.note)).toBe(false);
  });

  it('saves progress under keys of its own', () => {
    expect(cardKey('mt2x', 'bank')).toBe('mt2x:en:bank');
    const data = recordAnswer(emptyData(), 'x2mt', 'bank', 'knew', '2026-03-10');
    expect(Object.keys(data.cards)).toEqual(['x2mt:en:bank']);
    expect(sanitize(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('uses the English alphabet on the letter pads', () => {
    expect(ALPHABET.join('')).toBe('abcdefghijklmnopqrstuvwxyz');
    for (const k of letterKeys('yellow')) expect([...ALPHABET, '-', "'", ' ']).toContain(k);
  });

  it('lets every word without a note or a second meaning be typed with its own keys', () => {
    const fit = WORDS.filter((w) => typeable(w.mt));
    expect(fit.length).toBeGreaterThan(WORDS.length * 0.8);
    expect(typeable('hi / bye')).toBe(false);
    expect(typeable('cold (noun)')).toBe(false);
    for (const w of fit) {
      const keys = letterKeys(w.mt);
      for (const k of w.mt.toLowerCase().replace(/[…?!.,]/g, '')) expect(keys).toContain(k);
      expect(checkAnswer(w.mt, w.mt)).toBe('correct');
    }
    for (const t of TOPICS) expect(wordsInTopic(t).some((w) => typeable(w.mt))).toBe(true);
  });

  it('has words for the spelling games', () => {
    expect(spellWords(WORDS).length).toBeGreaterThan(200);
    expect(webWords(WORDS).length).toBeGreaterThan(200);
    for (const w of [...spellWords(WORDS), ...webWords(WORDS)]) expect(typeable(w.mt)).toBe(true);
  });
});

describe('the language setting', () => {
  it('is Maltese unless English is chosen', () => {
    expect(emptyData().settings.learn).toBe('mt');
    expect(sanitize({ version: 1, cards: {}, settings: { learn: 'fr' } })!.settings.learn).toBe('mt');
    expect(sanitize({ version: 1, cards: {}, settings: { learn: 'en' } })!.settings.learn).toBe('en');
  });

  it('shows only Polish while English is learned, and keeps the saved choice', () => {
    const data = emptyData();
    expect(viewOf(data)).toBe(data);
    const english = { ...data, settings: { ...data.settings, learn: 'en' as const } };
    expect(viewOf(english).settings.show).toBe('pl');
    expect(english.settings.show).toBe('both');
  });

  it('goes back to Maltese words, letters and keys', () => {
    expect(LEARN).toBe('mt');
    expect(WORDS).toEqual(MALTESE);
    expect(ALPHABET).toContain('ħ');
    expect(cardKey('mt2x', 'bank')).toBe('mt2x:bank');
  });
});
