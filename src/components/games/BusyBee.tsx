import { useEffect, useRef, useState } from 'react';
import {
  BEE_RADIUS,
  beeWords,
  doorLabel,
  flap,
  newBee,
  nextSpeed,
  placeDoors,
  SPEED,
  step,
  turn,
  WALL,
  type Arena,
  type Bee,
} from '../../lib/bounce';
import { makeQuestion, WordStream, type Question } from '../../lib/games';
import type { Direction } from '../../lib/srs';
import type { AppData, ShowLang } from '../../lib/store';
import { ALL_TOPICS, wordsInTopic, type Word } from '../../lib/words';
import { Face } from '../Cards';
import { GameShell, Tally } from './GameShell';

const REVEAL_MS = 1400;
const MIN_POOL = 8;

interface Spark {
  text: string;
  x: number;
  y: number;
  born: number;
  good: boolean;
}

interface Colors {
  bg: string;
  wall: string;
  line: string;
  ink: string;
  muted: string;
  tag: string;
  good: string;
  bad: string;
  honey: string;
}

function readColors(): Colors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    bg: v('--surface'),
    wall: v('--surface-2'),
    line: v('--line'),
    ink: v('--ink'),
    muted: v('--muted'),
    tag: v('--bg'),
    good: v('--known'),
    bad: v('--no'),
    honey: v('--learning'),
  };
}

interface FieldProps {
  pool: Word[];
  dir: Direction;
  show: ShowLang;
  onStart: () => void;
  onCorrect: () => void;
  onWrong: (word: Word) => void;
}

