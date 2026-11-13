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

/** A letter with its look-alikes folded into one, so "ħ" and "h" count as the same. */
function fold(key: string): string {
  return LOOKALIKES.find((group) => group.includes(key))?.[0] ?? key;
}

/**
 * How alike two Maltese words look, from 0 (nothing in common) to 1 (the same once look-alike
 * letters are folded together): mostly the letters they share, then how long a start they
 * share, then how close they are in length.
 */
export function similarity(a: string, b: string): number {
  const ka = toKeys(a).map(fold);
  const kb = toKeys(b).map(fold);
  if (ka.length === 0 || kb.length === 0) return 0;
  let prefix = 0;
  while (prefix < Math.min(ka.length, kb.length) && ka[prefix] === kb[prefix]) prefix += 1;
  const left = [...kb];
  let shared = 0;
  for (const k of ka) {
    const i = left.indexOf(k);
    if (i >= 0) {
      shared += 1;
      left.splice(i, 1);
    }
  }
  const letters = (2 * shared) / (ka.length + kb.length);
  const start = prefix / Math.min(ka.length, kb.length);
  const length = 1 - Math.abs(ka.length - kb.length) / Math.max(ka.length, kb.length);
  return 0.6 * letters + 0.25 * start + 0.15 * length;
}

const ROW = 5;
const MIN_KEYS = 10;

/**
 * How many keys the pad has for a word: ten, unless the word uses more than
 * ten different letters. Then the pad grows a whole row at a time until they
 * all fit. How long the word is does not matter, only how many different
 * letters it has.
 */
export function padSize(word: string): number {
  const different = new Set(toKeys(word)).size;
  return Math.max(MIN_KEYS, Math.ceil(different / ROW) * ROW);
}

/**
 * The keys to show for a word: every letter it needs, then look-alike decoys,
 * then random letters, up to the pad size for that word.
 */
export function letterKeys(word: string, rng: Rng = Math.random): string[] {
  const count = padSize(word);
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
