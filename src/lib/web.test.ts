import { describe, expect, it } from 'vitest';
import { ALPHABET } from './letters';
import { guess, HARDER, MAX_CELLS, MIN_POOL, newRound, roundState, shown, STEPS, stepsFor, webCells, webPool, webWords, type Round } from './web';
import { WORDS, type Word } from './words';

const word = (mt: string, topic = 't'): Word => ({ id: mt, mt, pl: `${mt}-pl`, en: `${mt}-en`, topic });

/** Taps keys in order, returning the last result. */
function play(round: Round, keys: string[]) {
  let result = { round, hit: false, state: roundState(round) };
  for (const k of keys) result = guess(result.round, k);
  return result;
}

describe('webCells', () => {
  it('gives "għ" one cell', () => {
    const cells = webCells('għasfur');
    expect(cells).toHaveLength(6);
    expect(cells[0]).toEqual({ key: 'għ', given: false });
  });

  it('shows hyphens and spaces from the start', () => {
    const cells = webCells('il-lejl it-tajjeb');
    expect(cells.map((c) => (c.given ? c.key : '_')).join('')).toBe('__-____ __-______');
  });

  it('shows the apostrophe and drops the question mark', () => {
    const cells = webCells("x'jismek?");
    expect(cells.map((c) => c.key).join('')).toBe("x'jismek");
    expect(cells[1]).toEqual({ key: "'", given: true });
  });

  it('keeps accents and capitals to show', () => {
    expect(webCells('kafè')[3]).toEqual({ key: 'è', given: false });
    expect(webCells('Ġunju')[0]).toEqual({ key: 'Ġ', given: false });
  });
});

describe('guess', () => {
  it('fills every cell of a hit and adds no miss', () => {
    const { round, hit, state } = guess(newRound(word('qattus'), 0), 't');
    expect(hit).toBe(true);
    expect(round.misses).toBe(0);
    expect(state).toBe('open');
    expect(shown(round)).toEqual([null, null, 't', 't', null, null]);
  });

  it('adds a miss for a letter the word does not have', () => {
    const { round, hit } = guess(newRound(word('qattus'), 0), 'z');
    expect(hit).toBe(false);
    expect(round.misses).toBe(1);
  });

  it('changes nothing for a key already tapped or not on the pad', () => {
    const once = guess(newRound(word('qattus'), 0), 'z').round;
    expect(guess(once, 'z').round).toBe(once);
    expect(guess(once, 'à').round).toBe(once);
    expect(guess(once, '-').round).toBe(once);
  });

  it('makes look-alikes count: h misses on ħobż, ħ hits', () => {
    const start = newRound(word('ħobż'), 0);
    expect(guess(start, 'h').hit).toBe(false);
    expect(guess(start, 'ħ').hit).toBe(true);
    expect(guess(start, 'z').hit).toBe(false);
  });

  it('needs "għ" for "għ": g and h do not fill it', () => {
    const start = newRound(word('għasfur'), 0);
    expect(guess(start, 'g').hit).toBe(false);
    expect(guess(start, 'h').hit).toBe(false);
    expect(shown(guess(start, 'għ').round)[0]).toBe('għ');
  });

  it('fills à and è with a and e, showing the accent', () => {
    const { round, state } = play(newRound(word('kafè'), 0), ['k', 'a', 'f', 'e']);
    expect(state).toBe('freed');
    expect(shown(round)).toEqual(['k', 'a', 'f', 'è']);
  });

  it('fills a capital with its small letter', () => {
    expect(play(newRound(word('Ġunju'), 0), ['ġ', 'u', 'n', 'j']).state).toBe('freed');
  });

  it('frees the bee on the last hit and ends there', () => {
    const freed = play(newRound(word('il-lejl'), 0), ['i', 'l', 'e', 'j']);
    expect(freed.state).toBe('freed');
    expect(freed.round.misses).toBe(0);
    const after = guess(freed.round, 'z');
    expect(after.round).toBe(freed.round);
    expect(after.state).toBe('freed');
  });

  it('catches the bee on the last miss and ends there', () => {
    const caught = play(newRound(word('ħobż'), 0), ['a', 'd', 'e', 'f', 'g', 'i']);
    expect(caught.state).toBe('caught');
    expect(caught.round.misses).toBe(STEPS);
    const after = guess(caught.round, 'ħ');
    expect(after.round).toBe(caught.round);
    expect(after.state).toBe('caught');
  });

  it('counts the steps of the round, not the starting six', () => {
    const round = newRound(word('ħobż'), HARDER.four);
    expect(round.steps).toBe(4);
    expect(play(round, ['a', 'd', 'e', 'f']).state).toBe('caught');
  });
});

describe('stepsFor', () => {
  it('is 6, then 5 from a run of 4, then 4 from 8, never fewer', () => {
    expect(stepsFor(0)).toBe(6);
    expect(stepsFor(3)).toBe(6);
    expect(stepsFor(4)).toBe(5);
    expect(stepsFor(7)).toBe(5);
    expect(stepsFor(8)).toBe(4);
    expect(stepsFor(100)).toBe(4);
  });
});

describe('webWords and webPool', () => {
  it('drops two-letter words and phrases over eighteen cells', () => {
    expect(webCells('titkellem bl-Ingliż?')).toHaveLength(19);
    const words = ['le', 'iva', 'titkellem bl-Ingliż?', 'il-lejl it-tajjeb', "x'jismek?"].map((mt) => word(mt));
    expect(webWords(words).map((w) => w.mt)).toEqual(['iva', 'il-lejl it-tajjeb', "x'jismek?"]);
  });

  it('keeps nearly all the shipped deck, every word winnable on the pad', () => {
    const fit = webWords(WORDS);
    expect(fit.length).toBeGreaterThan(WORDS.length - 30);
    for (const w of fit) {
      expect(webCells(w.mt).length).toBeLessThanOrEqual(MAX_CELLS);
      const keys = [...new Set(webCells(w.mt).filter((c) => !c.given).map((c) => c.key.toLowerCase().replace('à', 'a').replace('è', 'e')))];
      for (const k of keys) expect(ALPHABET).toContain(k);
      expect(play(newRound(w, 0), keys).state).toBe('freed');
    }
  });

  it('falls back to the whole deck when the topic has too few words', () => {
    const words = 'abdefhijklmnorstu'.split('').map((l) => word(`kel${l}`));
    expect(webPool(words.slice(0, MIN_POOL - 1), WORDS)).toEqual(webWords(WORDS));
    expect(webPool(words.slice(0, MIN_POOL), WORDS)).toEqual(words.slice(0, MIN_POOL));
  });
});
