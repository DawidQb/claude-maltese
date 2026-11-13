import { useEffect, useRef, useState } from 'react';
import { makePairsRound } from '../../lib/games';
import type { AppData } from '../../lib/store';
import { wordsInTopic } from '../../lib/words';
import { TranslationLines } from '../Cards';
import { GameShell, Tally } from './GameShell';

type Side = 'left' | 'right';
const WRONG_FLASH_MS = 600;

/** Tap a Maltese word and its translation to pair them. Untimed. */
export function MatchPairs({ data, onExit }: { data: AppData; onExit: () => void }) {
  const [{ topic, show }] = useState(data.settings);
  const [words] = useState(() => wordsInTopic(topic, data.settings));
  const [round, setRound] = useState(() => makePairsRound(words));
  const [matched, setMatched] = useState<Set<string>>(() => new Set());
  const [picked, setPicked] = useState<{ left: string | null; right: string | null }>({ left: null, right: null });
  const [wrong, setWrong] = useState<{ left: string; right: string } | null>(null);
  // Pairs found and wrong tries, counted across rounds.
  const [score, setScore] = useState({ ok: 0, bad: 0 });
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const total = round.left.length;
  const finished = matched.size === total;

  const pick = (side: Side, id: string) => {
    if (matched.has(id)) return;
    // A new tap ends the "wrong" flash early.
    window.clearTimeout(timer.current);
    setWrong(null);

    const next = { ...picked, [side]: picked[side] === id ? null : id };
    if (next.left === null || next.right === null) {
      setPicked(next);
      return;
    }
    if (next.left === next.right) {
      setMatched((m) => new Set(m).add(id));
      setScore((s) => ({ ...s, ok: s.ok + 1 }));
    } else {
      setScore((s) => ({ ...s, bad: s.bad + 1 }));
      setWrong({ left: next.left, right: next.right });
      timer.current = window.setTimeout(() => setWrong(null), WRONG_FLASH_MS);
    }
    setPicked({ left: null, right: null });
  };

  const nextRound = () => {
    setRound(makePairsRound(words));
    setMatched(new Set());
    setPicked({ left: null, right: null });
    setWrong(null);
  };

  const tileClass = (side: Side, id: string) =>
    ['tile-btn', 'cell', matched.has(id) && 'is-matched', picked[side] === id && 'is-picked', wrong?.[side] === id && 'is-wrong']
      .filter(Boolean)
      .join(' ');

  return (
    <GameShell title="Match pairs" status={<Tally ok={score.ok} bad={score.bad} />} onExit={onExit}>
      <div className="pairs pairs-comb">
        <div className="pairs-col" role="group" aria-label="Maltese">
          {round.left.map((w) => (
            <button
              key={w.id}
              className={tileClass('left', w.id)}
              aria-pressed={picked.left === w.id}
              disabled={matched.has(w.id)}
              onClick={() => pick('left', w.id)}
            >
              <span className="tile-mt" lang="mt">
                {w.mt}
              </span>
            </button>
          ))}
        </div>
        <div className="pairs-col" role="group" aria-label="Translations">
          {round.right.map((w) => (
            <button
              key={w.id}
              className={tileClass('right', w.id)}
              aria-pressed={picked.right === w.id}
              disabled={matched.has(w.id)}
              onClick={() => pick('right', w.id)}
            >
              <TranslationLines word={w} show={show} />
            </button>
          ))}
        </div>
      </div>

      <div className="actions">
        {finished ? (
          <button className="btn btn-primary btn-wide" onClick={nextRound} autoFocus>
            Next round
          </button>
        ) : (
          <p className="tap-hint">Tap a Maltese word, then its translation</p>
        )}
      </div>
    </GameShell>
  );
}
