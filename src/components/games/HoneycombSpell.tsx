import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { WordStream } from '../../lib/games';
import { keyLabel, toKeys } from '../../lib/letters';
import { playSound, wakeSound, type Sound } from '../../lib/sound';
import {
  cellAt,
  FLASH_MS,
  hexCentre,
  judge,
  makeComb,
  SHOWN_MS,
  SPELLED_MS,
  spellPool,
  trace,
  TRIES,
} from '../../lib/spell';
import type { AppData, Update } from '../../lib/store';
import { ALL_TOPICS, wordsInTopic } from '../../lib/words';
import { Face } from '../Cards';
import { GameShell, MistakesList, SpeakerIcon, Tally, type Mistake } from './GameShell';

/** The largest cell radius, in px; the comb is smaller when the screen is. */
const MAX_SIZE = 46;
/** A cell is drawn this much smaller than its place in the comb, leaving a gap between cells. */
const CELL_SCALE = 0.93;
/** A fast finger is followed in steps of this share of a cell's radius, so no cell it crosses is missed. */
const SAMPLE = 0.25;

/* Effects. None of them changes the rules. */
/** A word shown lights up one cell of its path this often. */
const SHOW_STEP_MS = 150;
/** The cells of a word spelled pop one after another, this far apart. */
const POP_STEP_MS = 60;
/** Each letter traced blips a step up a major scale (semitones above the first). */
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14];
/** Vibration after a failed trace, in ms. */
const BUZZ_MS = 30;

type Phase = 'playing' | 'flash' | 'spelled' | 'shown' | 'over';

/** A press on the comb: where it started, the trace before it, and whether the finger has left that cell. */
interface Press {
  id: number;
  cell: number | null;
  before: number[];
  left: boolean;
  last: { x: number; y: number };
}

/**
 * The letters of a Maltese word are hidden in a comb of nineteen cells, each next to the one
 * before; trace it from cell to cell, by sliding or by taps. Endless, like Infinite typing.
 */
