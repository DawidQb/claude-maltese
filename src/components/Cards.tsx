import { useEffect, useRef, useState, type FormEvent } from 'react';
import { checkAnswer, type Verdict } from '../lib/answer';
import type { Grade } from '../lib/srs';
import type { ShowLang } from '../lib/store';
import type { Word } from '../lib/words';

/* ---------- Typing mode: write the Maltese word, the app checks it ---------- */

const SPECIAL_KEYS = ['ċ', 'ġ', 'għ', 'ħ', 'ż'];

const VERDICT: Record<Verdict, { title: string; grade: Grade }> = {
  correct: { title: 'Correct', grade: 'knew' },
  close: { title: 'Almost', grade: 'almost' },
  wrong: { title: 'Not quite', grade: 'no' },
};

interface TypeProps {
  word: Word;
  show: ShowLang;
  /** Called when the learner moves on: 'knew', 'almost' or 'no'. */
  onGrade: (grade: Grade) => void;
}

export function TypeCard({ word, show, onGrade }: TypeProps) {
  const [value, setValue] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Put the cursor back after a special-letter key rewrites the field.
  useEffect(() => {
    if (caret.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);

  const insert = (text: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    caret.current = start + text.length;
    setValue(value.slice(0, start) + text + value.slice(end));
    el?.focus();
  };

  const check = (e: FormEvent) => {
    e.preventDefault();
    setVerdict(checkAnswer(value, word.mt));
  };

  const typed = value.trim();

  return (
    <>
      <div className="card card-typing">
        <p className="card-side">Translate into Maltese</p>
        <Face word={word} side="x" show={show} />
        {verdict && (
          <div className="card-answer" role="status">
            <p className={`verdict verdict-${verdict}`}>{VERDICT[verdict].title}</p>
            <Face word={word} side="mt" show={show} />
            {verdict !== 'correct' && typed !== '' && (
              <p className="typed">
                You typed <span lang="mt">{typed}</span>
              </p>
            )}
            {word.note && <p className="card-note">{word.note}</p>}
          </div>
        )}
      </div>

      <div className="actions">
        {verdict ? (
          <div className="result-actions">
            {verdict !== 'correct' && (
              <button className="btn btn-secondary" onClick={() => onGrade('knew')}>
                I was right
              </button>
            )}
            <button className="btn btn-primary" onClick={() => onGrade(VERDICT[verdict].grade)} autoFocus>
              Continue
            </button>
          </div>
        ) : (
          <form className="type-form" onSubmit={check}>
            <input
              ref={inputRef}
              className="input type-input"
              lang="mt"
              aria-label="Your answer in Maltese"
              placeholder="Type the Maltese word"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
            />
            <div className="keys" role="group" aria-label="Maltese letters">
              {SPECIAL_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="key"
                  lang="mt"
                  // Keep focus (and the phone keyboard) on the text field.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => insert(k)}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="result-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setVerdict('wrong')}>
                Don’t know
              </button>
              <button type="submit" className="btn btn-primary">
                Check
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

export function Face({ word, side, show }: { word: Word; side: 'mt' | 'x'; show: ShowLang }) {
  if (side === 'mt') {
    return (
      <p className="word-mt" lang="mt">
        {word.mt}
      </p>
    );
  }
  return (
    <dl className="translations">
      {show !== 'en' && (
        <div>
          <dt>PL</dt>
          <dd lang="pl">{word.pl}</dd>
        </div>
      )}
      {show !== 'pl' && (
        <div>
          <dt>EN</dt>
          <dd lang="en">{word.en}</dd>
        </div>
      )}
    </dl>
  );
}

/** A word's translations on separate lines, for tiles and answer buttons. */
export function TranslationLines({ word, show }: { word: Word; show: ShowLang }) {
  return (
    <span className="tr-lines">
      {show !== 'en' && <span lang="pl">{word.pl}</span>}
      {show !== 'pl' && <span lang="en">{word.en}</span>}
    </span>
  );
}
