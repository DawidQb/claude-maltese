import { useEffect, type ReactNode } from 'react';
import { doorLabel, promptLabel } from '../../lib/bounce';
import type { Direction } from '../../lib/srs';
import type { ShowLang } from '../../lib/store';
import type { Word } from '../../lib/words';

interface Props {
  title: string;
  /** Short status shown on the right of the header. */
  status?: ReactNode;
  onExit: () => void;
  children: ReactNode;
}

/** Successes and fails, side by side. The only score the games show. */
export function Tally({ ok, bad }: { ok: number; bad: number }) {
  return (
    <span className="tally" role="img" aria-label={`${ok} correct, ${bad} wrong`}>
      <span className="tally-ok">✓ {ok}</span>
      <span className="tally-bad">✗ {bad}</span>
    </span>
  );
}

/** Full-screen frame shared by the games: back button, title, status. */
export function GameShell({ title, status, onExit, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <div className="study">
      <header className="study-head">
        <button className="btn btn-ghost" onClick={onExit}>
          ← Back
        </button>
        <span className="study-dir">{title}</span>
        <span className="study-count" aria-live="polite">
          {status}
        </span>
      </header>
      {children}
    </div>
  );
}

/** A word asked in a game, and the wrong answer picked for it (null: none was picked). */
export interface Mistake {
  word: Word;
  chosen: Word | null;
}

/** A side of a word as one line of text, marked as Maltese when it is. */
function Side({ lines, maltese }: { lines: string[]; maltese: boolean }) {
  return maltese ? <span lang="mt">{lines.join(' · ')}</span> : <>{lines.join(' · ')}</>;
}

/**
 * The mistakes of a round, for the summary: what was asked, the right answer, and the answer
 * chosen instead, or `missedText` when there was none. Follows the direction the game was played in.
 */
export function MistakesList({ mistakes, dir, show, missedText }: { mistakes: Mistake[]; dir: Direction; show: ShowLang; missedText: string }) {
  if (mistakes.length === 0) return null;
  const askedMaltese = dir === 'mt2x';
  return (
    <div className="bee-missed">
      <h2 className="eyebrow">Your mistakes</h2>
      <ul className="wordlist">
        {mistakes.map(({ word, chosen }, i) => (
          <li key={i}>
            <div className="wordlist-text">
              <span className="mistake-asked">
                <Side lines={promptLabel(word, dir, show)} maltese={askedMaltese} />
              </span>
              <span className="mistake mistake-right">
                <b>✓</b> <Side lines={doorLabel(word, dir, show)} maltese={!askedMaltese} />
              </span>
              <span className="mistake mistake-wrong">
                <b>✗</b>{' '}
                {chosen ? (
                  <>
                    you chose <Side lines={doorLabel(chosen, dir, show)} maltese={!askedMaltese} />
                  </>
                ) : (
                  missedText
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
