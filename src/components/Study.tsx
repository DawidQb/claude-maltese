import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildSession, type Direction, type Grade } from '../lib/srs';
import { newLeft, recordAnswer, type AppData, type ShowLang, type Update } from '../lib/store';
import { WORDS, type Word } from '../lib/words';
import { DIRECTION_LABEL } from './Home';

interface Props {
  data: AppData;
  update: Update;
  today: string;
  onExit: () => void;
}

const WORD_IDS = WORDS.map((w) => w.id);
const BY_ID = new Map(WORDS.map((w) => [w.id, w]));
const EXTRA_NEW = 10;

const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: 'no', label: 'No', key: '1' },
  { grade: 'almost', label: 'Almost', key: '2' },
  { grade: 'knew', label: 'Knew it', key: '3' },
];

export function Study({ data, update, today, onExit }: Props) {
  // The direction is fixed for the whole session.
  const [dir] = useState<Direction>(data.settings.direction);
  const [queue, setQueue] = useState<string[]>(() =>
    buildSession({ wordIds: WORD_IDS, cards: data.cards, dir, today, newLeft: newLeft(data, dir, today) }),
  );
  const [total, setTotal] = useState(queue.length);
  // Words already answered "No" this session: they repeat until known, without being re-scored.
  const [retry, setRetry] = useState<Set<string>>(() => new Set());
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState<Record<Grade, number>>({ no: 0, almost: 0, knew: 0 });

  const current = queue.length > 0 ? BY_ID.get(queue[0]) : undefined;
  const unseenLeft = useMemo(
    () => WORD_IDS.filter((id) => !data.cards[`${dir}:${id}`]).length,
    [data.cards, dir],
  );

  const answer = useCallback(
    (grade: Grade) => {
      const id = queue[0];
      if (!id) return;
      if (!retry.has(id)) {
        update((d) => recordAnswer(d, dir, id, grade, today));
        setTally((t) => ({ ...t, [grade]: t[grade] + 1 }));
      }
      const rest = queue.slice(1);
      if (grade === 'no') {
        setRetry((r) => new Set(r).add(id));
        setQueue([...rest, id]);
      } else {
        setQueue(rest);
      }
      setRevealed(false);
    },
    [queue, retry, update, dir, today],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') return onExit();
      if (!current) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      const hit = revealed ? GRADES.find((g) => g.key === e.key) : undefined;
      if (hit) answer(hit.grade);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, revealed, answer, onExit]);

  const addMore = () => {
    const extra = buildSession({ wordIds: WORD_IDS, cards: data.cards, dir, today, newLeft: EXTRA_NEW });
    setQueue(extra);
    setTotal(extra.length);
    setRetry(new Set());
    setRevealed(false);
  };

  const done = total - queue.length;

  return (
    <div className="study">
      <header className="study-head">
        <button className="btn btn-ghost" onClick={onExit}>
          ← Back
        </button>
        <span className="study-dir">{DIRECTION_LABEL[dir]}</span>
        <span className="study-count" aria-live="polite">
          {total > 0 ? `${Math.min(done + 1, total)} / ${total}` : ''}
        </span>
      </header>

      {total > 0 && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <span style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}

      {current ? (
        <>
          <div className="card" key={`${current.id}:${queue.length}`}>
            <p className="card-side">{dir === 'mt2x' ? 'Maltese' : 'Translate into Maltese'}</p>
            <Face word={current} side={dir === 'mt2x' ? 'mt' : 'x'} show={data.settings.show} />

            {revealed && (
              <div className="card-answer">
                <Face word={current} side={dir === 'mt2x' ? 'x' : 'mt'} show={data.settings.show} />
                {current.note && <p className="card-note">{current.note}</p>}
              </div>
            )}
          </div>

          <div className="actions">
            {revealed ? (
              <div className="grades">
                {GRADES.map((g) => (
                  <button key={g.grade} className={`btn grade grade-${g.grade}`} onClick={() => answer(g.grade)}>
                    {g.label}
                    <kbd>{g.key}</kbd>
                  </button>
                ))}
              </div>
            ) : (
              <button className="btn btn-primary btn-wide" onClick={() => setRevealed(true)} autoFocus>
                Show answer
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="card card-done">
          <p className="done-title" lang="mt">
            Prosit!
          </p>
          <p className="done-text">
            {total > 0 ? 'Session finished.' : 'Nothing is due right now.'}
          </p>
          {total > 0 && (
            <ul className="legend legend-center">
              <li>
                <i className="dot dot-known" />
                {tally.knew} knew
              </li>
              <li>
                <i className="dot dot-learning" />
                {tally.almost} almost
              </li>
              <li>
                <i className="dot dot-no" />
                {tally.no} missed
              </li>
            </ul>
          )}
          <div className="done-actions">
            {unseenLeft > 0 && (
              <button className="btn btn-secondary btn-wide" onClick={addMore}>
                Learn {Math.min(EXTRA_NEW, unseenLeft)} more new words
              </button>
            )}
            <button className="btn btn-primary btn-wide" onClick={onExit}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Face({ word, side, show }: { word: Word; side: 'mt' | 'x'; show: ShowLang }) {
  if (side === 'mt') {
    return (
      <p className="word-mt" lang="mt">
        {word.mt}
      </p>
    );
  }
  return (
    <dl className="translations">
      {show !== 'en' && (
        <div>
          <dt>PL</dt>
          <dd lang="pl">{word.pl}</dd>
        </div>
      )}
      {show !== 'pl' && (
        <div>
          <dt>EN</dt>
          <dd lang="en">{word.en}</dd>
        </div>
      )}
    </dl>
  );
}
