import { useEffect, useState } from 'react';
import { checkAnswer, type Verdict } from '../lib/answer';
import { keyLabel, letterKeys } from '../lib/letters';
import type { Grade } from '../lib/srs';
import type { ShowLang } from '../lib/store';
import type { Word } from '../lib/words';

/* ---------- Typing mode: spell the Maltese word on a letter pad, the app checks it ---------- */

const VERDICT: Record<Verdict, { title: string; grade: Grade }> = {
  correct: { title: 'Correct', grade: 'knew' },
  close: { title: 'Almost', grade: 'almost' },
  wrong: { title: 'Not quite', grade: 'no' },
};

interface TypeProps {
  word: Word;
  show: ShowLang;
  /** Accept a correctly spelled word as soon as it is complete, without a tap on Check. */
  autoCheck: boolean;
  /** Called when the learner moves on: 'knew', 'almost' or 'no'. */
  onGrade: (grade: Grade) => void;
  /** Once checked, a tap anywhere on the card does what Continue does. */
  tapToContinue?: boolean;
  /** The games' honeycomb look: hexagonal keys in a comb, and comb on the card. */
  comb?: boolean;
}

/** The question, and once it has been checked, the verdict and the right answer. */
function QuestionCard(props: { word: Word; show: ShowLang; verdict: Verdict | null; typed: string; onTap?: () => void; comb: boolean }) {
  const { word, show, verdict, typed, onTap, comb } = props;
  // The Continue button stays the accessible control; the tap is a shortcut for touch.
  const tappable = verdict !== null && onTap !== undefined;
  return (
    <div className={`card card-typing${tappable ? ' card-tappable' : ''}${comb ? ' comb-bg' : ''}`} onClick={tappable ? onTap : undefined}>
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
          <Forms word={word} />
          {word.note && <p className="card-note">{word.note}</p>}
        </div>
      )}
    </div>
  );
}

function ResultButtons({ verdict, onGrade }: { verdict: Verdict; onGrade: (grade: Grade) => void }) {
  return (
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
  );
}

/**
 * Spelling on a letter pad, so the device keyboard never opens: ten keys holding
 * the word's own letters and some decoys. A hardware keyboard still works.
 * Used by typing mode on the Study tab and by the infinite typing game.
 */
export function TileCard({ word, show, autoCheck, onGrade, tapToContinue = false, comb = false }: TypeProps) {
  const [keys] = useState(() => letterKeys(word.mt));
  // The answer so far, one entry per key press, so that backspace removes "għ" in one go.
  const [typedKeys, setTypedKeys] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const typed = typedKeys.join('');

  // Only a fully correct spelling is accepted on its own; anything else waits for Check.
  useEffect(() => {
    if (autoCheck && !verdict && checkAnswer(typed, word.mt) === 'correct') setVerdict('correct');
  }, [autoCheck, verdict, typed, word.mt]);

  useEffect(() => {
    if (verdict) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        setVerdict(checkAnswer(typed, word.mt));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setTypedKeys((t) => t.slice(0, -1));
      } else if (e.key.length === 1) {
        e.preventDefault();
        setTypedKeys((t) => [...t, e.key.toLowerCase()]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [verdict, typed, word.mt]);

  return (
    <>
      <QuestionCard
        word={word}
        show={show}
        verdict={verdict}
        typed={typed.trim()}
        comb={comb}
        onTap={tapToContinue && verdict ? () => onGrade(VERDICT[verdict].grade) : undefined}
      />

      <div className="actions">
        {verdict ? (
          <ResultButtons verdict={verdict} onGrade={onGrade} />
        ) : (
          <div className="type-form">
            <div className="tile-entry">
              <p className={`tile-display${typed ? '' : ' is-empty'}`} lang="mt" aria-live="polite" aria-label="Your answer">
                {typed ? typedKeys.map(keyLabel).join('') : 'Tap the letters'}
              </p>
              <button
                type="button"
                className="key key-erase"
                aria-label="Delete the last letter"
                disabled={typedKeys.length === 0}
                onClick={() => setTypedKeys((t) => t.slice(0, -1))}
              >
                ⌫
              </button>
            </div>
            <div className={`keys keys-pad${comb ? ' keys-comb' : ''}`} role="group" aria-label="Letters">
              {keys.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="key"
                  lang="mt"
                  aria-label={k === ' ' ? 'space' : k}
                  onClick={() => setTypedKeys((t) => [...t, k])}
                >
                  {keyLabel(k)}
                </button>
              ))}
            </div>
            <div className="result-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setVerdict('wrong')}>
                Don’t know
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setVerdict(checkAnswer(typed, word.mt))}>
                Check
              </button>
            </div>
          </div>
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

/** The related form of a word: a noun's plural or singular, or the verb a conjugated form comes from. */
export function Forms({ word }: { word: Word }) {
  const other = word.plural ?? word.pluralOf ?? word.formOf;
  if (!other) return null;
  return (
    <p className="card-forms">
      {word.plural ? 'plural' : word.pluralOf ? 'singular' : 'form of'}: <span lang="mt">{other}</span>
    </p>
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
