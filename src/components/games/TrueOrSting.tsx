import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { WordStream } from '../../lib/games';
import { AFTER_RIGHT_MS, AFTER_WRONG_MS, guardPool, judge, makeVisitor, PENALTY_MS, ROUND_MS, type Visitor } from '../../lib/guard';
import { playSound, wakeSound, type Sound } from '../../lib/sound';
import type { AppData, Update } from '../../lib/store';
import { ALL_TOPICS, wordsInTopic } from '../../lib/words';
import { TranslationLines } from '../Cards';
import { GameShell, MistakesList, Tally, type Mistake } from './GameShell';

/** The timer is a row of honey cells, each holding this share of the round, draining one by one. */
const TIMER_CELLS = 12;
const CELL_MS = ROUND_MS / TIMER_CELLS;
/** A swipe released further than this counts as that side's button. */
const SWIPE_PX = 72;
/**
 * A gesture picks its direction once the finger has moved this far: mostly sideways, it is a
 * swipe and the card follows; mostly up or down, it is a scroll of the page and the card ignores
 * the rest of it, so scrolling never moves the card or makes a call.
 */
const LOCK_PX = 10;
/** Sideways means at least this many times more across than up or down. */
const SIDEWAYS = 1.2;
/** The card tilts this much at most while it follows the finger. */
const MAX_TILT_DEG = 12;
/** The timer cells a wrong call empties flash red this long. */
const LOST_FLASH_MS = 600;
/** Each right call in a row raises the sting's zap by this much, up to `MAX_PITCH`. */
const PITCH_STEP = 0.03;
const MAX_PITCH = 1.3;
/** Vibration after a wrong call, in ms. */
const BUZZ_MS = 40;

/** The tilt of a card dragged `dx` px. */
const tilt = (dx: number) => Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, dx / 12));

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
  const drag = useRef<{ id: number; x: number; y: number; swiping: boolean } | null>(null);
  const [dx, setDx] = useState(0);
  /** The clock before and after the last penalty, so the cells it emptied can flash. */
  const [lost, setLost] = useState<{ from: number; to: number } | null>(null);
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

  // While a round runs the page does not scroll, bounce or refresh: a finger on the screen is for swiping only.
  useEffect(() => {
    if (phase !== 'playing') return;
    const root = document.documentElement;
    root.classList.add('no-scroll');
    return () => root.classList.remove('no-scroll');
  }, [phase]);

  useEffect(() => {
    if (!lost) return;
    const id = window.setTimeout(() => setLost(null), LOST_FLASH_MS);
    return () => window.clearTimeout(id);
  }, [lost]);

  /** A sound, and with it a buzz on phones that can; both off with the sound switch. */
  const feedback = (name: Sound, pitch = 1, buzz = 0) => {
    if (!data.settings.sound) return;
    playSound(name, pitch);
    if (buzz) navigator.vibrate?.(buzz);
  };

  /** Let in (`true`) or sting (`false`) the visitor on screen. */
  const decide = (letIn: boolean) => {
    if (phase !== 'playing' || call !== null || !visitor) return;
    const right = judge(visitor, letIn);
    setCall({ letIn, right });
    if (right) {
      feedback(letIn ? 'pollen' : 'laser', Math.min(MAX_PITCH, 1 + run.current * PITCH_STEP));
      run.current += 1;
      scoreRef.current += 1;
      setScore(scoreRef.current);
    } else {
      feedback('wrong', 1, BUZZ_MS);
      run.current = 0;
      const before = Math.max(0, endAt.current - Date.now());
      endAt.current -= PENALTY_MS;
      setRemaining(Math.max(0, endAt.current - Date.now()));
      setLost({ from: Math.max(0, before - PENALTY_MS), to: before });
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
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, swiping: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.swiping) {
      if (Math.max(Math.abs(mx), Math.abs(my)) < LOCK_PX) return;
      if (Math.abs(mx) < Math.abs(my) * SIDEWAYS) {
        // Up or down: a scroll. Let the page have it.
        drag.current = null;
        return;
      }
      d.swiping = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDx(mx);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const moved = e.clientX - d.x;
    // A tap does nothing; a swipe far enough counts as that side's button, and the card flies on from where it was let go.
    if (d.swiping && Math.abs(moved) >= SWIPE_PX) {
      setDx(moved);
      decide(moved > 0);
    } else setDx(0);
  };

  const onPointerCancel = () => {
    drag.current = null;
    setDx(0);
  };

  const seconds = Math.ceil(remaining / 1000);
  const still = motion.current;
  // While dragged the card follows the finger; once decided, a right call flies off from there and a wrong one springs back.
  const cardStyle: CSSProperties | undefined = still
    ? undefined
    : call
      ? ({ '--from-x': `${dx}px`, '--from-r': `${tilt(dx)}deg` } as CSSProperties)
      : dx !== 0
        ? { transform: `translateX(${dx}px) rotate(${tilt(dx)}deg)`, transition: 'none' }
        : undefined;
  const leaning = call ? '' : dx >= SWIPE_PX ? ' is-leaning-in' : dx <= -SWIPE_PX ? ' is-leaning-out' : '';
  const exit = call?.right ? (call.letIn ? ' is-in' : ' is-out') : call ? ' is-wrong' : '';

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
                <i
                  key={i}
                  className={lost && (i + 1) * CELL_MS > lost.from && i * CELL_MS < lost.to ? 'is-lost' : undefined}
                  style={{ '--fill': Math.min(1, Math.max(0, (remaining - i * CELL_MS) / CELL_MS)) } as CSSProperties}
                />
              ))}
            </div>
            <span className="timer-num">{seconds}s</span>
          </div>

          <div
            key={turn}
            className={`card card-quiz comb-bg sting-card${leaning}${exit}`}
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
            <div className={`sting-claim${call && !call.right ? (visitor.honest ? ' is-true' : ' is-false') : ''}`}>
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
