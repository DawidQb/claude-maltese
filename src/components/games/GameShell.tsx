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

/**
 * While `active`, the page stands still: it does not scroll, bounce or pull to refresh, so a
 * finger on the screen is only ever part of the game. For games played by swiping or tracing.
 */
export function useStillPage(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    // Locked from the top, so the header is never left out of sight.
    window.scrollTo(0, 0);
    root.classList.add('no-scroll');
    return () => root.classList.remove('no-scroll');
  }, [active]);
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

/** The sound switch's icon: a speaker, with waves when on and a cross when off. */
export function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13" /> : <path d="M17 9.5l5 5M22 9.5l-5 5" />}
    </svg>
  );
}
