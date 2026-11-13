import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { WordStream } from '../../lib/games';
import { AFTER_RIGHT_MS, AFTER_WRONG_MS, guardPool, judge, makeVisitor, PENALTY_MS, ROUND_MS, type Visitor } from '../../lib/guard';
import { wakeSound } from '../../lib/sound';
import type { AppData, Update } from '../../lib/store';
import { ALL_TOPICS, wordsInTopic } from '../../lib/words';
import { TranslationLines } from '../Cards';
import { GameShell, MistakesList, Tally, type Mistake } from './GameShell';

/** The timer is a row of honey cells, each holding this share of the round, draining one by one. */
const TIMER_CELLS = 12;
const CELL_MS = ROUND_MS / TIMER_CELLS;
/** A swipe released further than this counts as that side's button. */
const SWIPE_PX = 72;
/** The card tilts this much at most while it follows the finger. */
const MAX_TILT_DEG = 12;

type Phase = 'ready' | 'playing' | 'over';

/** The call made on the visitor on screen, while it is shown. */
interface Call {
  letIn: boolean;
  right: boolean;
}

/**
 * The guard at the hive's door: a Maltese word and a meaning; let it in when they belong together,
 * sting it when they don't. Thirty seconds; a wrong call costs two more.
 */
export function TrueOrSting({ data, update, onExit }: { data: AppData; update: Update; onExit: () => void }) {
  const [{ topic, show }] = useState(data.settings);
  const [words] = useState(() => guardPool(wordsInTopic(topic, data.settings), wordsInTopic(ALL_TOPICS, data.settings)));
  const [stream] = useState(() => new WordStream(words));
  const [phase, setPhase] = useState<Phase>('ready');
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [turn, setTurn] = useState(0);
  const [call, setCall] = useState<Call | null>(null);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [remaining, setRemaining] = useState(ROUND_MS);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  // The record to beat, fixed when the round starts.
  const [bestBefore, setBestBefore] = useState(data.games.stingBest);

  const endAt = useRef(0);
  const scoreRef = useRef(0);
  /** Right calls in a row. Never shown. */
  const run = useRef(0);
  /** The truth of the visitors so far, so the same kind never comes too often in a row. */
  const history = useRef<boolean[]>([]);
  const nextTimer = useRef<number | undefined>(undefined);
  /** A swipe in progress: where it started, and how far it has gone. */
  const drag = useRef<{ id: number; x: number } | null>(null);
  const [dx, setDx] = useState(0);
  const motion = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const ask = useCallback(() => {
    const v = makeVisitor(stream.next(), words, run.current, history.current);
    history.current.push(v.honest);
    setVisitor(v);
    setCall(null);
    setDx(0);
    setTurn((n) => n + 1);
  }, [words, stream]);

  const start = () => {
    if (data.settings.sound) wakeSound();
    window.clearTimeout(nextTimer.current);
    scoreRef.current = 0;
    run.current = 0;
    history.current = [];
    setScore(0);
    setWrong(0);
    setMistakes([]);
    setBestBefore(data.games.stingBest);
    endAt.current = Date.now() + ROUND_MS;
    setRemaining(ROUND_MS);
    setPhase('playing');
    ask();
  };

  useEffect(() => {
    if (phase !== 'playing') return;
    const tick = window.setInterval(() => {
      const left = endAt.current - Date.now();
      if (left > 0) {
        setRemaining(left);
        return;
      }
      window.clearTimeout(nextTimer.current);
      setRemaining(0);
      setPhase('over');
      const final = scoreRef.current;
      update((d) => (final > d.games.stingBest ? { ...d, games: { ...d.games, stingBest: final } } : d));
    }, 100);
    return () => window.clearInterval(tick);
  }, [phase, update]);

  useEffect(() => () => window.clearTimeout(nextTimer.current), []);

  /** Let in (`true`) or sting (`false`) the visitor on screen. */
  const decide = (letIn: boolean) => {
    if (phase !== 'playing' || call !== null || !visitor) return;
    const right = judge(visitor, letIn);
    setCall({ letIn, right });
    if (right) {
      run.current += 1;
      scoreRef.current += 1;
      setScore(scoreRef.current);
    } else {
      run.current = 0;
      endAt.current -= PENALTY_MS;
      setRemaining(Math.max(0, endAt.current - Date.now()));
      setWrong((n) => n + 1);
      stream.repeatLater(visitor.word);
      setMistakes((list) => [...list, { word: visitor.word, chosen: visitor.honest ? null : visitor.claim }]);
    }
    nextTimer.current = window.setTimeout(ask, right ? AFTER_RIGHT_MS : AFTER_WRONG_MS);
  };
  const decideRef = useRef(decide);
  decideRef.current = decide;

  // ← stings, → lets in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') decideRef.current(false);
      else if (e.key === 'ArrowRight') decideRef.current(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- swipe ---------- */

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (phase !== 'playing' || call !== null || drag.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setDx(e.clientX - d.x);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const moved = e.clientX - d.x;
    setDx(0);
    // A tap does nothing; a swipe far enough counts as that side's button.
    if (Math.abs(moved) >= SWIPE_PX) decide(moved > 0);
  };

  const onPointerCancel = () => {
    drag.current = null;
    setDx(0);
  };

  const seconds = Math.ceil(remaining / 1000);
  const follow = !motion.current && dx !== 0;
  const cardStyle: CSSProperties | undefined = follow
    ? { transform: `translateX(${dx}px) rotate(${Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, dx / 12))}deg)`, transition: 'none' }
    : undefined;
  const leaning = dx >= SWIPE_PX ? ' is-leaning-in' : dx <= -SWIPE_PX ? ' is-leaning-out' : '';

  if (import.meta.env.DEV) {
    // Lets the automated check play; stripped from the production build.
    (window as unknown as Record<string, unknown>).__sting = {
      state: { phase, word: visitor?.word.id ?? null, claim: visitor?.claim.id ?? null, honest: visitor?.honest ?? null, run: run.current, left: Math.max(0, endAt.current - Date.now()), call },
    };
  }

  return (
    <GameShell title="True or sting" status={phase === 'playing' ? <Tally ok={score} bad={wrong} /> : ''} onExit={onExit}>
      {phase === 'playing' && visitor && (
        <>
          <div className="timer">
            <div className="honey-timer" role="timer" aria-label={`${seconds} seconds left`}>
              {Array.from({ length: TIMER_CELLS }, (_, i) => (
                <i key={i} style={{ '--fill': Math.min(1, Math.max(0, (remaining - i * CELL_MS) / CELL_MS)) } as CSSProperties} />
              ))}
            </div>
            <span className="timer-num">{seconds}s</span>
          </div>

          <div
            key={turn}
            className={`card card-quiz comb-bg sting-card${leaning}${call ? (call.right ? ' is-right' : ' is-wrong') : ''}`}
            style={cardStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <p className="word-mt" lang="mt">
              {visitor.word.mt}
            </p>
            <p className="bee-equals" aria-hidden="true">
              =
            </p>
            <div className={`sting-claim${call && !call.right && !visitor.honest ? ' is-false' : ''}`}>
              <TranslationLines word={visitor.claim} show={show} />
            </div>
            {call && !call.right && (
              <div className="sting-correction" role="status">
                {visitor.honest ? (
                  <p className="sting-note">this was true</p>
                ) : (
                  <>
                    <p className="sting-note">it means</p>
                    <TranslationLines word={visitor.word} show={show} />
                  </>
                )}
              </div>
            )}
          </div>

          <div className="sting-buttons">
            <button className="btn sting-btn sting-no" aria-label="Sting: the meaning is wrong" onClick={() => decide(false)} disabled={call !== null}>
              ✗ Sting
            </button>
            <button className="btn sting-btn sting-yes" aria-label="Let in: the meaning is right" onClick={() => decide(true)} disabled={call !== null}>
              ✓ Let in
            </button>
          </div>
        </>
      )}

      {phase === 'ready' && (
        <div className="card card-done">
          <p className="done-title">30 seconds</p>
          <p className="done-text">A Maltese word and a meaning. Let it in if they match, sting it if they don’t. A wrong call costs two seconds.</p>
          <p className="muted">Swipe right or → to let in, left or ← to sting.</p>
          {data.games.stingBest > 0 && <p className="muted">Your best: {data.games.stingBest}</p>}
          <div className="done-actions">
            <button className="btn btn-primary btn-wide" onClick={start} autoFocus>
              Start
            </button>
          </div>
        </div>
      )}

      {phase === 'over' && (
        <div className="card card-done bee-summary" role="status">
          <p className="done-title">{score}</p>
          <p className="done-text">
            {score === 1 ? 'right call' : 'right calls'} in 30 seconds, {wrong} wrong
          </p>
          <p className="muted">
            {score > bestBefore && bestBefore > 0
              ? `New best! Before: ${bestBefore}`
              : bestBefore > 0
                ? `Your best: ${Math.max(score, bestBefore)}`
                : ''}
          </p>
          <MistakesList mistakes={mistakes} dir="mt2x" show={show} missedText="you stung an honest bee" />
          <div className="done-actions">
            <button className="btn btn-secondary btn-wide" onClick={start}>
              Play again
            </button>
            <button className="btn btn-primary btn-wide" onClick={onExit}>
              Done
            </button>
          </div>
        </div>
      )}
    </GameShell>
  );
}
