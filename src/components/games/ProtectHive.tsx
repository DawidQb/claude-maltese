import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { WordStream } from '../../lib/games';
import {
  advance,
  canEnter,
  fillTray,
  HONEY,
  hivePool,
  hornetNext,
  hornetSecond,
  newHornet,
  honeyAfterWave,
  laneCount,
  pickLane,
  REVEAL_MS,
  spawnDue,
  SURGE,
  surge,
  WAVE_PAUSE_MS,
  waveSpec,
  type Invader,
  type WaveSpec,
} from '../../lib/hive';
import { similarity } from '../../lib/letters';
import type { Direction } from '../../lib/srs';
import { playSound, wakeSound, type Sound } from '../../lib/sound';
import type { AppData, ShowLang, Update } from '../../lib/store';
import { ALL_TOPICS, wordsInTopic, type Word } from '../../lib/words';
import { Face, TranslationLines } from '../Cards';
import { DIRECTION_LABEL } from '../Home';
import { beeEye, drawBee, readColors, type Colors } from './beeArt';
import { GameShell, MistakesList, SpeakerIcon, Tally, type Mistake } from './GameShell';

/** A wrong pair shows red for this long. */
const WRONG_FLASH_MS = 600;
/** Below this window height the tray keeps to `SHORT_TRAY` chips, so the field keeps its fall height. Matches the CSS. */
const SHORT_SCREEN = 640;
const SHORT_TRAY = 4;
/** Room kept between a new word and the one above it in its lane. */
const LANE_GAP_PX = 12;
/** The longest step the clock takes in one frame, so a slow frame never throws the words forward. */
const MAX_STEP_MS = 50;
/** Height assumed for a word that has not been measured yet. */
const WORD_HEIGHT_GUESS = 56;

/* Effects. None of them changes the rules: a hit counts at the tap, the rest is decoration. */
/** The laser beams show this long; then the word bursts and is gone. */
const BEAM_MS = 180;
/** Beam core width by the run of hits: from 3 in a row thicker, from 6 thicker still (and a higher zap). */
const BEAM = { width: 1.5, run3: 2.5, run6: 3.5, glow: 4, highPitch: 1.3 };
/** The chip of a word just shot shows green this long before a new chip takes its slot. */
const HIT_CHIP_MS = 300;
/** A surge slides the words down over this long instead of jumping. */
const SURGE_SLIDE_MS = 250;
/** The field shakes this long after a wrong pair. */
const SHAKE_MS = 250;
/** A honey cell lost flashes red, one won back glows, for this long. */
const HONEY_FX_MS = 600;
const BEE_RADIUS = 15;
/** How quickly the bee turns towards its target: the share of the way per ms. */
const BEE_TURN = 1 / 120;
const MAX_PARTICLES = 80;
const PARTICLE_GRAVITY = 600;
/** Dots thrown when a word is shot (honey-coloured) and when a honey cell is lost (red). */
const BURSTS = {
  zap: { count: 14, speed: 220, life: 520, r: 3 },
  puff: { count: 10, speed: 110, life: 420, r: 3.5 },
};
/** Vibration on a wrong pair and on a word reaching the hive, in ms. */
const BUZZ = { wrong: 30, land: 120 };

/** Eases from 0 to 1, gently at both ends. */
const smooth = (t: number) => t * t * (3 - 2 * t);

type FieldPhase = 'between' | 'playing' | 'reveal' | 'over';

/** Everything the rules need, kept out of React state; the loop changes it and asks for a redraw. */
interface Game {
  phase: FieldPhase;
  /** Game time in ms: stands still while the tab is hidden. */
  clock: number;
  /** When the wave banner or the reveal ends. */
  until: number;
  wave: number;
  spec: WaveSpec;
  /** Words of this wave still to enter. */
  toSpawn: number;
  sinceSpawn: number;
  landedThisWave: number;
  honey: number;
  /** Hits in a row. Never shown. */
  run: number;
  invaders: Invader[];
  nextId: number;
  tray: (Word | null)[];
  traySize: number;
  /** The word (by invader id) and the chip (by word id) chosen so far. */
  choice: { word: number | null; chip: string | null };
  /** A wrong pair, shown red until `until`. */
  wrong: { word: number; chip: string; until: number } | null;
  /** The word that reached the hive, shown while the field stands still. */
  reveal: Word | null;
  /** Words just shot, while the beams reach them: gone from play, or (`keep`) a hornet hit once that flies on. */
  zapped: { inv: Invader; until: number; width: number; keep: boolean }[];
  /** Chips of words just shot, green until `until`, then replaced. */
  hitChips: { id: string; until: number }[];
  /** The last surge: when, and which words it moved, so they can slide. */
  surged: { at: number; ids: Set<number> };
  /** A honey cell lost or won back, for its effect. */
  honeyFx: { cell: number; lost: boolean; at: number } | null;
}

