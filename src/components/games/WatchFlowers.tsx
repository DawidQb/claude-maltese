import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { doorLabel, promptLabel } from '../../lib/bounce';
import {
  BEE_R,
  CARRY_MS,
  carrierPos,
  GROUND_PX,
  hold,
  landingPoint,
  meadowWeights,
  newCycle,
  newMeadow,
  PACES,
  pickWord,
  placeFlowers,
  showEarly,
  stepCycle,
  stepMeadow,
  type Cycle,
  type Flower,
  type MeadowBee,
  type Pace,
} from '../../lib/meadow';
import { toISODate } from '../../lib/srs';
import type { AppData, Update } from '../../lib/store';
import { wordsInTopic, type Word } from '../../lib/words';
import { drawBee, drawFlower, readColors, type Colors } from './beeArt';
import { GameShell } from './GameShell';

/** The longest step the clock takes in one frame, so a slow frame never throws the bees across the field. */
const MAX_STEP_MS = 50;
/** The bee carrying a word is this big and solid; the wandering ones are smaller and fainter. */
const WORD_BEE_R = 14;
const FAINTEST = 0.4;
const SOLIDEST = 0.8;
/** A word-bee done with its flower flies off the nearest edge in this long. */
const LEAVE_MS = 1500;
/** A flower opens, and closes again, over this long. */
const OPEN_MS = 400;
/** A flower with a bee on it nods this far either way, in radians, this often. */
const NOD = { angle: 0.07, ms: 900 };
/** A tap on the field this close to the word-bee counts as a tap on the bee. */
const TAP_PX = 32;
/** Room kept between a label and the edge of the field, and between a label and its bee. */
const EDGE_PX = 6;
const LABEL_GAP_PX = 6;
/** The word-bee's wings reach this far above its centre, as a share of its radius. */
const WINGS_UP = 1.5;

const PACE_LABEL: Record<Pace, string> = { seldom: 'Seldom', normal: 'Normal', often: 'Often' };

/** Eases from 0 to 1, gently at both ends. */
const smooth = (t: number) => t * t * (3 - 2 * t);

interface Meadow {
  cycle: Cycle;
  word: Word | null;
  /** The word-bee's flower, by index: no wandering bee goes there. */
  flower: number | null;
  /** Where the word-bee came in from. */
  from: { x: number; y: number };
  /** The ids of the words drawn, newest last. */
  recent: string[];
  bees: MeadowBee[];
  flowers: Flower[];
  /** How open each flower is, from 0 to 1. */
  open: number[];
  width: number;
  height: number;
  /** A word-bee flying off after its word, from its flower to the edge. */
  leaving: { from: { x: number; y: number }; to: { x: number; y: number }; ms: number } | null;
}

/** Lines of a label; the Maltese side marked as Maltese. */
function Lines({ lines, maltese, className }: { lines: string[]; maltese: boolean; className?: string }) {
  return (
    <span className={`meadow-lines${className ? ` ${className}` : ''}`} lang={maltese ? 'mt' : undefined}>
      {lines.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </span>
  );
}

/** Keeps the screen on while the meadow is open and visible, where the browser allows it. */
function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const ask = async () => {
      if (document.visibilityState !== 'visible' || gone) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (gone) void next.release();
        else lock = next;
      } catch {
        // Refused (low battery, a policy): the screen simply sleeps as usual.
      }
    };
    void ask();
    document.addEventListener('visibilitychange', ask);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', ask);
      void lock?.release().catch(() => {});
    };
  }, []);
}

/**
 * Not a game: a meadow to look at. Bees wander about the flowers, and now and then one brings a
 * word to a flower, which opens to show what it means. Nothing is asked or counted, and the
 * review schedule is only read, once, to choose the words.
 */
