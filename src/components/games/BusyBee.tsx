import { useEffect, useRef, useState } from 'react';
import {
  BEE_RADIUS,
  beeWords,
  doorLabel,
  enterRoom,
  flap,
  HOLD_DELAY_MS,
  newBee,
  nextSpeed,
  placeDoors,
  SPEED,
  step,
  turn,
  WALL,
  type Arena,
  type Bee,
  type Door,
  type WallHit,
} from '../../lib/bounce';
import { makeQuestion, WordStream, type Question } from '../../lib/games';
import type { Direction } from '../../lib/srs';
import type { AppData, ShowLang } from '../../lib/store';
import { ALL_TOPICS, wordsInTopic, type Word } from '../../lib/words';
import { Face } from '../Cards';
import { GameShell, Tally } from './GameShell';

const REVEAL_MS = 1400;
const MIN_POOL = 8;
/** How long the view takes to slide after the bee into the next room. */
const ROOM_SLIDE_MS = 320;

/** Repeatable random numbers, so a room looks the same each time the bee passes through it. */
function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Eases from 0 to 1 and starts and stops gently, so the bee's motion has no jolt at either end. */
const smooth = (t: number) => t * t * (3 - 2 * t);

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
    honey: v('--accent'),
  };
}

interface FieldProps {
  pool: Word[];
  dir: Direction;
  show: ShowLang;
  onStart: () => void;
  onCorrect: () => void;
  /** The word that was asked, and the wrong answer whose door the bee flew through. */
  onWrong: (word: Word, chosen: Word) => void;
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
  /** Called when a finger, the mouse or a key goes down and when it is let go; set by the game loop below. */
  const pressRef = useRef<() => void>(() => {});
  const releaseRef = useRef<() => void>(() => {});
  /** Fingers (or the mouse) currently on the field: the bee keeps lifting until the last one is let go. */
  const pointers = useRef(new Set<number>());
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
    /** Right answers in a row. Never shown; it drives difficulty and effects. */
    let run = 0;
    /** Which room the bee is in: one more for each room to the right, one less to the left. */
    let room = 0;
    /** The door the bee came in by, on the wall behind it. Gone once it turns to face that wall. */
    let entry: Door | null = null;
    /** The door it came into the previous room by, drawn while that room slides out of view. */
    let leftEntry: Door | null = null;
    /** How far the scene is shifted while the view slides after the bee; eases out to 0. */
    let camera = 0;
    let slideFrom = 0;
    let slideStart = 0;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = motion.matches;
    let running = false;
    /** While set, the game is paused to show the right answer; then the next question starts. */
    let pausedUntil = 0;
    let sparks: Spark[] = [];
    let shakeUntil = 0;
    /** When the current press started, or 0 while nothing is held. */
    let heldSince = 0;
    let last = 0;
    let frame = 0;

