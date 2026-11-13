import { useEffect, useRef, useState } from 'react';
import { WordStream } from '../../lib/games';
import { ALPHABET, keyLabel } from '../../lib/letters';
import { wakeSound } from '../../lib/sound';
import type { AppData, Update } from '../../lib/store';
import { CAUGHT_MS, FREED_MS, guess, newRound, padKey, shown, webPool, type Round } from '../../lib/web';
import { ALL_TOPICS, wordsInTopic } from '../../lib/words';
import { Face, TranslationLines } from '../Cards';
import { GameShell, MistakesList, SpeakerIcon, Tally, type Mistake } from './GameShell';

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

  useEffect(() => () => window.clearTimeout(timer.current), []);

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
    if (result.state === 'freed') {
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
      <div className="web-scene">
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
