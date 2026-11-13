import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { WordStream } from '../../lib/games';
import {
  advance,
  canEnter,
  fillTray,
  HONEY,
  hivePool,
  honeyAfterWave,
  laneCount,
  pickLane,
  REVEAL_MS,
  spawnDue,
  surge,
  WAVE_PAUSE_MS,
  waveSpec,
  type Invader,
  type WaveSpec,
} from '../../lib/hive';
import { similarity } from '../../lib/letters';
import type { Direction } from '../../lib/srs';
import { wakeSound } from '../../lib/sound';
import type { AppData, ShowLang, Update } from '../../lib/store';
import { ALL_TOPICS, wordsInTopic, type Word } from '../../lib/words';
import { Face, TranslationLines } from '../Cards';
import { DIRECTION_LABEL } from '../Home';
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
}

interface FieldProps {
  pool: Word[];
  dir: Direction;
  show: ShowLang;
  onHit: () => void;
  /** A wrong pair (`chosen` is the chip picked) or a word that reached the hive (`chosen` null). */
  onMiss: (word: Word, chosen: Word | null) => void;
  onStatus: (status: { honey: number; wave: number }) => void;
  onOver: () => void;
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

/** The field, the tray and the game loop. One run per mount. */
function HiveField({ pool, dir, show, onHit, onMiss, onStatus, onOver }: FieldProps) {
  const [stream] = useState(() => new WordStream(pool));
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const cb = useRef({ onHit, onMiss, onStatus, onOver });
  cb.current = { onHit, onMiss, onStatus, onOver };

  const fieldRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  /** The button of each word on the field, and its measured height. */
  const els = useRef(new Map<number, HTMLButtonElement>());
  const heights = useRef(new Map<number, number>());

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
    };
  }

  /** The px the words fall through, from the top of the field to the top of the hive. */
  const fallHeight = () => (fieldRef.current?.clientHeight ?? 0) - (baseRef.current?.offsetHeight ?? 0);
  const lanes = () => laneCount(fieldRef.current?.clientWidth ?? 0);

  /** Writes every word's position straight to its button. */
  const place = () => {
    const fall = fallHeight();
    for (const inv of game.current.invaders) {
      const el = els.current.get(inv.id);
      if (!el) continue;
      let h = heights.current.get(inv.id);
      if (h === undefined) {
        h = el.offsetHeight;
        heights.current.set(inv.id, h);
      }
      el.style.transform = `translate(-50%, ${Math.round(inv.y * fall - h)}px)`;
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

  useEffect(() => {
    const g = game.current;

    /** The banner for the next wave; its words start coming when the banner goes. */
    const nextWave = () => {
      if (g.wave > 0) g.honey = honeyAfterWave(g.honey, g.landedThisWave);
      g.wave += 1;
      g.spec = waveSpec(g.wave);
      g.toSpawn = g.spec.words;
      g.sinceSpawn = 0;
      g.landedThisWave = 0;
      g.traySize = window.innerHeight < SHORT_SCREEN ? Math.min(SHORT_TRAY, g.spec.tray) : g.spec.tray;
      g.tray = fillTray([], [], pool, g.traySize);
      g.choice = { word: null, chip: null };
      g.phase = 'between';
      g.until = g.clock + WAVE_PAUSE_MS;
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
      g.invaders.push({ id: g.nextId++, word, lane, y: 0 });
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
      }
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
        } else if (g.toSpawn === 0 && g.invaders.length === 0) {
          nextWave();
          changed = true;
        }
      }
      if (changed) redraw();
    };

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // A hidden tab stops the clock; a slow frame moves it by one short step only.
      const dt = document.hidden || !last ? 0 : Math.min(now - last, MAX_STEP_MS);
      last = now;
      step(dt);
      place();
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
            invaders: g.invaders.map((i) => ({ id: i.id, word: i.word.id, lane: i.lane, y: i.y })),
            tray: g.tray.map((w) => w?.id ?? null),
            choice: g.choice,
          };
        },
      };
    }
    return () => cancelAnimationFrame(frame);
  }, [pool, stream]);

  // New buttons get their position before they are painted.
  useLayoutEffect(place);

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
      g.invaders = g.invaders.filter((i) => i !== inv);
      els.current.delete(inv.id);
      heights.current.delete(inv.id);
      g.run += 1;
      dropChip(g, inv.word);
      refill(g, g.invaders.map((i) => i.word));
      cb.current.onHit();
    } else if (inv && chip) {
      g.run = 0;
      surge(g.invaders);
      g.wrong = { word: inv.id, chip: chip.id, until: g.clock + WRONG_FLASH_MS };
      cb.current.onMiss(inv.word, chip);
    }
    redraw();
  };

  const g = game.current;
  const laneTotal = lanes();
  const askMaltese = dir === 'mt2x';

  return (
    <>
      <div ref={fieldRef} className="hive-field">
        {g.invaders.map((inv) => {
          const chosen = g.choice.word === inv.id;
          const wrong = g.wrong?.word === inv.id;
          return (
            <button
              key={inv.id}
              ref={(el) => {
                if (el) els.current.set(inv.id, el);
              }}
              className={`hive-word${chosen ? ' is-picked' : ''}${wrong ? ' is-wrong' : ''}`}
              style={{ left: `${((Math.min(inv.lane, laneTotal - 1) + 0.5) / laneTotal) * 100}%`, maxWidth: `calc(${100 / laneTotal}% - 12px)` }}
              data-word={inv.word.id}
              aria-pressed={chosen}
              onClick={() => pick('word', inv.id)}
            >
              <Side word={inv.word} maltese={askMaltese} show={show} />
            </button>
          );
        })}

        <div ref={baseRef} className="hive-base" aria-hidden="true" />

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

      <div className={`hive-tray hive-tray-${g.traySize}`} role="group" aria-label="Answers">
        {g.tray.map((w, k) => {
          if (!w) return <span key={`empty-${k}`} className="tile-btn hive-chip is-empty" aria-hidden="true" />;
          const chosen = g.choice.chip === w.id;
          const wrong = g.wrong?.chip === w.id;
          return (
            <button
              key={`${k}-${w.id}`}
              className={`tile-btn hive-chip${chosen ? ' is-picked' : ''}${wrong ? ' is-wrong' : ''}`}
              data-word={w.id}
              aria-pressed={chosen}
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
  const sound = data.settings.sound;

  const toggleSound = () => {
    // Turning sound on is a press, so the browser lets it start now.
    if (!sound) wakeSound();
    update((d) => ({ ...d, settings: { ...d.settings, sound: !d.settings.sound } }));
  };

  const start = () => {
    if (sound) wakeSound();
    setRound((n) => n + 1);
    setTally({ ok: 0, bad: 0 });
    setStatus({ honey: HONEY, wave: 1 });
    setMistakes([]);
    setPhase('playing');
  };

  const finish = () => setPhase('over');

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
            onHit={() => setTally((t) => ({ ...t, ok: t.ok + 1 }))}
            onMiss={(word, chosen) => {
              setTally((t) => ({ ...t, bad: t.bad + 1 }));
              setMistakes((list) => [...list, { word, chosen }]);
            }}
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
          <p className="done-title">{tally.ok}</p>
          <p className="done-text">
            {tally.ok === 1 ? 'word' : 'words'} shot down · wave {status.wave} reached
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
