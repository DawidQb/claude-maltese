import { useEffect, useRef, useState } from 'react';
import { WordStream } from '../../lib/games';
import { ALPHABET, keyLabel } from '../../lib/letters';
import { playSound, wakeSound, type Sound } from '../../lib/sound';
import type { AppData, Update } from '../../lib/store';
import { CAUGHT_MS, FREED_MS, guess, newRound, padKey, shown, webPool, type Round } from '../../lib/web';
import { ALL_TOPICS, wordsInTopic } from '../../lib/words';
import { Face, TranslationLines } from '../Cards';
import { drawBee, drawSpider, readColors, type Colors } from './beeArt';
import { GameShell, MistakesList, SpeakerIcon, Tally, type Mistake } from './GameShell';

/* Effects. None of them changes the rules. */
/** The spider slides down a step in this long. */
const SLIDE_MS = 300;
/** The web shakes this long after a hit. */
const SHAKE_MS = 250;
/** A bee freed flies up and out of the scene in this long. */
const FLY_MS = 600;
/** After the spider reaches the bee, the scene dims over this long. */
const DIM_MS = 300;
/** Vibration after a miss and when the bee is caught, in ms. */
const BUZZ = { miss: 30, caught: 150 };
const BURST = { count: 18, speed: 180, life: 600, r: 3 };
const PARTICLE_GRAVITY = 400;

/** Eases from 0 to 1, gently at both ends. */
const smooth = (t: number) => t * t * (3 - 2 * t);

/** What the scene draws from: the moments things happened, by `performance.now()`. */
interface Fx {
  hitAt: number;
  freedAt: number;
  caughtAt: number;
  /** The spider's way down, as a share of the thread: sliding from `from` to `to` since `at`. */
  slide: { from: number; to: number; at: number };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  r: number;
}

type Phase = 'playing' | 'freed' | 'caught' | 'over';

/** The word so far, read out: "k, blank, blank, b". */
function spoken(letters: (string | null)[], round: Round): string {
  return letters.map((l, i) => (round.cells[i].key === ' ' ? 'space' : l === null ? 'blank' : l)).join(', ');
}

/**
 * A bee hangs in a web; guess the letters of the Maltese word before the spider comes down its
 * thread to it. Every wrong letter is a step of the spider. Endless, like Infinite typing.
 */
