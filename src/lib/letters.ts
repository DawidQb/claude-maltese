/**
 * The letter pad for typing a Maltese word without the phone keyboard:
 * the letters the word needs, plus decoys, up to a fixed number of keys.
 */
import { shuffle, type Rng } from './games';

/** Keys in the order they are laid out. "għ" is one letter in Maltese, so it is one key. */
const LAYOUT = [
  ...['a', 'à', 'b', 'ċ', 'd', 'e', 'è', 'f', 'ġ', 'g', 'għ', 'h', 'ħ', 'i', 'j', 'k', 'l', 'm', 'n'],
  ...['o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'ż', 'z', '-', "'", ' '],
];

/** Letters offered as decoys: the plain alphabet, without accented vowels or punctuation. */
const DECOYS = LAYOUT.filter((k) => !['à', 'è', '-', "'", ' '].includes(k));

/** Letters that are easy to mix up. When a word has one, the others make the best decoys. */
const LOOKALIKES = [
  ['h', 'ħ', 'għ'],
  ['g', 'ġ', 'għ'],
  ['z', 'ż'],
  ['ċ', 'k'],
];

/** Punctuation that never counts for or against an answer, so it needs no key. */
const IGNORED = /[…?!.,]/g;

/** Splits a Maltese word into the keys needed to type it. */
export function toKeys(word: string): string[] {
  const text = word.toLowerCase().replace(/[’‘`´]/g, "'").replace(IGNORED, '').replace(/\s+/g, ' ').trim();
  const keys: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('għ', i)) {
      keys.push('għ');
      i += 1;
    } else {
      keys.push(text[i]);
    }
  }
  return keys;
}

/**
 * The keys to show for a word: every letter it needs, then look-alike decoys,
 * then random letters, up to `count` keys. A word with more than `count`
 * different letters gets as many keys as it needs.
 */
export function letterKeys(word: string, rng: Rng = Math.random, count = 10): string[] {
  const keys = new Set(toKeys(word));
  const add = (candidates: string[]) => {
    for (const k of candidates) {
      if (keys.size >= count) return;
      keys.add(k);
    }
  };
  const needed = [...keys];
  add(shuffle(LOOKALIKES.filter((group) => group.some((k) => needed.includes(k))).flat(), rng));
  add(shuffle(DECOYS, rng));

  const position = (k: string) => (LAYOUT.includes(k) ? LAYOUT.indexOf(k) : LAYOUT.length);
  return [...keys].sort((a, b) => position(a) - position(b));
}

/** What a key shows: the space key needs a visible sign. */
export function keyLabel(key: string): string {
  return key === ' ' ? '␣' : key;
}