export function WatchFlowers({ data, update, onExit }: { data: AppData; update: Update; onExit: () => void }) {
  const [{ topic, show, gameDirection: dir }] = useState(data.settings);
  const [weighted] = useState(() => meadowWeights(wordsInTopic(topic, data.settings), data.cards, dir, toISODate(new Date())));
  const pace = data.settings.meadowPace;
  // Read by the loop when the next gap begins, so a change applies from then.
  const paceRef = useRef(pace);
  paceRef.current = pace;
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useWakeLock();

  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const carriedRef = useRef<HTMLButtonElement>(null);
  const flowerRef = useRef<HTMLButtonElement>(null);
  /** Set by the loop: where the word-bee is now, for a tap on the field. */
  const beeAt = useRef<() => { x: number; y: number } | null>(() => null);
  const motion = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const meadow = useRef<Meadow>({
    cycle: newCycle(),
    word: null,
    flower: null,
    from: { x: 0, y: 0 },
    recent: [],
    bees: [],
    flowers: [],
    open: [],
    width: 0,
    height: 0,
    leaving: null,
  });

  useEffect(() => {
    const m = meadow.current;
    const field = fieldRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let colors: Colors = readColors();
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => {
      motion.current = motionQuery.matches;
      redraw();
    };
    motionQuery.addEventListener('change', onMotion);
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => (colors = readColors());
    scheme.addEventListener('change', onScheme);

    /** A new field size: flowers and bees laid out afresh for it. */
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = field.clientWidth;
      const height = field.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (width === m.width && height === m.height) return;
      m.width = width;
      m.height = height;
      m.flowers = placeFlowers(width, height);
      m.open = m.flowers.map((_, i) => (i === m.flower && m.cycle.phase === 'shown' ? 1 : 0));
      m.bees = newMeadow(width, height);
      if (m.flower !== null && m.flower >= m.flowers.length) m.flower = m.flowers.length - 1;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(field);
    resize();

    /* ---------- the word's cycle ---------- */

    const begin = () => {
      if (weighted.length === 0) return;
      const word = pickWord(weighted, m.recent);
      m.recent = [...m.recent, word.id].slice(-50);
      m.word = word;
      // A flower no bee is feeding on, if there is one.
      const free = m.flowers.map((_, i) => i).filter((i) => !m.bees.some((b) => b.flower === i));
      const choice = free.length > 0 ? free : m.flowers.map((_, i) => i);
      m.flower = choice[Math.floor(Math.random() * choice.length)];
      const fromLeft = Math.random() < 0.5;
      m.from = { x: fromLeft ? -30 : m.width + 30, y: m.height * (0.12 + Math.random() * 0.2) };
    };

    const end = () => {
      if (m.flower !== null && m.flowers[m.flower] && !motion.current) {
        const at = landingPoint(m.flowers[m.flower]);
        m.leaving = { from: at, to: { x: at.x < m.width / 2 ? -40 : m.width + 40, y: m.height * 0.1 }, ms: 0 };
      }
      // The word stays in its labels while they fade out.
      m.flower = null;
    };

    /** Where the word-bee is now, or null when there is none (or nothing flies). */
    const wordBee = (): { x: number; y: number } | null => {
      if (motion.current || m.flower === null || !m.flowers[m.flower]) return null;
      const at = landingPoint(m.flowers[m.flower]);
      if (m.cycle.phase === 'carry') return carrierPos(m.from, at, 1 - m.cycle.leftMs / CARRY_MS);
      if (m.cycle.phase === 'shown') return at;
      return null;
    };
    beeAt.current = wordBee;

    /* ---------- labels ---------- */

    /** Puts a label with its centre at `x` and its top (or, `above`, its bottom) at `y`, kept inside the field. */
    const put = (el: HTMLElement | null, x: number, y: number, above: boolean) => {
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = Math.max(EDGE_PX, Math.min(m.width - w - EDGE_PX, x - w / 2));
      const top = Math.max(EDGE_PX, Math.min(m.height - h - EDGE_PX, above ? y - h : y));
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };

    const placeLabels = () => {
      const bee = wordBee();
      if (bee && m.cycle.phase === 'carry') put(carriedRef.current, bee.x, bee.y + WORD_BEE_R + LABEL_GAP_PX, false);
      if (m.flower !== null && m.flowers[m.flower]) {
        const at = landingPoint(m.flowers[m.flower]);
        // Above the flower and the bee on it, wings and all, so it never covers the bee.
        put(flowerRef.current, at.x, at.y - WORD_BEE_R * WINGS_UP - LABEL_GAP_PX, true);
      }
    };

    /* ---------- drawing ---------- */

    const draw = (now: number) => {
      const still = motion.current;
      const { width, height } = m;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = colors.wall;
      ctx.fillRect(0, height - GROUND_PX, width, GROUND_PX);
      const seats = still ? m.flowers.map((_, i) => i).filter((i) => i !== m.flower).slice(0, 2) : [];
      m.flowers.forEach((f, i) => {
        const occupied = still ? seats.includes(i) : m.bees.some((b) => b.state === 'feeding' && b.flower === i) || (i === m.flower && m.cycle.phase === 'shown');
        const nod = occupied && !still ? Math.sin(now / NOD.ms * Math.PI * 2 + i) * NOD.angle : 0;
        drawFlower(ctx, f, smooth(m.open[i] ?? 0), nod, colors);
      });

      if (still) {
        // Two bees sitting still, each on a flower other than the word's.
        for (const i of seats) {
          const at = landingPoint(m.flowers[i]);
          drawBee(ctx, at.x, at.y, BEE_R.max, 1, 0, 0, colors.muted);
        }
        return;
      }
      for (const b of m.bees) {
        const depth = (b.r - BEE_R.min) / (BEE_R.max - BEE_R.min);
        ctx.globalAlpha = FAINTEST + (SOLIDEST - FAINTEST) * depth;
        const facing = Math.cos(b.heading) >= 0 ? 1 : -1;
        const tilt = b.state === 'feeding' ? 0 : Math.max(-0.5, Math.min(0.5, Math.sin(b.heading) * 0.5));
        drawBee(ctx, b.x, b.y, b.r, facing, tilt, now + b.phase, colors.muted);
      }
      ctx.globalAlpha = 1;
      const bee = wordBee();
      if (bee) {
        const facing = m.cycle.phase === 'carry' ? (m.from.x < width / 2 ? 1 : -1) : 1;
        drawBee(ctx, bee.x, bee.y, WORD_BEE_R, facing, 0, now, colors.muted);
      }
      if (m.leaving) {
        const t = smooth(Math.min(1, m.leaving.ms / LEAVE_MS));
        const p = { x: m.leaving.from.x + (m.leaving.to.x - m.leaving.from.x) * t, y: m.leaving.from.y + (m.leaving.to.y - m.leaving.from.y) * t };
        drawBee(ctx, p.x, p.y, WORD_BEE_R, m.leaving.to.x > m.leaving.from.x ? 1 : -1, -0.3, now, colors.muted);
      }
    };

    /* ---------- loop ---------- */

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // A hidden tab stops the clock; a slow frame moves it by one short step only.
      const dt = document.hidden || !last ? 0 : Math.min(now - last, MAX_STEP_MS);
      last = now;
      const r = stepCycle(m.cycle, dt, paceRef.current);
      m.cycle = r.cycle;
      if (r.entered === 'carry') begin();
      else if (r.entered === 'gap') end();
      if (r.entered) redraw();
      // The word's flower opens while it is shown; the others stay closed.
      m.flowers.forEach((_, i) => {
        const target = i === m.flower && m.cycle.phase === 'shown' ? 1 : 0;
        const cur = m.open[i] ?? 0;
        m.open[i] = motion.current ? target : cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt / OPEN_MS);
      });
      if (!motion.current) stepMeadow(m.bees, m.flowers, m.flower, dt, m.width, m.height);
      if (m.leaving) {
        m.leaving.ms += dt;
        if (m.leaving.ms >= LEAVE_MS) m.leaving = null;
      }
      placeLabels();
      draw(now);
    };
    frame = requestAnimationFrame(tick);

    if (import.meta.env.DEV) {
      // Lets the automated check watch; stripped from the production build.
      (window as unknown as Record<string, unknown>).__meadow = {
        get state() {
          return {
            cycle: m.cycle,
            word: m.cycle.phase === 'gap' ? null : (m.word?.id ?? null),
            flower: m.flower,
            recent: m.recent,
            bees: m.bees.length,
            wandering: m.bees.filter((b) => b.state === 'wander').length,
            still: motion.current,
            bee: wordBee(),
            beeXs: m.bees.map((b) => Math.round(b.x)),
            flowers: m.flowers,
          };
        },
      };
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      motionQuery.removeEventListener('change', onMotion);
      scheme.removeEventListener('change', onScheme);
    };
  }, [weighted]);

  /* ---------- taps ---------- */

  const early = () => {
    const m = meadow.current;
    const next = showEarly(m.cycle);
    if (next === m.cycle) return;
    m.cycle = next;
    redraw();
  };

  const onFlowerLabel = () => {
    const m = meadow.current;
    // With nothing flying, the word waits on its flower: a tap there shows the meaning early.
    if (m.cycle.phase === 'carry') return early();
    m.cycle = hold(m.cycle);
    redraw();
  };

  /** A tap on the field near the word-bee counts as a tap on the bee. */
  const onFieldDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target !== canvasRef.current) return;
    const bee = beeAt.current();
    if (!bee || meadow.current.cycle.phase !== 'carry') return;
    const rect = fieldRef.current!.getBoundingClientRect();
    if (Math.hypot(e.clientX - rect.left - bee.x, e.clientY - rect.top - bee.y) <= TAP_PX) early();
  };

  const setPace = (p: Pace) => update((d) => ({ ...d, settings: { ...d.settings, meadowPace: p } }));

  const m = meadow.current;
  const word = m.word;
  const { phase, early: shownEarly, held } = m.cycle;
  const still = motion.current;
  const askedMaltese = dir === 'mt2x';
  const carried = word ? promptLabel(word, dir, show) : [];
  const meaning = word ? doorLabel(word, dir, show) : [];
  const carriedOn = word !== null && phase === 'carry' && !still;
  const flowerOn = word !== null && (phase === 'shown' || (still && phase === 'carry'));
  const withMeaning = phase === 'shown' || shownEarly;

  return (
    <GameShell title="Watch the flowers" onExit={onExit}>
      <div ref={fieldRef} className="meadow-field" onPointerDown={onFieldDown}>
        <canvas ref={canvasRef} aria-hidden="true" />
        {weighted.length === 0 && <p className="meadow-empty muted">No words to show in this topic.</p>}

        <button
          ref={carriedRef}
          type="button"
          className={`meadow-label meadow-carried${carriedOn ? ' is-on' : ''}`}
          tabIndex={carriedOn ? 0 : -1}
          aria-hidden={!carriedOn}
          aria-label={carriedOn && !shownEarly ? `${carried.join(', ')}: show the meaning` : undefined}
          onClick={early}
        >
          {word && <Lines lines={carried} maltese={askedMaltese} />}
          {word && carriedOn && shownEarly && <Lines lines={meaning} maltese={!askedMaltese} className="meadow-meaning meadow-early" />}
        </button>

        <button
          ref={flowerRef}
          type="button"
          className={`meadow-label meadow-flower${flowerOn ? ' is-on' : ''}${held ? ' is-held' : ''}`}
          tabIndex={flowerOn ? 0 : -1}
          aria-hidden={!flowerOn}
          aria-pressed={phase === 'shown' ? held : undefined}
          onClick={onFlowerLabel}
        >
          {word && (
            <>
              <Lines lines={carried} maltese={askedMaltese} className="meadow-word" />
              {withMeaning && <Lines lines={meaning} maltese={!askedMaltese} className="meadow-meaning" />}
            </>
          )}
        </button>

        <p className="sr-only" aria-live="polite">
          {word && phase === 'shown' ? `${carried.join(', ')} — ${meaning.join(', ')}` : ''}
        </p>
      </div>

      <div className="meadow-foot">
        <span className="meadow-foot-label" id="meadow-pace">
          Words
        </span>
        <div className="segmented meadow-pace" role="group" aria-labelledby="meadow-pace">
          {PACES.map((p) => (
            <button key={p} aria-pressed={pace === p} onClick={() => setPace(p)}>
              {PACE_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
    </GameShell>
  );
}