export function HoneycombSpell({ data, update, onExit }: { data: AppData; update: Update; onExit: () => void }) {
  const [{ topic, show }] = useState(data.settings);
  const [stream] = useState(() => new WordStream(spellPool(wordsInTopic(topic, data.settings), wordsInTopic(ALL_TOPICS, data.settings))));
  /** Words spelled in a row. Never shown. */
  const run = useRef(0);
  const [round, setRound] = useState(() => {
    const word = stream.next();
    return { word, comb: makeComb(word, 0), turn: 0 };
  });
  const { word, comb } = round;
  const [path, setPath] = useState<number[]>([]);
  const pathRef = useRef<number[]>([]);
  const [tries, setTries] = useState(TRIES);
  /** Whether this word has had a failed trace: spelled after one, it still comes back later. */
  const failed = useRef(false);
  const [phase, setPhase] = useState<Phase>('playing');
  const phaseRef = useRef<Phase>('playing');
  const [tally, setTally] = useState({ ok: 0, bad: 0 });
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const sound = data.settings.sound;
  const woke = useRef(false);
  /** Cells of the path lit so far while a word is shown. */
  const [revealed, setRevealed] = useState(0);
  const motion = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const combRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const press = useRef<Press | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const keys = toKeys(word.mt);
  const size = Math.min(MAX_SIZE, box.w / (5 * Math.sqrt(3)), box.h / 8);

  useLayoutEffect(() => {
    const el = combRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [phase === 'over']);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => (motion.current = query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // A word shown lights up cell by cell along its path; at once with reduced motion.
  useEffect(() => {
    if (phase !== 'shown') return;
    const length = comb.path.length;
    if (motion.current) {
      setRevealed(length);
      return;
    }
    setRevealed(1);
    const id = window.setInterval(() => setRevealed((n) => (n >= length ? n : n + 1)), SHOW_STEP_MS);
    return () => window.clearInterval(id);
  }, [phase, comb]);

  /** A sound, and with it a buzz on phones that can; both off with the sound switch. */
  const feedback = (name: Sound, pitch = 1, buzz = 0) => {
    if (!sound) return;
    playSound(name, pitch);
    if (buzz) navigator.vibrate?.(buzz);
  };

  const enter = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const later = (ms: number, fn: () => void) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };

  const setTrace = (next: number[]) => {
    pathRef.current = next;
    setPath(next);
  };

  /** The next word, in a new comb. */
  const nextWord = () => {
    window.clearTimeout(timer.current);
    const w = stream.next();
    setRound((r) => ({ word: w, comb: makeComb(w, run.current), turn: r.turn + 1 }));
    setTrace([]);
    setTries(TRIES);
    setRevealed(0);
    failed.current = false;
    press.current = null;
    enter('playing');
  };

  /** Gives up on the word: the comb shows where it was. */
  const showWord = () => {
    if (phaseRef.current !== 'playing' && phaseRef.current !== 'flash') return;
    run.current = 0;
    stream.repeatLater(word);
    setTally((t) => ({ ...t, bad: t.bad + 1 }));
    setMistakes((list) => [...list, { word, chosen: null }]);
    setTrace([]);
    press.current = null;
    feedback('wrong');
    enter('shown');
    later(SHOWN_MS, nextWord);
  };

  /** Puts a new trace in place and judges it. */
  const change = (next: number[]) => {
    const before = pathRef.current;
    if (next.length === before.length && next.every((c, i) => c === before[i])) return;
    setTrace(next);
    const verdict = judge(comb, next, word);
    if (verdict === 'open' && next.length > before.length) {
      feedback('pollen', 2 ** (SCALE[Math.min(next.length, SCALE.length) - 1] / 12));
    } else if (verdict === 'right') {
      feedback('right');
      run.current += 1;
      if (failed.current) stream.repeatLater(word);
      setTally((t) => ({ ...t, ok: t.ok + 1 }));
      press.current = null;
      enter('spelled');
      later(SPELLED_MS, nextWord);
    } else if (verdict === 'wrong') {
      failed.current = true;
      feedback('bump', 1, BUZZ_MS);
      const left = tries - 1;
      setTries(left);
      press.current = null;
      enter('flash');
      later(FLASH_MS, () => {
        setTrace([]);
        if (left <= 0) showWord();
        else enter('playing');
      });
    }
  };

  /* ---------- input ---------- */

  /** The point of a pointer event, relative to the comb's centre. */
  const point = (e: ReactPointerEvent) => {
    const rect = combRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!woke.current && sound) {
      wakeSound();
      woke.current = true;
    }
    if (phaseRef.current === 'shown') {
      // A tap moves on from a word shown.
      nextWord();
      return;
    }
    if (phaseRef.current !== 'playing' || press.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    const cell = cellAt(p.x, p.y, size);
    press.current = { id: e.pointerId, cell, before: pathRef.current, left: false, last: p };
    if (cell !== null) change(trace(pathRef.current, cell, 'drag'));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId || phaseRef.current !== 'playing') return;
    const p = point(e);
    // Follow the finger in short steps, so a fast slide still passes through every cell it crosses.
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - pr.last.x, p.y - pr.last.y) / (size * SAMPLE)));
    for (let k = 1; k <= steps && press.current === pr; k++) {
      const x = pr.last.x + ((p.x - pr.last.x) * k) / steps;
      const y = pr.last.y + ((p.y - pr.last.y) * k) / steps;
      const cell = cellAt(x, y, size);
      if (cell === null) continue;
      if (cell !== pr.cell) pr.left = true;
      change(trace(pathRef.current, cell, 'drag'));
    }
    pr.last = p;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId) return;
    press.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // A press and release on one cell is a tap: undo what the press did and tap instead.
    if (!pr.left && pr.cell !== null && phaseRef.current === 'playing') {
      pathRef.current = pr.before;
      change(trace(pr.before, pr.cell, 'tap'));
      if (pathRef.current === pr.before) setPath(pr.before);
    }
  };

  const onPointerCancel = () => {
    press.current = null;
  };

  /** Enter or Space on a focused cell: a tap. Pointer clicks are handled by the comb. */
  const onKeyClick = (cell: number, detail: number) => {
    if (detail !== 0) return;
    if (phaseRef.current === 'shown') return nextWord();
    if (phaseRef.current !== 'playing') return;
    if (!woke.current && sound) {
      wakeSound();
      woke.current = true;
    }
    change(trace(pathRef.current, cell, 'tap'));
  };

  const toggleSound = () => {
    // Turning sound on is a press, so the browser lets it start now.
    if (!sound) wakeSound();
    update((d) => ({ ...d, settings: { ...d.settings, sound: !d.settings.sound } }));
  };

  const playAgain = () => {
    run.current = 0;
    setTally({ ok: 0, bad: 0 });
    setMistakes([]);
    nextWord();
  };

  if (import.meta.env.DEV) {
    // Lets the automated check play; stripped from the production build.
    (window as unknown as Record<string, unknown>).__spell = {
      state: { phase, word: word.id, letters: comb.letters, answer: comb.path, trace: path, tries, run: run.current, marked: comb.marked, size },
    };
  }

  if (phase === 'over') {
    return (
      <GameShell title="Honeycomb spell" status="" onExit={onExit}>
        <div className="card card-done bee-summary" role="status">
          <p className="done-title">{tally.ok}</p>
          <p className="done-text">{tally.ok === 1 ? 'word spelled' : 'words spelled'}</p>
          <ul className="legend legend-center">
            <li>
              <i className="dot dot-known" />
              {tally.ok} right
            </li>
            <li>
              <i className="dot dot-no" />
              {tally.bad} wrong
            </li>
          </ul>
          <MistakesList mistakes={mistakes} dir="x2mt" show={show} missedText="shown in the comb" />
          <div className="done-actions">
            <button className="btn btn-secondary btn-wide" onClick={playAgain}>
              Play again
            </button>
            <button className="btn btn-primary btn-wide" onClick={onExit}>
              Done
            </button>
          </div>
        </div>
      </GameShell>
    );
  }

  const traced = path.map((i) => comb.letters[i]);
  const display = [...traced.map(keyLabel), ...Array.from({ length: Math.max(0, keys.length - traced.length) }, () => '·')].join(' ');
  const shown = phase === 'shown';
  const cellW = Math.sqrt(3) * size * CELL_SCALE;
  const cellH = 2 * size * CELL_SCALE;
  /** The line joins the cells traced, or the cells of a word shown lit so far. */
  const line = shown ? comb.path.slice(0, revealed) : path;
  const points = line
    .map((i) => {
      const c = hexCentre(i, size);
      return `${(box.w / 2 + c.x).toFixed(1)},${(box.h / 2 + c.y).toFixed(1)}`;
    })
    .join(' ');
  const lineState = shown || phase === 'spelled' ? 'is-right' : phase === 'flash' ? 'is-wrong' : '';

  return (
    <GameShell title="Honeycomb spell" status={<Tally ok={tally.ok} bad={tally.bad} />} onExit={onExit}>
      <div className="card comb-bg spell-meaning">
        <Face word={word} side="x" show={show} />
      </div>

      <p className={`tile-display spell-display${phase === 'flash' ? ' is-wrong' : phase === 'spelled' ? ' is-right' : ''}`} lang="mt" aria-live="polite" aria-label="Your trace">
        {shown ? word.mt : display}
      </p>

      <div
        ref={combRef}
        className={`spell-comb${phase === 'flash' ? ' is-shaking' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {size > 0 &&
          comb.letters.map((letter, i) => {
            const c = hexCentre(i, size);
            const at = path.indexOf(i);
            const inTrace = at >= 0;
            const onPath = comb.path.indexOf(i);
            const state = shown
              ? onPath >= 0 && onPath < revealed
                ? ' is-right'
                : ''
              : inTrace
                ? phase === 'flash'
                  ? ' is-wrong'
                  : phase === 'spelled'
                    ? ' is-right is-pop'
                    : ' is-picked'
                : '';
            // The ring marks the first cell until it is in use; then its state shows instead.
            const first = comb.marked && comb.path[0] === i && state === '';
            const style: CSSProperties = {
              left: `calc(50% + ${c.x - cellW / 2}px)`,
              top: `calc(50% + ${c.y - cellH / 2}px)`,
              width: cellW,
              height: cellH,
              animationDelay: phase === 'spelled' ? `${at * POP_STEP_MS}ms` : undefined,
            };
            return (
              <button
                key={`${round.turn}-${i}`}
                type="button"
                className={`cell spell-cell${first ? ' is-first' : ''}${state}`}
                style={style}
                lang="mt"
                data-cell={i}
                aria-pressed={inTrace}
                aria-label={first ? `${keyLabel(letter)}, first letter` : undefined}
                tabIndex={0}
                onClick={(e) => onKeyClick(i, e.detail)}
              >
                {keyLabel(letter)}
              </button>
            );
          })}
        {line.length > 1 && (
          <svg className={`spell-line ${lineState}`} width={box.w} height={box.h} aria-hidden="true">
            <polyline points={points} strokeWidth={Math.max(4, size * 0.2)} />
          </svg>
        )}
      </div>

      <div className="bee-foot">
        <div className="bee-foot-actions">
          <button className="btn btn-secondary btn-small" onClick={showWord} disabled={phase !== 'playing'}>
            Show me
          </button>
          <span className="hive-honey spell-tries" role="img" aria-label={`${tries} ${tries === 1 ? 'try' : 'tries'} left`}>
            {Array.from({ length: TRIES }, (_, i) => (
              <i key={i} className={`honey-cell${i < tries ? ' is-full' : ''}`} />
            ))}
          </span>
        </div>
        <div className="bee-foot-actions">
          <button
            className="btn btn-secondary btn-small bee-sound"
            aria-pressed={sound}
            aria-label="Sound and vibration"
            title={sound ? 'Sound on' : 'Sound off'}
            onClick={toggleSound}
          >
            <SpeakerIcon on={sound} />
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => enter('over')}>
            Finish
          </button>
        </div>
      </div>
    </GameShell>
  );
}