interface FieldProps {
  pool: Word[];
  dir: Direction;
  show: ShowLang;
  /** Sound and vibration on. */
  sound: boolean;
  onHit: () => void;
  /** A wrong pair (`chosen` is the chip picked) or a word that reached the hive (`chosen` null). */
  onMiss: (word: Word, chosen: Word | null) => void;
  onStatus: (status: { honey: number; wave: number }) => void;
  onOver: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  color: string;
  r: number;
}

/** One side of a word, as it is shown on a falling word or a chip. */
function Side({ word, maltese, show }: { word: Word; maltese: boolean; show: ShowLang }) {
  return maltese ? (
    <span className="tile-mt" lang="mt">
      {word.mt}
    </span>
  ) : (
    <TranslationLines word={word} show={show} />
  );
}

/** A hexagon with flat sides left and right (pointy top), as a path. */
function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.closePath();
}

/** The field, the tray and the game loop. One run per mount. */
function HiveField({ pool, dir, show, sound, onHit, onMiss, onStatus, onOver }: FieldProps) {
  const [stream] = useState(() => new WordStream(pool));
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const cb = useRef({ onHit, onMiss, onStatus, onOver });
  cb.current = { onHit, onMiss, onStatus, onOver };
  const soundOn = useRef(sound);
  soundOn.current = sound;

  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  /** The element of each word on the field, and its measured height. */
  const els = useRef(new Map<number, HTMLElement>());
  const heights = useRef(new Map<number, number>());
  const widths = useRef(new Map<number, number>());
  const motion = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const game = useRef<Game>(null as unknown as Game);
  if (!game.current) {
    game.current = {
      phase: 'between',
      clock: 0,
      until: 0,
      wave: 0,
      spec: waveSpec(1),
      toSpawn: 0,
      sinceSpawn: 0,
      landedThisWave: 0,
      honey: HONEY,
      run: 0,
      invaders: [],
      nextId: 1,
      tray: [],
      traySize: 0,
      choice: { word: null, chip: null },
      wrong: null,
      reveal: null,
      zapped: [],
      hitChips: [],
      surged: { at: -Infinity, ids: new Set() },
      honeyFx: null,
    };
  }

  /* ---------- geometry ---------- */

  const fieldWidth = () => fieldRef.current?.clientWidth ?? 0;
  /** The px the words fall through, from the top of the field to the top of the hive. */
  const fallHeight = () => (fieldRef.current?.clientHeight ?? 0) - (baseRef.current?.offsetHeight ?? 0);
  const lanes = () => laneCount(fieldWidth());
  /** Where a word is drawn: its lane's centre, and its top edge, sliding after a surge. */
  const wordBox = (inv: Invader) => {
    const g = game.current;
    const n = lanes();
    const h = heights.current.get(inv.id) ?? WORD_HEIGHT_GUESS;
    const t = (g.clock - g.surged.at) / SURGE_SLIDE_MS;
    const lag = !motion.current && t < 1 && g.surged.ids.has(inv.id) ? SURGE * (1 - smooth(t)) : 0;
    return { x: ((Math.min(inv.lane, n - 1) + 0.5) / n) * fieldWidth(), top: (inv.y - lag) * fallHeight() - h, h };
  };

  /** Writes every word's position straight to its element. */
  const place = () => {
    const g = game.current;
    for (const inv of [...g.invaders, ...g.zapped.map((z) => z.inv)]) {
      const el = els.current.get(inv.id);
      if (!el) continue;
      if (!heights.current.has(inv.id)) {
        heights.current.set(inv.id, el.offsetHeight);
        widths.current.set(inv.id, el.offsetWidth);
      }
      el.style.transform = `translate(-50%, ${Math.round(wordBox(inv).top)}px)`;
    }
  };

  /** Decoys that look like the words on the field, from wave 3. */
  const preference = (g: Game, like: Word[]) =>
    g.spec.lookalikes && like.length > 0 ? (c: Word) => Math.max(...like.map((w) => similarity(c.mt, w.mt))) : undefined;

  const refill = (g: Game, like: Word[]) => {
    g.tray = fillTray(g.tray, g.invaders, pool, g.traySize, Math.random, preference(g, like));
  };

  /** Empties the chip of a word that has left the field. */
  const dropChip = (g: Game, word: Word) => {
    g.tray = g.tray.map((w) => (w && w.id === word.id ? null : w));
    if (g.choice.chip === word.id) g.choice = { ...g.choice, chip: null };
  };

  /** A sound, and with it a buzz on phones that can; both off with the sound switch. */
  const feedback = (name: Sound, buzz = 0, pitch = 1) => {
    if (!soundOn.current) return;
    playSound(name, pitch);
    if (buzz) navigator.vibrate?.(buzz);
  };

  /** Set by the loop: fires at a word just shot, and shakes the field after a wrong pair. */
  const fireRef = useRef<(inv: Invader, keep: boolean) => void>(() => {});
  const wrongRef = useRef<() => void>(() => {});

  useEffect(() => {
    const g = game.current;
    const field = fieldRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let colors: Colors = readColors();
    let particles: Particle[] = [];
    /** Which way the bee faces and how far its nose is tilted; it turns smoothly towards its target. */
    const bee = { facing: 1 as 1 | -1, tilt: -0.3 };

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => (motion.current = motionQuery.matches);
    motionQuery.addEventListener('change', onMotion);
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => (colors = readColors());
    scheme.addEventListener('change', onScheme);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(field.clientWidth * dpr);
      canvas.height = Math.round(field.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(field);
    resize();

    /* ---------- the hive strip ---------- */

    const baseHeight = () => baseRef.current?.offsetHeight ?? 0;
    const beeAt = () => {
      const top = fallHeight();
      const bob = motion.current ? 0 : Math.sin(g.clock / 420) * 3;
      return { x: fieldWidth() / 2, y: top + baseHeight() / 2 + bob };
    };
    /** The three honey cells, left of the bee; full ones first. */
    const honeyCells = () => {
      const r = Math.min(15, baseHeight() * 0.21);
      const cx = fieldWidth() * 0.22;
      const y = fallHeight() + baseHeight() / 2;
      return Array.from({ length: HONEY }, (_, i) => ({ x: cx + (i - 1) * r * Math.sqrt(3), y, r }));
    };

    const burst = (kind: keyof typeof BURSTS, x: number, y: number, color: string) => {
      if (motion.current) return;
      const spec = BURSTS[kind];
      for (let i = 0; i < spec.count; i++) {
        const speed = spec.speed * (0.4 + 0.6 * Math.random());
        const angle = Math.random() * Math.PI * 2;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - spec.speed * 0.3,
          born: g.clock,
          life: spec.life * (0.7 + 0.3 * Math.random()),
          color,
          r: spec.r * (0.7 + 0.5 * Math.random()),
        });
      }
      if (particles.length > MAX_PARTICLES) particles = particles.slice(-MAX_PARTICLES);
    };

    /* ---------- rules ---------- */

    /** The banner for the next wave; its words start coming when the banner goes. */
    const nextWave = () => {
      if (g.wave > 0) {
        const before = g.honey;
        g.honey = honeyAfterWave(g.honey, g.landedThisWave);
        if (g.honey > before) {
          g.honeyFx = { cell: g.honey - 1, lost: false, at: g.clock };
          feedback('pollen');
        }
      }
      g.wave += 1;
      g.spec = waveSpec(g.wave);
      g.toSpawn = g.spec.words;
      g.sinceSpawn = 0;
      g.landedThisWave = 0;
      g.traySize = window.innerHeight < SHORT_SCREEN ? Math.min(SHORT_TRAY, g.spec.tray) : g.spec.tray;
      g.tray = fillTray([], [], pool, g.traySize);
      g.hitChips = [];
      g.choice = { word: null, chip: null };
      g.phase = 'between';
      g.until = g.clock + WAVE_PAUSE_MS;
      feedback('wave');
      cb.current.onStatus({ honey: g.honey, wave: g.wave });
    };

    const spawn = (): boolean => {
      const fall = fallHeight();
      if (fall <= 0) return false;
      const tallest = Math.max(WORD_HEIGHT_GUESS, ...g.invaders.map((i) => heights.current.get(i.id) ?? WORD_HEIGHT_GUESS));
      const lane = pickLane(lanes(), g.invaders, (tallest + LANE_GAP_PX) / fall);
      if (lane === null) return false;
      let word: Word | null = null;
      for (let tries = 0; tries < pool.length && !word; tries++) {
        const w = stream.next();
        if (canEnter(w, g.invaders)) word = w;
      }
      if (!word) return false;
      const id = g.nextId++;
      g.invaders.push(hornetNext(g.wave, g.toSpawn) ? newHornet(id, word, lane) : { id, word, lane, y: 0 });
      g.toSpawn -= 1;
      g.sinceSpawn = 0;
      refill(g, [word]);
      return true;
    };

    const land = (landed: Invader[]) => {
      for (const inv of landed) {
        g.honey = Math.max(0, g.honey - 1);
        g.landedThisWave += 1;
        g.run = 0;
        stream.repeatLater(inv.word);
        dropChip(g, inv.word);
        if (g.choice.word === inv.id) g.choice = { ...g.choice, word: null };
        cb.current.onMiss(inv.word, null);
        const cell = honeyCells()[g.honey];
        if (cell) burst('puff', cell.x, cell.y, colors.bad);
      }
      g.honeyFx = { cell: g.honey, lost: true, at: g.clock };
      feedback('wrong', BUZZ.land);
      refill(g, g.invaders.map((i) => i.word));
      g.reveal = landed[0].word;
      g.phase = 'reveal';
      g.until = g.clock + REVEAL_MS;
      cb.current.onStatus({ honey: g.honey, wave: g.wave });
    };

    const step = (dt: number) => {
      if (g.phase === 'over') return;
      g.clock += dt;
      let changed = false;
      if (g.wrong && g.clock >= g.wrong.until) {
        g.wrong = null;
        changed = true;
      }
      // Words shot: once the beams have reached them, they burst and are gone.
      for (const z of g.zapped.filter((z) => g.clock >= z.until)) {
        const box = wordBox(z.inv);
        burst('zap', box.x, box.top + box.h / 2, colors.honey);
        if (!z.keep) {
          els.current.delete(z.inv.id);
          heights.current.delete(z.inv.id);
          widths.current.delete(z.inv.id);
        }
        changed = true;
      }
      g.zapped = g.zapped.filter((z) => g.clock < z.until);
      // Their chips, once they have shown green, make way for new ones.
      const done = g.hitChips.filter((c) => g.clock >= c.until);
      if (done.length > 0) {
        g.hitChips = g.hitChips.filter((c) => g.clock < c.until);
        for (const c of done) g.tray = g.tray.map((w) => (w && w.id === c.id && !g.invaders.some((i) => i.word.id === w.id) ? null : w));
        refill(g, g.invaders.map((i) => i.word));
        changed = true;
      }

      if (g.phase === 'between' || g.phase === 'reveal') {
        if (g.clock >= g.until) {
          g.reveal = null;
          changed = true;
          if (g.honey <= 0) {
            g.phase = 'over';
            cb.current.onOver();
            return;
          }
          g.phase = 'playing';
        }
      } else {
        g.sinceSpawn += dt;
        const landed = advance(g.invaders, dt, g.spec.crossMs);
        if (landed.length > 0) {
          land(landed);
          changed = true;
        } else if (spawnDue(g.spec, g.invaders, g.toSpawn, g.sinceSpawn)) {
          changed = spawn() || changed;
        } else if (g.toSpawn === 0 && g.invaders.length === 0 && g.zapped.every((z) => z.keep)) {
          nextWave();
          changed = true;
        }
      }
      if (changed) redraw();
    };

    /* ---------- drawing ---------- */

    /** The point the bee looks at: the word being beamed, the chosen word, or the lowest. */
    const target = () => {
      const z = g.zapped[g.zapped.length - 1]?.inv;
      const chosen = g.invaders.find((i) => i.id === g.choice.word);
      const lowest = g.invaders.reduce<Invader | null>((low, i) => (!low || i.y > low.y ? i : low), null);
      const inv = z ?? chosen ?? lowest;
      if (!inv) return null;
      const box = wordBox(inv);
      return { x: box.x, y: box.top + box.h / 2 };
    };

    /** Facing and tilt that point the bee's nose at (tx, ty). */
    const aim = (tx: number, ty: number) => {
      const b = beeAt();
      const dx = tx - b.x;
      return { facing: (dx >= 0 ? 1 : -1) as 1 | -1, tilt: Math.max(-1.25, Math.min(0.2, Math.atan2(ty - b.y, Math.abs(dx) + 1))) };
    };

    const turnBee = (dt: number) => {
      const t = target();
      const want = t ? aim(t.x, t.y) : { facing: bee.facing, tilt: -0.3 };
      if (want.facing !== bee.facing || motion.current) {
        bee.facing = want.facing;
        bee.tilt = want.tilt;
      } else {
        bee.tilt += (want.tilt - bee.tilt) * Math.min(1, dt * BEE_TURN);
      }
    };

    const drawHive = (w: number, top: number, h: number) => {
      // Comb across the strip, faint, with the hive's edge in honey.
      ctx.fillStyle = colors.wall;
      ctx.fillRect(0, top, w, h);
      const r = 11;
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      for (let row = 0; row * r * 1.5 < h + r; row++) {
        const y = top + row * r * 1.5 + r * 0.5;
        const shift = row % 2 ? (r * Math.sqrt(3)) / 2 : 0;
        for (let x = shift; x < w + r; x += r * Math.sqrt(3)) {
          hexPath(ctx, x, y, r);
          ctx.stroke();
        }
      }
      ctx.fillStyle = colors.honey;
      ctx.fillRect(0, top, w, 2);

      // The honey cells: full, empty, and the one just lost or won back.
      const fx = g.honeyFx && g.clock - g.honeyFx.at < HONEY_FX_MS ? g.honeyFx : null;
      honeyCells().forEach((c, i) => {
        if (fx && fx.cell === i && !fx.lost) {
          // Glows as it fills.
          const k = 1 - (g.clock - fx.at) / HONEY_FX_MS;
          ctx.globalAlpha = 0.45 * k;
          ctx.fillStyle = colors.honey;
          hexPath(ctx, c.x, c.y, c.r + 6 * k);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        hexPath(ctx, c.x, c.y, c.r);
        ctx.fillStyle = i < g.honey ? colors.honey : colors.bg;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = fx && fx.cell === i && fx.lost ? colors.bad : i < g.honey ? colors.honey : colors.line;
        ctx.stroke();
      });
    };

    const drawBeams = (eye: { x: number; y: number }) => {
      for (const z of g.zapped) {
        const box = wordBox(z.inv);
        const tx = box.x;
        const ty = box.top + box.h / 2;
        const len = Math.hypot(tx - eye.x, ty - eye.y) || 1;
        // Two beams, one from each eye, a little apart where they leave the bee.
        const nx = (-(ty - eye.y) / len) * 2.5;
        const ny = ((tx - eye.x) / len) * 2.5;
        const fade = Math.max(0, 1 - (g.clock - (z.until - BEAM_MS)) / BEAM_MS);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(eye.x + side * nx, eye.y + side * ny);
          ctx.lineTo(tx, ty);
          ctx.lineCap = 'round';
          ctx.globalAlpha = 0.35 * (0.4 + 0.6 * fade);
          ctx.strokeStyle = colors.honey;
          ctx.lineWidth = z.width * BEAM.glow;
          ctx.stroke();
          ctx.globalAlpha = 0.5 + 0.5 * fade;
          ctx.strokeStyle = colors.bad;
          ctx.lineWidth = z.width;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    };

    /** A hornet's wings, beating behind its word. */
    const drawWings = () => {
      for (const inv of g.invaders) {
        if (!inv.hits) continue;
        const box = wordBox(inv);
        const half = (widths.current.get(inv.id) ?? 120) / 2;
        const beat = motion.current ? 0 : Math.sin(g.clock / 30) * 0.35;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.strokeStyle = colors.muted;
        ctx.lineWidth = 1;
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(box.x + side * (half - 6), box.top + box.h * 0.35);
          ctx.rotate(side * (-0.5 + beat));
          ctx.beginPath();
          ctx.ellipse(side * 16, -6, 20, 9, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    };

    const draw = () => {
      const w = fieldWidth();
      const fall = fallHeight();
      ctx.clearRect(0, 0, w, field.clientHeight);
      drawHive(w, fall, baseHeight());
      drawWings();
      const b = beeAt();
      const eye = beeEye(b.x, b.y, BEE_RADIUS, bee.facing, bee.tilt);
      drawBeams(eye);
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, 1 - (g.clock - p.born) / p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawBee(ctx, b.x, b.y, BEE_RADIUS, bee.facing, bee.tilt, motion.current ? 0 : g.clock, colors.muted);
      if (g.zapped.length > 0) {
        // The eyes glow while firing.
        ctx.beginPath();
        ctx.arc(eye.x, eye.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = colors.bad;
        ctx.fill();
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
      step(dt);
      particles = particles.filter((p) => g.clock - p.born < p.life);
      for (const p of particles) {
        p.vy += PARTICLE_GRAVITY * (dt / 1000);
        p.x += p.vx * (dt / 1000);
        p.y += p.vy * (dt / 1000);
      }
      turnBee(dt);
      place();
      draw();
    };

    /** Fires the lasers at a word just shot: the bee snaps round to face it. `keep`: a hornet that flies on. */
    fireRef.current = (inv: Invader, keep: boolean) => {
      const box = wordBox(inv);
      Object.assign(bee, aim(box.x, box.top + box.h / 2));
      const width = g.run >= 6 ? BEAM.run6 : g.run >= 3 ? BEAM.run3 : BEAM.width;
      g.zapped.push({ inv, until: g.clock + BEAM_MS, width, keep });
      feedback('laser', 0, g.run >= 6 ? BEAM.highPitch : 1);
    };
    wrongRef.current = () => {
      feedback('bump', BUZZ.wrong);
      if (!motion.current) {
        field.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
          { duration: SHAKE_MS },
        );
      }
    };

    // Effects run twice in development; the first wave is set up only once.
    if (g.wave === 0) nextWave();
    redraw();
    frame = requestAnimationFrame(tick);

    if (import.meta.env.DEV) {
      // Lets the automated check play; stripped from the production build.
      (window as unknown as Record<string, unknown>).__hive = {
        get state() {
          return {
            phase: g.phase,
            wave: g.wave,
            honey: g.honey,
            run: g.run,
            toSpawn: g.toSpawn,
            lanes: lanes(),
            invaders: g.invaders.map((i) => ({ id: i.id, word: i.word.id, lane: i.lane, y: i.y, hits: i.hits })),
            tray: g.tray.map((w) => w?.id ?? null),
            choice: g.choice,
            zapped: g.zapped.length,
            particles: particles.length,
            bee: { ...bee, ...beeAt() },
          };
        },
      };
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scheme.removeEventListener('change', onScheme);
      motionQuery.removeEventListener('change', onMotion);
    };
  }, [pool, stream]);

  // New elements get their position before they are painted.
  useLayoutEffect(place);

  /** The word a hornet shows after a hit: its plural if it can, or the next word that may enter. */
  const nextHornetWord = (g: Game, inv: Invader): Word | null => {
    const others = g.invaders.filter((i) => i !== inv);
    const plural = hornetSecond(inv.word, pool, g.invaders);
    if (plural) return plural;
    for (let tries = 0; tries < pool.length; tries++) {
      const w = stream.next();
      if (w.id !== inv.word.id && canEnter(w, others)) return w;
    }
    return null;
  };

  const pick = (side: 'word' | 'chip', id: number | string) => {
    const g = game.current;
    if (g.phase !== 'playing') return;
    g.wrong = null;
    const next = { ...g.choice, [side]: g.choice[side] === id ? null : id } as Game['choice'];
    if (next.word === null || next.chip === null) {
      g.choice = next;
      redraw();
      return;
    }
    g.choice = { word: null, chip: null };
    const inv = g.invaders.find((i) => i.id === next.word);
    const chip = g.tray.find((w) => w?.id === next.chip);
    if (inv && chip && inv.word.id === chip.id) {
      // The hit counts now; the beams and the burst follow.
      g.run += 1;
      g.hitChips.push({ id: chip.id, until: g.clock + HIT_CHIP_MS });
      const second = inv.hits && inv.hits > 1 ? nextHornetWord(g, inv) : null;
      if (second) {
        // A hornet hit once flies on where it is, with another word.
        inv.word = second;
        inv.hits! -= 1;
        heights.current.delete(inv.id);
        refill(g, [second]);
        fireRef.current(inv, true);
      } else {
        g.invaders = g.invaders.filter((i) => i !== inv);
        fireRef.current(inv, false);
      }
      cb.current.onHit();
    } else if (inv && chip) {
      g.run = 0;
      surge(g.invaders);
      g.surged = { at: g.clock, ids: new Set(g.invaders.map((i) => i.id)) };
      g.wrong = { word: inv.id, chip: chip.id, until: g.clock + WRONG_FLASH_MS };
      wrongRef.current();
      cb.current.onMiss(inv.word, chip);
    }
    redraw();
  };

  const g = game.current;
  const laneTotal = lanes() || 2;
  const askMaltese = dir === 'mt2x';
  const style = (inv: Invader) => ({
    left: `${((Math.min(inv.lane, laneTotal - 1) + 0.5) / laneTotal) * 100}%`,
    maxWidth: `calc(${100 / laneTotal}% - 12px)`,
  });
  const keep = (id: number) => (el: HTMLElement | null) => {
    if (el) els.current.set(id, el);
  };

  return (
    <>
      <div ref={fieldRef} className="hive-field">
        <canvas ref={canvasRef} aria-hidden="true" />
        <div ref={baseRef} className="hive-base" aria-hidden="true" />

        {g.invaders.map((inv) => {
          const chosen = g.choice.word === inv.id;
          const wrong = g.wrong?.word === inv.id;
          return (
            <button
              key={inv.id}
              ref={keep(inv.id)}
              className={`hive-word${inv.hits ? ' is-hornet' : ''}${chosen ? ' is-picked' : ''}${wrong ? ' is-wrong' : ''}`}
              style={style(inv)}
              data-word={inv.word.id}
              data-hits={inv.hits}
              aria-pressed={chosen}
              onClick={() => pick('word', inv.id)}
            >
              {inv.hits && (
                <span className="hornet-hits" title={`Hornet: ${inv.hits === 1 ? 'one more hit' : `${inv.hits} hits`}`}>
                  <span className="sr-only">Hornet, {inv.hits === 1 ? 'one more hit' : `${inv.hits} hits`}: </span>
                  {Array.from({ length: inv.hits }, (_, k) => (
                    <i key={k} aria-hidden="true" />
                  ))}
                </span>
              )}
              <Side word={inv.word} maltese={askMaltese} show={show} />
            </button>
          );
        })}
        {g.zapped
          .filter((z) => !z.keep)
          .map(({ inv }) => (
            <div key={inv.id} ref={keep(inv.id)} className="hive-word is-zapped" style={style(inv)} aria-hidden="true">
              <Side word={inv.word} maltese={askMaltese} show={show} />
            </div>
          ))}

        {g.phase === 'between' && (
          <div className="bee-overlay hive-banner" role="status">
            <p className="hive-banner-title">Wave {g.wave}</p>
          </div>
        )}
        {g.reveal && (
          <div className="bee-overlay bee-reveal" role="status">
            <p className="hive-reveal-note">Reached the hive</p>
            <p className="word-mt" lang="mt">
              {g.reveal.mt}
            </p>
            <p className="bee-equals">=</p>
            <Face word={g.reveal} side="x" show={show} />
          </div>
        )}
      </div>

      <div className="hive-tray" role="group" aria-label="Answers">
        {g.tray.map((w, k) => {
          if (!w) return <span key={`empty-${k}`} className="tile-btn hive-chip is-empty" aria-hidden="true" />;
          const hit = g.hitChips.some((c) => c.id === w.id);
          const chosen = g.choice.chip === w.id;
          const wrong = g.wrong?.chip === w.id;
          return (
            <button
              key={`${k}-${w.id}`}
              className={`tile-btn hive-chip${chosen ? ' is-picked' : ''}${wrong ? ' is-wrong' : ''}${hit ? ' is-right' : ''}`}
              data-word={w.id}
              aria-pressed={chosen}
              disabled={hit}
              onClick={() => pick('chip', w.id)}
            >
              <Side word={w} maltese={!askMaltese} show={show} />
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Honey left, as cells filled or empty. */
function Honey({ left }: { left: number }) {
  return (
    <span className="hive-honey" role="img" aria-label={`${left} honey left`}>
      {Array.from({ length: HONEY }, (_, i) => (
        <i key={i} className={`honey-cell${i < left ? ' is-full' : ''}`} />
      ))}
    </span>
  );
}

type Phase = 'ready' | 'playing' | 'over';

/**
 * Words creep down towards the hive; tap a word and its answer in the tray to zap it before it
 * gets there. A wrong pair brings every word closer, a word that gets there costs honey.
 */
export function ProtectHive({ data, update, onExit }: { data: AppData; update: Update; onExit: () => void }) {
  const [{ topic, show, gameDirection: dir }] = useState(data.settings);
  const [pool] = useState(() => hivePool(wordsInTopic(topic, data.settings), wordsInTopic(ALL_TOPICS, data.settings), dir, show));
  const [phase, setPhase] = useState<Phase>('ready');
  const [round, setRound] = useState(0);
  const [tally, setTally] = useState({ ok: 0, bad: 0 });
  const [status, setStatus] = useState({ honey: HONEY, wave: 1 });
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  // The record to beat, fixed when the run starts.
  const [bestBefore, setBestBefore] = useState(data.games.hiveBest);
  /** Words shot down this run, for saving the best when it ends. */
  const shot = useRef(0);
  const sound = data.settings.sound;

  const toggleSound = () => {
    // Turning sound on is a press, so the browser lets it start now.
    if (!sound) wakeSound();
    update((d) => ({ ...d, settings: { ...d.settings, sound: !d.settings.sound } }));
  };

  const start = () => {
    if (sound) wakeSound();
    setRound((n) => n + 1);
    shot.current = 0;
    setBestBefore(data.games.hiveBest);
    setTally({ ok: 0, bad: 0 });
    setStatus({ honey: HONEY, wave: 1 });
    setMistakes([]);
    setPhase('playing');
  };

  const finish = () => {
    setPhase('over');
    const final = shot.current;
    update((d) => (final > d.games.hiveBest ? { ...d, games: { ...d.games, hiveBest: final } } : d));
  };

  return (
    <GameShell
      title="Protect the hive"
      status={
        phase === 'ready' ? (
          ''
        ) : (
          <span className="bee-status">
            <Tally ok={tally.ok} bad={tally.bad} />
            <Honey left={status.honey} />
            <span className="hive-wave">Wave {status.wave}</span>
          </span>
        )
      }
      onExit={onExit}
    >
      {phase === 'ready' && (
        <div className="card card-done">
          <p className="done-title">Protect the hive</p>
          <p className="done-text">Tap a word and its answer to zap it before it reaches the hive.</p>
          <p className="muted">{DIRECTION_LABEL[dir]}</p>
          {data.games.hiveBest > 0 && <p className="muted">Your best: {data.games.hiveBest}</p>}
          <div className="done-actions">
            <button className="btn btn-primary btn-wide" onClick={start} autoFocus>
              Start
            </button>
          </div>
        </div>
      )}

      {phase === 'playing' && (
        <>
          <HiveField
            key={round}
            pool={pool}
            dir={dir}
            show={show}
            onHit={() => {
              shot.current += 1;
              setTally((t) => ({ ...t, ok: t.ok + 1 }));
            }}
            onMiss={(word, chosen) => {
              setTally((t) => ({ ...t, bad: t.bad + 1 }));
              setMistakes((list) => [...list, { word, chosen }]);
            }}
            sound={sound}
            onStatus={setStatus}
            onOver={finish}
          />
          <div className="bee-foot">
            <p className="bee-hint">Tap a word, then its answer</p>
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
        </>
      )}

      {phase === 'over' && (
        <div className="card card-done bee-summary" role="status">
          <p className="done-title">{shot.current}</p>
          <p className="done-text">
            {shot.current === 1 ? 'word' : 'words'} shot down · wave {status.wave} reached
          </p>
          <p className="muted">
            {shot.current > bestBefore && bestBefore > 0
              ? `New best! Before: ${bestBefore}`
              : bestBefore > 0
                ? `Your best: ${Math.max(shot.current, bestBefore)}`
                : ''}
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

          <MistakesList mistakes={mistakes} dir={dir} show={show} missedText="reached the hive" />

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