/** The play area: the word at the top, the bee, the walls and their doors. One round per mount. */
function BeeField({ pool, dir, show, onStart, onCorrect, onWrong }: FieldProps) {
  const [stream] = useState(() => new WordStream(pool));
  const [question, setQuestion] = useState<Question>(() => makeQuestion(pool, stream.next(), Math.random, 2));
  const [reveal, setReveal] = useState<Word | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  // The loop below starts once; it reaches the latest callbacks through this ref.
  const cb = useRef({ onStart, onCorrect, onWrong });
  cb.current = { onStart, onCorrect, onWrong };
  /** Called on tap or key press; set by the game loop below. */
  const tapRef = useRef<() => void>(() => {});
  // The loop reads the first question once; later ones are created inside it.
  const firstQuestion = useRef(question);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const arena: Arena = { width: 0, height: 0 };
    let colors = readColors();
    let q = firstQuestion.current;
    let bee: Bee | null = null;
    let speed = SPEED.start;
    let running = false;
    /** While set, the game is paused to show the right answer; then the next question starts. */
    let pausedUntil = 0;
    let sparks: Spark[] = [];
    let shakeUntil = 0;
    let last = 0;
    let frame = 0;

    const correctOption = () => q.options.findIndex((w) => w.id === q.answer.id);
    /** Doors stay below the word shown at the top of the field. */
    const doors = () => placeDoors(arena, correctOption(), Math.random, (promptRef.current?.offsetHeight ?? 0) + 6);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      arena.width = wrap.clientWidth;
      arena.height = wrap.clientHeight;
      canvas.width = Math.round(arena.width * dpr);
      canvas.height = Math.round(arena.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!bee) {
        bee = newBee(arena, doors());
      } else {
        // Keep the bee on screen and rebuild the doors for the new size.
        bee.x = Math.min(Math.max(bee.x, WALL + BEE_RADIUS), arena.width - WALL - BEE_RADIUS);
        bee.y = Math.min(bee.y, arena.height - BEE_RADIUS);
        bee.doors = doors();
        if (running) bee.vx = bee.dir * speed * arena.width;
      }
    };

    const nextQuestion = () => {
      q = makeQuestion(pool, stream.next(), Math.random, 2);
      setQuestion(q);
    };

    const turnAround = () => turn(bee!, arena, speed, doors());

    const onWall = (event: 'correct' | 'wrong' | 'bump', now: number) => {
      const b = bee!;
      speed = nextSpeed(speed, event);
      if (event === 'correct') {
        cb.current.onCorrect();
        sparks.push({ text: '✓', x: b.x, y: b.y, born: now, good: true });
        nextQuestion();
        turnAround();
      } else if (event === 'wrong') {
        cb.current.onWrong(q.answer);
        sparks.push({ text: '✗', x: b.x, y: b.y, born: now, good: false });
        stream.repeatLater(q.answer);
        setReveal(q.answer);
        pausedUntil = now + REVEAL_MS;
      } else {
        // Hitting the wall is a flying slip, not a wrong answer: same question, other wall.
        shakeUntil = now + 180;
        turnAround();
      }
    };

    tapRef.current = () => {
      if (!bee || pausedUntil) return;
      if (!running) {
        running = true;
        bee.vx = bee.dir * speed * arena.width;
        cb.current.onStart();
      }
      flap(bee);
    };

    /* ---------- drawing ---------- */

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    const drawWall = (side: 1 | -1, withDoors: boolean) => {
      const x = side === 1 ? arena.width - WALL : 0;
      ctx.fillStyle = colors.wall;
      ctx.fillRect(x, 0, WALL, arena.height);
      // Stone courses.
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 22; y < arena.height; y += 22) {
        ctx.moveTo(x, y + 0.5);
        ctx.lineTo(x + WALL, y + 0.5);
      }
      ctx.stroke();
      if (!withDoors || !bee) return;

      for (const door of bee.doors) {
        // The opening, with a honey-coloured frame.
        ctx.fillStyle = colors.bg;
        ctx.fillRect(x, door.top, WALL, door.bottom - door.top);
        ctx.fillStyle = colors.honey;
        ctx.fillRect(x, door.top - 4, WALL, 4);
        ctx.fillRect(x, door.bottom, WALL, 4);
        drawLabel(side, door.top, door.bottom, doorLabel(q.options[door.option], dir, show));
      }
    };

    const drawLabel = (side: 1 | -1, top: number, bottom: number, lines: string[]) => {
      const maxWidth = arena.width * 0.5 - WALL;
      const maltese = dir === 'x2mt';
      const family = maltese ? "'Iowan Old Style', 'Palatino Linotype', Georgia, serif" : 'system-ui, sans-serif';
      // Shrink the text until the longest line fits.
      let size = maltese ? 22 : 18;
      const font = (px: number, bold: boolean) => `${bold ? 700 : 500} ${px}px ${family}`;
      const widest = () => Math.max(...lines.map((l, i) => (ctx.font = font(i === 0 ? size : size - 3, i === 0), ctx.measureText(l).width)));
      while (size > 12 && widest() > maxWidth - 24) size -= 1;

      const lineHeight = size + 5;
      const w = Math.min(maxWidth, widest() + 24);
      const h = lines.length * lineHeight + 14;
      const x = side === 1 ? arena.width - WALL - 6 - w : WALL + 6;
      const y = (top + bottom) / 2 - h / 2;

      roundRect(x, y, w, h, 10);
      ctx.fillStyle = colors.tag;
      ctx.fill();
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((text, i) => {
        ctx.font = font(i === 0 ? size : size - 3, i === 0);
        ctx.fillStyle = i === 0 ? colors.ink : colors.muted;
        ctx.fillText(text, x + w / 2, y + 7 + lineHeight * (i + 0.5), w - 12);
      });
    };

    const drawBee = (b: Bee, now: number) => {
      const r = BEE_RADIUS;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(b.dir, 1);
      ctx.rotate(Math.max(-0.5, Math.min(0.6, b.vy / 900)));

      // Wings, beating.
      const beat = Math.sin(now / 38) * 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1;
      for (const tilt of [-0.9 + beat, -0.35 + beat]) {
        ctx.save();
        ctx.translate(-2, -r * 0.55);
        ctx.rotate(tilt);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.6, r * 0.42, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Striped body.
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f2b705';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(-r * 0.55, -r, r * 0.3, r * 2);
      ctx.fillRect(r * 0.05, -r, r * 0.3, r * 2);
      ctx.restore();
      ctx.strokeStyle = '#2a2420';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Head, eye, sting.
      ctx.beginPath();
      ctx.arc(r * 1.0, -r * 0.1, r * 0.48, 0, Math.PI * 2);
      ctx.fillStyle = '#2a2420';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(r * 1.15, -r * 0.2, r * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, 0);
      ctx.lineTo(-r * 1.55, r * 0.05);
      ctx.strokeStyle = '#2a2420';
      ctx.stroke();
      ctx.restore();
    };

    const draw = (now: number) => {
      if (!bee) return;
      ctx.save();
      ctx.clearRect(0, 0, arena.width, arena.height);
      if (now < shakeUntil) ctx.translate(Math.sin(now / 12) * 3, 0);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, arena.width, arena.height);
      drawWall(1, bee.dir === 1);
      drawWall(-1, bee.dir === -1);
      drawBee(bee, now);

      sparks = sparks.filter((s) => now - s.born < 700);
      for (const s of sparks) {
        const age = (now - s.born) / 700;
        ctx.globalAlpha = 1 - age;
        ctx.font = '700 26px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = s.good ? colors.good : colors.bad;
        ctx.fillText(s.text, Math.min(Math.max(s.x, 30), arena.width - 30), s.y - 20 - age * 40);
      }
      ctx.restore();
    };

    /* ---------- loop ---------- */

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Long gaps (a hidden tab, a slow frame) must not fling the bee across the screen.
      const dt = Math.min((now - (last || now)) / 1000, 1 / 30);
      last = now;
      if (!bee) return;

      if (pausedUntil) {
        if (now >= pausedUntil) {
          pausedUntil = 0;
          setReveal(null);
          nextQuestion();
          turnAround();
          bee.vy = 0;
        }
      } else if (running) {
        const event = step(bee, dt, arena);
        if (event) onWall(event, now);
      } else {
        // Hovering before the first tap.
        bee.y = arena.height * 0.45 + Math.sin(now / 300) * 8;
      }
      draw(now);
    };

    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => (colors = readColors());
    scheme.addEventListener('change', onScheme);
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();
    frame = requestAnimationFrame(tick);

    if (import.meta.env.DEV) {
      // Lets the automated check fly the bee; stripped from the production build.
      (window as unknown as Record<string, unknown>).__bee = {
        get state() {
          return { bee, arena, running, paused: pausedUntil > 0, speed, answer: q.answer.id, options: q.options.map((w) => w.id) };
        },
      };
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scheme.removeEventListener('change', onScheme);
    };
  }, [pool, stream, dir, show]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        tapRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      ref={wrapRef}
      className="bee-arena"
      onPointerDown={(e) => {
        e.preventDefault();
        tapRef.current();
      }}
    >
      <canvas ref={canvasRef} role="img" aria-label="Game area: a bee flying between two walls with answer doors" />

      <div ref={promptRef} className="bee-prompt" aria-live="polite">
        <Face word={question.answer} side={dir === 'mt2x' ? 'mt' : 'x'} show={show} />
      </div>

      {reveal && (
        <div className="bee-overlay bee-reveal" role="status">
          <p className="word-mt" lang="mt">
            {reveal.mt}
          </p>
          <p className="bee-equals">=</p>
          <Face word={reveal} side="x" show={show} />
        </div>
      )}
    </div>
  );
}