export function SpiderWeb({ data, update, onExit }: { data: AppData; update: Update; onExit: () => void }) {
  const [{ topic, show }] = useState(data.settings);
  const [stream] = useState(() => new WordStream(webPool(wordsInTopic(topic, data.settings), wordsInTopic(ALL_TOPICS, data.settings))));
  /** Bees freed in a row, and the longest such run. */
  const run = useRef(0);
  const [longest, setLongest] = useState(0);
  const [round, setRound] = useState<Round>(() => newRound(stream.next(), 0));
  const roundRef = useRef(round);
  const [turn, setTurn] = useState(0);
  const [phase, setPhase] = useState<Phase>('playing');
  const phaseRef = useRef<Phase>('playing');
  const [tally, setTally] = useState({ ok: 0, bad: 0 });
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const sound = data.settings.sound;
  const woke = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fx = useRef<Fx>({ hitAt: -Infinity, freedAt: -Infinity, caughtAt: -Infinity, slide: { from: 0, to: 0, at: 0 } });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** A sound, and with it a buzz on phones that can; both off with the sound switch. */
  const feedback = (name: Sound, buzz = 0) => {
    if (!sound) return;
    playSound(name);
    if (buzz) navigator.vibrate?.(buzz);
  };

  // The scene: the web, the bee in it and the spider on its thread, drawn every frame.
  const over = phase === 'over';
  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;
    const ctx = canvas.getContext('2d')!;
    let colors: Colors = readColors();
    let particles: Particle[] = [];
    let burstFor = -Infinity;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let still = motionQuery.matches;
    const onMotion = () => (still = motionQuery.matches);
    motionQuery.addEventListener('change', onMotion);
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => (colors = readColors());
    scheme.addEventListener('change', onScheme);
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(scene.clientWidth * dpr);
      canvas.height = Math.round(scene.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(scene);
    resize();

    let frame = 0;
    let last = performance.now();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const dt = Math.min(50, now - last);
      last = now;
      const f = fx.current;
      const round = roundRef.current;
      const w = scene.clientWidth;
      const h = scene.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // The web, low in the scene; it shakes once after a hit.
      const since = now - f.hitAt;
      const shake = !still && since < SHAKE_MS ? Math.sin((since / SHAKE_MS) * Math.PI * 3) * 3 * (1 - since / SHAKE_MS) : 0;
      const beeR = Math.max(10, Math.min(18, h * 0.1));
      const spiderR = beeR * 0.7;
      const cx = w / 2 + shake;
      // Low in the scene, and lower still in a short one, so the spider's steps stay long enough to read.
      const cy = Math.max(h * 0.64, h - beeR * 2.2);
      const radius = Math.min(w * 0.46, h * 0.62);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + Math.PI / 8;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * radius * 1.4, cy + Math.sin(a) * radius * 1.4);
        ctx.stroke();
      }
      for (let ring = 1; ring <= 4; ring++) {
        const rr = (radius * ring) / 4;
        ctx.beginPath();
        for (let k = 0; k <= 8; k++) {
          const a = (k * Math.PI) / 4 + Math.PI / 8;
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // The spider comes down `misses / steps` of the way to the bee, sliding one step at a time.
      const target = Math.min(1, round.misses / round.steps);
      const sl = f.slide;
      const t = still ? 1 : Math.min(1, (now - sl.at) / SLIDE_MS);
      const current = sl.from + (sl.to - sl.from) * smooth(t);
      if (sl.to !== target) f.slide = { from: current, to: target, at: now };
      const top = spiderR * 1.2 + 2;
      const bottom = cy - beeR * 0.9 - spiderR * 1.6;
      const spiderY = top + (bottom - top) * current;
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, spiderY - spiderR);
      ctx.stroke();

      // The bee: wriggling in the web, or flying up and out once freed.
      const flown = now - f.freedAt;
      const freed = phaseRef.current === 'freed';
      let bx = cx;
      let by = cy;
      if (freed && !still) {
        // Out to the side first, so it never flies through the spider, then up and away.
        const p = Math.min(1, flown / FLY_MS);
        bx = cx + smooth(Math.min(1, p * 1.6)) * w * 0.4;
        by = cy - p * p * (cy + beeR * 3);
        if (burstFor !== f.freedAt) {
          burstFor = f.freedAt;
          for (let i = 0; i < BURST.count; i++) {
            const speed = BURST.speed * (0.4 + 0.6 * Math.random());
            const a = Math.random() * Math.PI * 2;
            particles.push({ x: cx, y: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - BURST.speed * 0.3, born: now, life: BURST.life * (0.7 + 0.3 * Math.random()), r: BURST.r * (0.7 + 0.5 * Math.random()) });
          }
        }
      }
      if (!(freed && still)) {
        const wriggle = still || freed ? 0 : Math.sin(now / 160) * 0.18;
        drawBee(ctx, bx, by, beeR, 1, freed ? -0.5 : wriggle, still ? 0 : now, colors.muted);
      }
      drawSpider(ctx, w / 2, spiderY, spiderR, still ? 0 : now, colors);

      particles = particles.filter((p) => now - p.born < p.life);
      for (const p of particles) {
        p.vy += PARTICLE_GRAVITY * (dt / 1000);
        p.x += p.vx * (dt / 1000);
        p.y += p.vy * (dt / 1000);
        ctx.globalAlpha = Math.max(0, 1 - (now - p.born) / p.life);
        ctx.fillStyle = colors.honey;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Caught: once the spider is there, the scene dims.
      if (phaseRef.current === 'caught') {
        const d = still ? 1 : Math.max(0, Math.min(1, (now - f.caughtAt - SLIDE_MS) / DIM_MS));
        ctx.fillStyle = `rgba(0, 0, 0, ${0.3 * d})`;
        ctx.fillRect(0, 0, w, h);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      motionQuery.removeEventListener('change', onMotion);
      scheme.removeEventListener('change', onScheme);
    };
  }, [over]);

  const enter = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const later = (ms: number, fn: () => void) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };

  const put = (next: Round) => {
    roundRef.current = next;
    setRound(next);
  };

  const nextWord = () => {
    window.clearTimeout(timer.current);
    put(newRound(stream.next(), run.current));
    setTurn((n) => n + 1);
    enter('playing');
  };

  /** The spider got there, or the player gave up: the word is shown and comes back later. */
  const caught = () => {
    const word = roundRef.current.word;
    run.current = 0;
    stream.repeatLater(word);
    fx.current.caughtAt = performance.now();
    feedback('wrong', BUZZ.caught);
    setTally((t) => ({ ...t, bad: t.bad + 1 }));
    setMistakes((list) => [...list, { word, chosen: null }]);
    enter('caught');
    later(CAUGHT_MS, nextWord);
  };

  const press = (key: string) => {
    if (phaseRef.current !== 'playing') return;
    if (!woke.current && sound) {
      wakeSound();
      woke.current = true;
    }
    const result = guess(roundRef.current, key);
    if (result.round === roundRef.current) return;
    put(result.round);
    if (result.hit) {
      fx.current.hitAt = performance.now();
      if (result.state === 'open') feedback('pollen');
    } else if (result.state === 'open') {
      feedback('bump', BUZZ.miss);
    }
    if (result.state === 'freed') {
      fx.current.freedAt = performance.now();
      feedback('right');
      run.current += 1;
      setLongest((n) => Math.max(n, run.current));
      setTally((t) => ({ ...t, ok: t.ok + 1 }));
      enter('freed');
      later(FREED_MS, nextWord);
    } else if (result.state === 'caught') {
      caught();
    }
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  // A hardware keyboard guesses the letter pressed; "għ" is reached with Tab.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (!ALPHABET.includes(key)) return;
      e.preventDefault();
      pressRef.current(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A caught word stays until a tap anywhere, or `CAUGHT_MS`.
  useEffect(() => {
    if (phase !== 'caught') return;
    const onTap = () => nextWord();
    window.addEventListener('pointerdown', onTap);
    return () => window.removeEventListener('pointerdown', onTap);
  });

  const toggleSound = () => {
    // Turning sound on is a press, so the browser lets it start now.
    if (!sound) wakeSound();
    update((d) => ({ ...d, settings: { ...d.settings, sound: !d.settings.sound } }));
  };

  const finish = () => {
    window.clearTimeout(timer.current);
    enter('over');
  };

  const playAgain = () => {
    run.current = 0;
    setLongest(0);
    setTally({ ok: 0, bad: 0 });
    setMistakes([]);
    nextWord();
  };

  const letters = shown(round);

  if (import.meta.env.DEV) {
    // Lets the automated check play; stripped from the production build.
    (window as unknown as Record<string, unknown>).__web = {
      state: {
        phase,
        word: round.word.id,
        keys: [...new Set(round.cells.filter((c) => !c.given).map((c) => padKey(c.key)))],
        guessed: round.guessed,
        misses: round.misses,
        steps: round.steps,
        run: run.current,
      },
    };
  }

  if (phase === 'over') {
    return (
      <GameShell title="Spider web" status="" onExit={onExit}>
        <div className="card card-done bee-summary" role="status">
          <p className="done-title">{tally.ok}</p>
          <p className="done-text">{tally.ok === 1 ? 'bee freed' : 'bees freed'}</p>
          {longest > 1 && <p className="muted">Longest run: {longest} in a row</p>}
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
          <MistakesList mistakes={mistakes} dir="x2mt" show={show} missedText="the spider got there" />
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

  /** The cells grouped by word, so a phrase wraps between its words. */
  const groups: { cell: number }[][] = [[]];
  round.cells.forEach((c, i) => {
    if (c.key === ' ') groups.push([]);
    else groups[groups.length - 1].push({ cell: i });
  });
  const lost = phase === 'caught';

  return (
    <GameShell title="Spider web" status={<Tally ok={tally.ok} bad={tally.bad} />} onExit={onExit}>
      <div ref={sceneRef} className="web-scene">
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="web-steps" role="img" aria-label={`${round.misses} of ${round.steps} steps`}>
          {Array.from({ length: round.steps }, (_, i) => (
            <i key={i} className={i < round.misses ? 'is-taken' : ''} />
          ))}
        </div>
        {lost && (
          <div className="bee-overlay bee-reveal web-caught" role="status">
            <p className="hive-reveal-note">The spider got there</p>
            <p className="web-caught-word" lang="mt">
              {round.word.mt}
            </p>
            <TranslationLines word={round.word} show={show} />
          </div>
        )}
      </div>

      <div className="card comb-bg web-meaning">
        <Face word={round.word} side="x" show={show} />
      </div>

      <div className="web-cells" lang="mt" aria-live="polite" aria-label={spoken(letters, round)} key={turn}>
        {groups.map((group, g) => (
          <span key={g} className="web-group">
            {group.map(({ cell }) => {
              const c = round.cells[cell];
              const letter = letters[cell];
              const state = c.given ? ' is-given' : letter !== null ? (phase === 'freed' ? ' is-freed' : ' is-filled') : lost ? ' is-lost' : '';
              return (
                <span key={cell} className={`web-cell${state}`} aria-hidden="true">
                  {letter ?? (lost ? c.key : '')}
                </span>
              );
            })}
          </span>
        ))}
      </div>

      <div className="web-keys" role="group" aria-label="Letters">
        {ALPHABET.map((k) => {
          const used = round.guessed.includes(k);
          const hit = used && round.cells.some((c) => !c.given && padKey(c.key) === k);
          return (
            <button
              key={k}
              type="button"
              className={`key${used ? (hit ? ' is-hit' : ' is-miss') : ''}`}
              lang="mt"
              data-key={k}
              aria-label={used ? `${k}, ${hit ? 'in the word' : 'not in the word'}` : k}
              disabled={used || phase !== 'playing'}
              onClick={() => press(k)}
            >
              {keyLabel(k)}
            </button>
          );
        })}
      </div>

      <div className="bee-foot">
        <button className="btn btn-secondary btn-small" onClick={caught} disabled={phase !== 'playing'}>
          Don’t know
        </button>
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
          <button className="btn btn-secondary btn-small" onClick={finish}>
            Finish
          </button>
        </div>
      </div>
    </GameShell>
  );
}
