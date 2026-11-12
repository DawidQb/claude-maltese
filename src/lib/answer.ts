import { fold } from './text';

export type Verdict = 'correct' | 'close' | 'wrong';

/** Maltese definite article in its assimilated forms: il-, it-, is-, l-, … */
const ARTICLE = /^(i?l|i[tdnrsxzżċ])-/;

/** Case, spacing, punctuation and vowel accents (kafè) never count against an answer. */
function clean(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[…?!.,]/g, '')
    .replace(/[àá]/g, 'a')
    .replace(/[èé]/g, 'e')
    .replace(/[ìí]/g, 'i')
    .replace(/[òó]/g, 'o')
    .replace(/[ùú]/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Letters only, without the dots and bars: what is left when special letters are ignored. */
function loose(text: string): string {
  return fold(text).replace(/[^a-z0-9]/g, '');
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Scores a typed Maltese answer.
 * - correct: the same word (the article may be added or left out)
 * - close: right letters but wrong special characters or apostrophe, or one typo
 * - wrong: anything else, including an empty answer
 */
export function checkAnswer(typed: string, expected: string): Verdict {
  const t = clean(typed);
  const e = clean(expected);
  if (t === '') return 'wrong';

  const tBare = t.replace(ARTICLE, '');
  const eBare = e.replace(ARTICLE, '');
  if (t === e || tBare === eBare) return 'correct';

  const lt = loose(tBare);
  const le = loose(eBare);
  if (lt === le) return 'close';
  if (le.length >= 4 && editDistance(lt, le) <= 1) return 'close';
  return 'wrong';
}