/**
 * Tap to keep the bee in the air. It bounces between two walls; the wall ahead has
 * two doors, each labelled with an answer. Fly through the right one.
 */
export function BusyBee({ data, onExit }: { data: AppData; onExit: () => void }) {
  const [{ topic, show, direction: dir }] = useState(data.settings);
  const [pool] = useState(() => {
    const inTopic = beeWords(wordsInTopic(topic, data.settings), dir, show);
    // A topic can be left with too few short words; then play with the whole deck.
    return inTopic.length >= MIN_POOL ? inTopic : beeWords(wordsInTopic(ALL_TOPICS, data.settings), dir, show);
  });
  const [round, setRound] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [tally, setTally] = useState({ ok: 0, bad: 0 });
  /** Words answered wrongly this round, each listed once, in the order they came up. */
  const [missed, setMissed] = useState<Word[]>([]);

  const playAgain = () => {
    setRound((n) => n + 1);
    setStarted(false);
    setFinished(false);
    setTally({ ok: 0, bad: 0 });
    setMissed([]);
  };

  return (
    <GameShell title="Busy bee" status={<Tally ok={tally.ok} bad={tally.bad} />} onExit={onExit}>
      {finished ? (
        <div className="card card-done bee-summary" role="status">
          <p className="done-title" lang="mt">
            Prosit!
          </p>
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

          {missed.length > 0 && (
            <div className="bee-missed">
              <h2 className="eyebrow">Words to look at again</h2>
              <ul className="wordlist">
                {missed.map((w) => (
                  <li key={w.id}>
                    <div className="wordlist-text">
                      <span className="wordlist-mt" lang="mt">
                        {w.mt}
                      </span>
                      <span className="wordlist-tr">
                        <span lang="pl">{w.pl}</span> · <span lang="en">{w.en}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="done-actions">
            <button className="btn btn-secondary btn-wide" onClick={playAgain}>
              Play again
            </button>
            <button className="btn btn-primary btn-wide" onClick={onExit}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <BeeField
            key={round}
            pool={pool}
            dir={dir}
            show={show}
            onStart={() => setStarted(true)}
            onCorrect={() => setTally((t) => ({ ...t, ok: t.ok + 1 }))}
            onWrong={(word) => {
              setTally((t) => ({ ...t, bad: t.bad + 1 }));
              setMissed((list) => (list.includes(word) ? list : [...list, word]));
            }}
          />
          <div className="bee-foot">
            <p className="bee-hint">{started ? 'Tap to fly up' : 'Tap to start, then fly through the right door'}</p>
            <button className="btn btn-secondary btn-small" onClick={() => setFinished(true)}>
              Finish
            </button>
          </div>
        </>
      )}
    </GameShell>
  );
}
