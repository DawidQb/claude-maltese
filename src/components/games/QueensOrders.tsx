import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import {
  BANNER_MS,
  courtVerbs,
  makeOrder,
  paradigm,
  planAudience,
  planRun,
  REVEAL_MS,
  walkMs,
  type Verb,
} from '../../lib/court';
import type { Question } from '../../lib/games';
import { wakeSound } from '../../lib/sound';
import type { AppData, ShowLang, Update } from '../../lib/store';
import { WORDS, type Word } from '../../lib/words';
import { TranslationLines } from '../Cards';
import { DIRECTION_LABEL } from '../Home';
import { GameShell, MistakesList, SpeakerIcon, Tally, type Mistake } from './GameShell';

/** After a right answer the field stands still this long before the next order. */
const DELIVER_MS = 700;
/** Below this window height the walk is kept to at least `MIN_WALK_PX`, even if the workers start out of sight. */
const SHORT_SCREEN = 640;
const MIN_WALK_PX = 150;
/** Room under the lowest worker at the start of the walk. */
const BOTTOM_PX = 12;
/** Room between two workers in the same lane. */
const LANE_GAP_PX = 28;
/** Height assumed for a worker that has not been measured yet. */
const WORKER_HEIGHT_GUESS = 48;
/** The longest step the clock takes in one frame, so a slow frame never throws the workers forward. */
const MAX_STEP_MS = 50;

/** One audience as planned when the run starts: a verb and the forms it will ask. */
export interface Audience {
  verb: Verb;
  forms: Word[];
}

type FieldPhase = 'banner' | 'order' | 'right' | 'reveal' | 'table' | 'over';

/** Everything the rules need, kept out of React state; the loop changes it and asks for a redraw. */
interface Court {
  phase: FieldPhase;
  /** Game time in ms: stands still while the tab is hidden. */
  clock: number;
  /** When the banner, the delivery or the reveal ends. */
  until: number;
  /** The audience being held, counting from 0. */
  audience: number;
  /** The order within the audience, counting from 0. */
  index: number;
  /** Orders made so far in the run, for the workers' keys. */
  serial: number;
  order: Question | null;
  /** How far the workers have walked: 0 at the start, 1 when the first reaches the queen's strip. */
  t: number;
  /** How long this order's walk takes. */
  walk: number;
  /** Right answers in a row. Never shown. */
  run: number;
  /** The forms asked in this audience: right or not. */
  asked: Map<string, boolean>;
  /** The worker tapped for this order, if any. */
  chosen: string | null;
}

interface FieldProps {
  plan: Audience[];
  show: ShowLang;
  /** Sound and vibration on. */
  sound: boolean;
  onRight: () => void;
  /** A wrong worker tapped (`chosen`) or the workers arrived untapped (`chosen` null). */
  onMiss: (form: Word, chosen: Word | null) => void;
  onAudience: (audience: number) => void;
  onOver: () => void;
}

/** A verb's meaning on one line, in the languages shown. */
function meaning(word: Word, show: ShowLang): string {
  return [...(show !== 'en' ? [word.pl] : []), ...(show !== 'pl' ? [word.en] : [])].join(' / ');
}

/** The verb with its meaning, as one line. */
function VerbLine({ verb, show }: { verb: Word; show: ShowLang }) {
  return (
    <>
      <span className="court-verb-mt" lang="mt">
        {verb.mt}
      </span>{' '}
      · {meaning(verb, show)}
    </>
  );
}

