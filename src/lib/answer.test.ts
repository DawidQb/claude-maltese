import { describe, expect, it } from 'vitest';
import { checkAnswer } from './answer';
import { WORDS } from './words';

describe('checkAnswer', () => {
  it('accepts the exact word, ignoring case, spacing and punctuation', () => {
    expect(checkAnswer('ħobż', 'ħobż')).toBe('correct');
    expect(checkAnswer('  Ħobż ', 'ħobż')).toBe('correct');
    expect(checkAnswer('kif int', 'kif int?')).toBe('correct');
    expect(checkAnswer('jisimni', 'jisimni…')).toBe('correct');
    expect(checkAnswer('jekk  jogħġbok', 'jekk jogħġbok')).toBe('correct');
  });

  it('accepts curly apostrophes and missing vowel accents', () => {
    expect(checkAnswer('sema’', "sema'")).toBe('correct');
    expect(checkAnswer('kafe', 'kafè')).toBe('correct');
    expect(checkAnswer('te', 'tè')).toBe('correct');
  });

  it('lets the article be added or left out', () => {
    expect(checkAnswer('Ħadd', 'il-Ħadd')).toBe('correct');
    expect(checkAnswer('tnejn', 'it-Tnejn')).toBe('correct');
    expect(checkAnswer('erbgħa', 'l-Erbgħa')).toBe('correct');
    expect(checkAnswer('il-ħobż', 'ħobż')).toBe('correct');
    // "bil-" is a preposition, not the article, so it must be typed.
    expect(checkAnswer('ġuħ', 'bil-ġuħ')).toBe('wrong');
  });

  it('marks missing special letters and apostrophes as close', () => {
    expect(checkAnswer('hobz', 'ħobż')).toBe('close');
    expect(checkAnswer('bongu', 'bonġu')).toBe('close');
    expect(checkAnswer('sema', "sema'")).toBe('close');
    expect(checkAnswer('lejl it tajjeb', 'il-lejl it-tajjeb')).toBe('close');
  });

  it('marks a single typo as close, but only in words of four letters or more', () => {
    expect(checkAnswer('grazi', 'grazzi')).toBe('close');
    expect(checkAnswer('merħbe', 'merħba')).toBe('close');
    expect(checkAnswer('bar', 'dar')).toBe('wrong');
    expect(checkAnswer('le', 'iva')).toBe('wrong');
  });

  it('marks different words and empty answers as wrong', () => {
    expect(checkAnswer('', 'ħobż')).toBe('wrong');
    expect(checkAnswer('   ', 'ħobż')).toBe('wrong');
    expect(checkAnswer('ilma', 'ħalib')).toBe('wrong');
  });

  it('accepts every seed word typed exactly as stored', () => {
    for (const w of WORDS) expect(checkAnswer(w.mt, w.mt), w.mt).toBe('correct');
  });
});