    const correctOption = () => q.options.findIndex((w) => w.id === q.answer.id);
    /** The strip at the top of the field taken by the word being asked. */
    const headroom = () => (promptRef.current?.offsetHeight ?? 0) + 6;
    /** Doors stay below the word shown at the top of the field. */
    const doors = () => placeDoors(arena, correctOption(), Math.random, headroom());

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
        // Keep the bee on screen and rebuild the doors for the new size. Just through a door,
        // it may still be inside the wall behind it.
        const lo = entry && bee.dir === 1 ? -BEE_RADIUS : WALL + BEE_RADIUS;
        const hi = entry && bee.dir === -1 ? arena.width + BEE_RADIUS : arena.width - WALL - BEE_RADIUS;
        bee.x = Math.min(Math.max(bee.x, lo), hi);
        bee.y = Math.min(bee.y, arena.height - BEE_RADIUS);
        bee.doors = doors();
        if (running) bee.vx = bee.dir * speed * arena.width;
      }
    };

    const nextQuestion = () => {
      q = makeQuestion(pool, stream.next(), Math.random, 2);
      setQuestion(q);
    };

    /** Back the other way in the same room: the wall it now faces gets fresh doors. */
    const turnAround = () => {
      turn(bee!, arena, speed, doors());
      entry = null;
    };

    /** On through `door` into the next room, with the view sliding after the bee. */
    const goThrough = (door: Door, now: number) => {
      const b = bee!;
      const shift = b.dir * (arena.width - WALL);
      enterRoom(b, arena, speed, doors());
      room += b.dir;
      leftEntry = entry;
      entry = door;
      // Effects stay where they were in the room being left.
      for (const s of sparks) s.x -= shift;
      // The view starts where it was, so the bee stays put on screen in this very frame.
      slideFrom = reduceMotion ? 0 : shift;
      camera = slideFrom;
      slideStart = now;
    };

    const onWall = ({ event, door }: WallHit, now: number) => {
      const b = bee!;
      speed = nextSpeed(speed, event);
      if (event === 'correct') {
        run += 1;
        cb.current.onCorrect();
        sparks.push({ text: '✓', x: b.x, y: b.y, born: now, good: true });
        nextQuestion();
        goThrough(door!, now);
      } else if (event === 'wrong') {
        run = 0;
        cb.current.onWrong(q.answer, q.options[door!.option]);
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

    pressRef.current = () => {
      heldSince = performance.now();
      if (!bee || pausedUntil) return;
      if (!running) {
        running = true;
        bee.vx = bee.dir * speed * arena.width;
        cb.current.onStart();
      }
      flap(bee);
    };
    releaseRef.current = () => {
      heldSince = 0;
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

    /** A wall and its door openings; only the doors ahead of the bee carry answers. */
    const drawWall = (side: 1 | -1, doors: Door[], labelled: boolean) => {
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

      for (const door of doors) {
        // The opening, with a honey-coloured frame.
        ctx.fillStyle = colors.bg;
        ctx.fillRect(x, door.top, WALL, door.bottom - door.top);
        ctx.fillStyle = colors.honey;
        ctx.fillRect(x, door.top - 4, WALL, 4);
        ctx.fillRect(x, door.bottom, WALL, 4);
        if (labelled) drawLabel(side, door.top, door.bottom, doorLabel(q.options[door.option], dir, show));
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

    /** A few faint honeycomb cells and flowers, the same each time for a room, so the slide shows. */
    const drawBackdrop = (n: number, dx: number) => {
      const rng = seeded(n + 1000);
      const { width: w, height: h } = arena;
      const top = headroom();
      ctx.save();
      ctx.translate(dx, 0);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1.5;
      for (let patch = 0; patch < 2; patch++) {
        const cx = WALL + 40 + rng() * (w - 2 * WALL - 80);
        const cy = top + (h - top) * (0.15 + patch * 0.4 + rng() * 0.15);
        const r = 10 + rng() * 6;
        const cells = 3 + Math.floor(rng() * 4);
        for (const [cq, cr] of [[0, 0], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]].slice(0, cells)) {
          const x = cx + r * Math.sqrt(3) * (cq + cr / 2);
          const y = cy + r * 1.5 * cr;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = Math.PI / 6 + (k * Math.PI) / 3;
            ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
          }
          ctx.closePath();
          if (rng() < 0.5) {
            ctx.fillStyle = colors.wall;
            ctx.fill();
          }
          ctx.stroke();
        }
      }
      // Flowers along the floor.
      const flowers = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < flowers; i++) {
        const x = WALL + 24 + ((i + rng() * 0.8) / flowers) * (w - 2 * WALL - 48);
        const y = h - 26 - rng() * 30;
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.fillStyle = colors.line;
        for (let k = 0; k < 5; k++) {
          const a = (k * 2 * Math.PI) / 5;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = colors.wall;
        ctx.fill();
      }
      ctx.restore();
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
      // Everything below is in room coordinates and slides with the view.
      ctx.translate(camera, 0);
      // While sliding, the room being left is still in view, one room back.
      const behind = bee.dir === 1 ? -1 : 1;
      const back = behind * (arena.width - WALL);
      if (camera) {
        drawBackdrop(room - bee.dir, back);
        ctx.save();
        ctx.translate(back, 0);
        drawWall(behind, leftEntry ? [leftEntry] : [], false);
        ctx.restore();
      }
      drawBackdrop(room, 0);
      drawWall(bee.dir, bee.doors, true);
      drawWall(behind, entry ? [entry] : [], false);
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

      if (slideFrom) {
        const t = Math.min(1, (now - slideStart) / ROOM_SLIDE_MS);
        camera = slideFrom * (1 - smooth(t));
        if (t === 1) slideFrom = 0;
      }

      if (pausedUntil) {
        if (now >= pausedUntil) {
          pausedUntil = 0;
          setReveal(null);
          nextQuestion();
          turnAround();
          bee.vy = 0;
        }
      } else if (running) {
        // A quick tap is one flap; holding on keeps the bee climbing.
        const lifting = heldSince > 0 && now - heldSince >= HOLD_DELAY_MS;
        const hit = step(bee, dt, arena, lifting);
        if (hit) onWall(hit, now);
      } else {
        // Hovering before the first tap.
        bee.y = arena.height * 0.45 + Math.sin(now / 300) * 8;
      }
      draw(now);
    };

    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => (colors = readColors());
    scheme.addEventListener('change', onScheme);
    const onMotion = () => (reduceMotion = motion.matches);
    motion.addEventListener('change', onMotion);
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();
    frame = requestAnimationFrame(tick);

    if (import.meta.env.DEV) {
      // Lets the automated check fly the bee; stripped from the production build.
      (window as unknown as Record<string, unknown>).__bee = {
        get state() {
          return {
            bee,
            arena,
            running,
            paused: pausedUntil > 0,
            speed,
            run,
            room,
            camera,
            answer: q.answer.id,
            options: q.options.map((w) => w.id),
          };
        },
      };
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scheme.removeEventListener('change', onScheme);
      motion.removeEventListener('change', onMotion);
    };
  }, [pool, stream, dir, show]);

  useEffect(() => {
    const isFlyKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'ArrowUp';
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isFlyKey(e)) return;
      e.preventDefault();
      // A key held down repeats; that is holding on, not a stream of taps.
      if (!e.repeat) pressRef.current();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isFlyKey(e) && pointers.current.size === 0) releaseRef.current();
    };
    // Switching away mid-press never delivers the release, so let go then.
    const onBlur = () => {
      pointers.current.clear();
      releaseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const letGo = (id: number) => {
    pointers.current.delete(id);
    if (pointers.current.size === 0) releaseRef.current();
  };

  return (
    <div
      ref={wrapRef}
      className="bee-arena"
      onPointerDown={(e) => {
        e.preventDefault();
        // Keep receiving this finger's release even if it slides off the field.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        pointers.current.add(e.pointerId);
        pressRef.current();
      }}
      onPointerUp={(e) => letGo(e.pointerId)}
      onPointerCancel={(e) => letGo(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
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
 * Tap, or hold on, to keep the bee in the air. It bounces between two walls; the wall ahead has
 * two doors, each labelled with an answer. Fly through the right one.
 */
export function BusyBee({ data, onExit }: { data: AppData; onExit: () => void }) {
  const [{ topic, show }] = useState(data.settings);
  // Always from Polish / English to Maltese, whatever direction the Study tab uses:
  // the doors carry the Maltese words, which is the harder way round.
  const dir: Direction = 'x2mt';
  const [pool] = useState(() => {
    const inTopic = beeWords(wordsInTopic(topic, data.settings), dir, show);
    // A topic can be left with too few short words; then play with the whole deck.
    return inTopic.length >= MIN_POOL ? inTopic : beeWords(wordsInTopic(ALL_TOPICS, data.settings), dir, show);
  });
  const [round, setRound] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [tally, setTally] = useState({ ok: 0, bad: 0 });
  /** Every mistake this round, in order: what was asked and which wrong answer was picked. */
  const [mistakes, setMistakes] = useState<{ word: Word; chosen: Word }[]>([]);
  /** A word's translations, in the languages chosen in Settings. */
  const translation = (w: Word) => doorLabel(w, 'mt2x', show).join(' · ');

  const playAgain = () => {
    setRound((n) => n + 1);
    setStarted(false);
    setFinished(false);
    setTally({ ok: 0, bad: 0 });
    setMistakes([]);
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

          {mistakes.length > 0 && (
            <div className="bee-missed">
              <h2 className="eyebrow">Your mistakes</h2>
              <ul className="wordlist">
                {mistakes.map(({ word, chosen }, i) => (
                  <li key={i}>
                    <div className="wordlist-text">
                      <span className="mistake-asked">{translation(word)}</span>
                      <span className="mistake mistake-right">
                        <b>✓</b> <span lang="mt">{word.mt}</span>
                      </span>
                      <span className="mistake mistake-wrong">
                        <b>✗</b> you chose <span lang="mt">{chosen.mt}</span>
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
            onWrong={(word, chosen) => {
              setTally((t) => ({ ...t, bad: t.bad + 1 }));
              setMistakes((list) => [...list, { word, chosen }]);
            }}
          />
          <div className="bee-foot">
            <p className="bee-hint">{started ? 'Tap or hold to fly up' : 'Tap to start, then fly through the right door'}</p>
            <button className="btn btn-secondary btn-small" onClick={() => setFinished(true)}>
              Finish
            </button>
          </div>
        </>
      )}
    </GameShell>
  );
}