/** The queen's strip, the workers, the game loop and the table after each audience. One run per mount. */
function CourtField({ plan, show, sound, onRight, onMiss, onAudience, onOver }: FieldProps) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const cb = useRef({ onRight, onMiss, onAudience, onOver });
  cb.current = { onRight, onMiss, onAudience, onOver };
  const soundOn = useRef(sound);
  soundOn.current = sound;

  const fieldRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  /** The element of each worker, by form id. */
  const els = useRef(new Map<string, HTMLElement>());
  const workerH = useRef(WORKER_HEIGHT_GUESS);

  const court = useRef<Court>(null as unknown as Court);
  if (!court.current) {
    court.current = {
      phase: 'banner',
      clock: 0,
      until: BANNER_MS,
      audience: 0,
      index: 0,
      serial: 0,
      order: null,
      t: 0,
      walk: walkMs(0),
      run: 0,
      asked: new Map(),
      chosen: null,
    };
  }

  /* ---------- geometry ---------- */

  /**
   * Where the workers walk. Two lanes, two workers to a lane, staggered by half a step so that
   * no two overlap; `step` is the distance between workers in the same lane. `walk` is the px
   * from the first worker's start to the bottom of the queen's strip.
   */
  const layout = () => {
    const fieldH = fieldRef.current?.clientHeight ?? 0;
    const stripH = stripRef.current?.offsetHeight ?? 0;
    const h = workerH.current;
    const step = h + LANE_GAP_PX;
    const groupH = step * 1.5 + h;
    const room = fieldH - BOTTOM_PX - groupH - stripH;
    const walk = window.innerHeight < SHORT_SCREEN ? Math.max(MIN_WALK_PX, room) : Math.max(0, room);
    return { stripH, step, walk, h };
  };

  /** The top edge and lane of worker `k` (0 walks first) when the walk is at `t`. */
  const workerBox = (k: number, t: number) => {
    const { stripH, step, walk, h } = layout();
    // Lanes alternate, so the first two workers are side by side, half a step apart.
    const lane = k % 2;
    const offset = (k * step) / 2;
    return { lane, top: stripH + (1 - t) * walk + offset, h };
  };

  /** Writes every worker's position straight to its element. */
  const place = () => {
    const g = court.current;
    if (!g.order) return;
    const tallest = Math.max(0, ...g.order.options.map((w) => els.current.get(w.id)?.offsetHeight ?? 0));
    if (tallest > 0) workerH.current = tallest;
    g.order.options.forEach((w, k) => {
      const el = els.current.get(w.id);
      if (!el) return;
      el.style.transform = `translate(-50%, ${Math.round(workerBox(k, g.t).top)}px)`;
    });
  };

  useEffect(() => {
    const g = court.current;

    /* ---------- rules ---------- */

    const audience = () => plan[g.audience];

    const startAudience = () => {
      g.phase = 'banner';
      g.until = g.clock + BANNER_MS;
      g.index = 0;
      g.order = null;
      g.asked = new Map();
      cb.current.onAudience(g.audience);
    };

    const nextOrder = () => {
      const { verb, forms } = audience();
      g.order = makeOrder(verb, forms[g.index], g.run);
      g.serial += 1;
      g.walk = walkMs(g.run);
      g.t = 0;
      g.chosen = null;
      g.phase = 'order';
    };

    /** After an order: the next one, or the table when the audience is over. */
    const afterOrder = () => {
      g.index += 1;
      if (g.index < audience().forms.length) nextOrder();
      else {
        g.phase = 'table';
        g.order = null;
      }
    };

    const step = (dt: number) => {
      if (g.phase === 'over' || g.phase === 'table') return;
      g.clock += dt;
      if (g.phase === 'order') {
        g.t = Math.min(1, g.t + dt / g.walk);
        if (g.t >= 1) {
          miss(null);
          redraw();
        }
        return;
      }
      if (g.clock < g.until) return;
      if (g.phase === 'banner') nextOrder();
      else afterOrder();
      redraw();
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
      place();
    };

    const miss = (chosen: Word | null) => {
      const order = g.order!;
      g.run = 0;
      g.chosen = chosen?.id ?? null;
      g.asked.set(order.answer.id, false);
      g.phase = 'reveal';
      g.until = g.clock + REVEAL_MS;
      cb.current.onMiss(order.answer, chosen);
    };

    pickRef.current = (w: Word) => {
      if (g.phase !== 'order' || !g.order) return;
      if (w.id === g.order.answer.id) {
        g.run += 1;
        g.chosen = w.id;
        g.asked.set(w.id, true);
        g.phase = 'right';
        g.until = g.clock + DELIVER_MS;
        cb.current.onRight();
      } else {
        miss(w);
      }
      redraw();
    };

    continueRef.current = () => {
      if (g.phase !== 'table') return;
      g.audience += 1;
      if (g.audience < plan.length) startAudience();
      else {
        g.phase = 'over';
        cb.current.onOver();
      }
      redraw();
    };

    redraw();
    frame = requestAnimationFrame(tick);

    if (import.meta.env.DEV) {
      // Lets the automated check play; stripped from the production build.
      (window as unknown as Record<string, unknown>).__queen = {
        get state() {
          return {
            phase: g.phase,
            audience: g.audience,
            index: g.index,
            t: g.t,
            walk: g.walk,
            run: g.run,
            verb: plan[g.audience]?.verb.verb.id ?? null,
            answer: g.order?.answer.id ?? null,
            options: g.order?.options.map((w) => w.id) ?? [],
            chosen: g.chosen,
          };
        },
      };
    }
    return () => cancelAnimationFrame(frame);
  }, [plan]);

  const pickRef = useRef<(w: Word) => void>(() => {});
  const continueRef = useRef<() => void>(() => {});

  // New workers get their position before they are painted.
  useLayoutEffect(place);

  const g = court.current;
  const current = plan[Math.min(g.audience, plan.length - 1)];
  const order = g.order;
  const keep = (id: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  };
  const last = g.audience === plan.length - 1;

  return (
    <div ref={fieldRef} className="court-field">
      <div ref={stripRef} className="court-strip">
        <p className="court-verb">
          {g.phase === 'reveal' && order ? (
            <span className="court-wanted" role="status">
              She wanted{' '}
              <span className="court-verb-mt" lang="mt">
                {order.answer.mt}
              </span>
            </span>
          ) : (
            <VerbLine verb={current.verb.verb} show={show} />
          )}
        </p>
        {order && (
          <p className="court-order">
            <TranslationLines word={order.answer} show={show} />
          </p>
        )}
      </div>

      {order &&
        order.options.map((w, k) => {
          const state =
            g.phase === 'order'
              ? ''
              : w.id === order.answer.id
                ? ' is-right'
                : w.id === g.chosen
                  ? ' is-wrong'
                  : g.phase === 'right'
                    ? ' is-gone'
                    : '';
          return (
            <button
              key={`${g.serial}-${w.id}`}
              ref={keep(w.id)}
              className={`hive-word court-worker${state}`}
              style={{ left: k % 2 === 0 ? '25%' : '75%' }}
              data-word={w.id}
              disabled={g.phase !== 'order'}
              onClick={() => pickRef.current(w)}
            >
              <span className="tile-mt" lang="mt">
                {w.mt}
              </span>
            </button>
          );
        })}

      {g.phase === 'banner' && (
        <div className="bee-overlay hive-banner court-banner" role="status">
          <p className="court-banner-note">
            Verb {g.audience + 1} of {plan.length}
          </p>
          <p className="hive-banner-title" lang="mt">
            {current.verb.verb.mt}
          </p>
          <p>{meaning(current.verb.verb, show)}</p>
        </div>
      )}

      {g.phase === 'table' && (
        <div className="court-table-wrap">
          <div className="court-table-card">
            <p className="court-table-title" lang="mt">
              {current.verb.verb.mt}
            </p>
            <p className="muted">{meaning(current.verb.verb, show)}</p>
            <table className="court-table">
              <tbody>
                {paradigm(current.verb, g.asked).map(({ form, state }) => (
                  <tr key={form.id} className={`court-row court-row--${state}`}>
                    <td className="court-cell-mark" aria-label={state === 'right' ? 'right' : state === 'wrong' ? 'missed' : undefined}>
                      {state === 'right' ? '✓' : state === 'wrong' ? '✗' : ''}
                    </td>
                    <td className="court-cell-mt" lang="mt">
                      {form.mt}
                    </td>
                    <td className="court-cell-x">
                      <TranslationLines word={form} show={show} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-primary btn-wide" onClick={() => continueRef.current()} autoFocus>
              {last ? 'Finish' : 'Continue'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Phase = 'ready' | 'playing' | 'over';

/**
 * The queen asks for a form of a verb by its meaning; four workers walk up to her, each carrying
 * a form. Tap the one with the right form before they arrive. Four verbs, five orders each.
 */
export function QueensOrders({ data, update, onExit }: { data: AppData; update: Update; onExit: () => void }) {
  const [{ show }] = useState(data.settings);
  // The whole deck: the topic and the "verb forms" switch do not apply here.
  const [verbs] = useState(() => courtVerbs(WORDS));
  const [plan, setPlan] = useState<Audience[]>([]);
  const [phase, setPhase] = useState<Phase>('ready');
  const [round, setRound] = useState(0);
  const [tally, setTally] = useState({ ok: 0, bad: 0 });
  const [audience, setAudience] = useState(0);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const sound = data.settings.sound;
  const total = plan.reduce((n, a) => n + a.forms.length, 0);

  const toggleSound = () => {
    // Turning sound on is a press, so the browser lets it start now.
    if (!sound) wakeSound();
    update((d) => ({ ...d, settings: { ...d.settings, sound: !d.settings.sound } }));
  };

  const start = () => {
    if (sound) wakeSound();
    setRound((n) => n + 1);
    setPlan(planRun(verbs).map((verb) => ({ verb, forms: planAudience(verb) })));
    setTally({ ok: 0, bad: 0 });
    setAudience(0);
    setMistakes([]);
    setPhase('playing');
  };

  const finish = () => setPhase('over');

  return (
    <GameShell
      title="Queen’s orders"
      status={
        phase === 'playing' ? (
          <span className="bee-status">
            <Tally ok={tally.ok} bad={tally.bad} />
            <span className="hive-wave">
              Verb {audience + 1} of {plan.length}
            </span>
          </span>
        ) : (
          ''
        )
      }
      onExit={onExit}
    >
      {phase === 'ready' && (
        <div className="card card-done">
          <p className="done-title">Queen’s orders</p>
          {verbs.length === 0 ? (
            <>
              <p className="done-text">No verb in the deck has enough forms for this game.</p>
              <div className="done-actions">
                <button className="btn btn-primary btn-wide" onClick={onExit} autoFocus>
                  Back
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="done-text">The queen asks for a form of a verb. Tap the worker carrying it before they reach her.</p>
              <p className="muted">{DIRECTION_LABEL.x2mt}</p>
              <div className="done-actions">
                <button className="btn btn-primary btn-wide" onClick={start} autoFocus>
                  Start
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {phase === 'playing' && (
        <>
          <CourtField
            key={round}
            plan={plan}
            show={show}
            sound={sound}
            onRight={() => setTally((t) => ({ ...t, ok: t.ok + 1 }))}
            onMiss={(word, chosen) => {
              setTally((t) => ({ ...t, bad: t.bad + 1 }));
              setMistakes((list) => [...list, { word, chosen }]);
            }}
            onAudience={setAudience}
            onOver={finish}
          />
          <div className="bee-foot">
            <p className="bee-hint">Tap the worker with the right form</p>
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
            of {total} {total === 1 ? 'order' : 'orders'} filled
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

          <MistakesList mistakes={mistakes} dir="x2mt" show={show} missedText="the workers arrived" />

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
