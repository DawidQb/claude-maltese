import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestPersistentStorage } from '../lib/install';
import { buildSession, cardKey, type Direction, type Grade } from '../lib/srs';
import { newLeft, recordAnswer, type AppData, type ShowLang, type Update } from '../lib/store';
import { ALL_TOPICS, WORDS, wordsInTopic, type Word } from '../lib/words';
import { Face, Forms, TileCard } from './Cards';
import { DIRECTION_LABEL } from './Home';

interface Props {
  data: AppData;
  update: Update;
  today: string;
  onExit: () => void;
}

const EXTRA_NEW = 10;

export function Study({ data, update, today, onExit }: Props) {
  // Direction, topic and answer mode are fixed for the whole session.
  const [settings] = useState(data.settings);
  const { direction: dir, topic, typing: typingSetting, show } = settings;
  const typing = dir === 'x2mt' && typingSetting;
  const wordIds = useMemo(() => wordsInTopic(topic, settings).map((w) => w.id), [topic, settings]);
  // The deck in use when the session started; a newer one is applied after the session.
  const [byId] = useState(() => new Map(WORDS.map((w) => [w.id, w])));

  const [queue, setQueue] = useState<string[]>(() =>
    buildSession({ wordIds, cards: data.cards, dir, today, newLeft: newLeft(data, dir, today) }),
  );
  const [total, setTotal] = useState(queue.length);
  // Words already answered "No" this session: they repeat until known, without being re-scored.
  const [retry, setRetry] = useState<Set<string>>(() => new Set());
  const [tally, setTally] = useState<Record<Grade, number>>({ no: 0, almost: 0, knew: 0 });
  // Counts answers, so every question gets a fresh card, even the same word twice in a row.
  const [turn, setTurn] = useState(0);

  const current = queue.length > 0 ? byId.get(queue[0]) : undefined;
  const unseenLeft = wordIds.filter((id) => !data.cards[cardKey(dir, id)]).length;

  useEffect(requestPersistentStorage, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

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
      setTurn((n) => n + 1);
    },
    [queue, retry, update, dir, today],
  );

  const addMore = () => {
    const extra = buildSession({ wordIds, cards: data.cards, dir, today, newLeft: EXTRA_NEW });
    setQueue(extra);
    setTotal(extra.length);
    setRetry(new Set());
  };

  const done = total - queue.length;
  const cardId = `${current?.id}:${turn}`;

  return (
    <div className="study">
      <header className="study-head">
        <button className="btn btn-ghost" onClick={onExit}>
          ← Back
        </button>
        <span className="study-dir">{topic === ALL_TOPICS ? DIRECTION_LABEL[dir] : topic}</span>
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
        typing ? (
          <TileCard key={cardId} word={current} show={show} autoCheck={settings.autoCheck} onGrade={answer} tapToContinue />
        ) : (
          <FlipCard key={cardId} word={current} dir={dir} show={show} onGrade={answer} />
        )
      ) : (
        <div className="card card-done">
          <p className="done-title" lang="mt">
            Prosit!
          </p>
          <p className="done-text">{total > 0 ? 'Session finished.' : 'Nothing is due right now.'}</p>
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

/* ---------- Flip mode: look, reveal, grade yourself ---------- */

const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: 'no', label: 'No', key: '1' },
  { grade: 'almost', label: 'Almost', key: '2' },
  { grade: 'knew', label: 'Knew it', key: '3' },
];

interface FlipProps {
  word: Word;
  dir: Direction;
  show: ShowLang;
  onGrade: (grade: Grade) => void;
}

function FlipCard({ word, dir, show, onGrade }: FlipProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      const hit = revealed ? GRADES.find((g) => g.key === e.key) : undefined;
      if (hit) onGrade(hit.grade);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, onGrade]);

  return (
    <>
      <div
        className="card card-tappable"
        role="button"
        tabIndex={0}
        aria-label={revealed ? 'Hide the answer' : 'Show the answer'}
        onClick={() => setRevealed((r) => !r)}
      >
        <p className="card-side">{dir === 'mt2x' ? 'Maltese' : 'Translate into Maltese'}</p>
        <Face word={word} side={dir === 'mt2x' ? 'mt' : 'x'} show={show} />
        {revealed && (
          <div className="card-answer">
            <Face word={word} side={dir === 'mt2x' ? 'x' : 'mt'} show={show} />
            <Forms word={word} />
            {word.note && <p className="card-note">{word.note}</p>}
          </div>
        )}
      </div>

      <div className="actions">
        {revealed ? (
          <div className="grades">
            {GRADES.map((g) => (
              <button key={g.grade} className={`btn grade grade-${g.grade}`} onClick={() => onGrade(g.grade)}>
                {g.label}
                <kbd>{g.key}</kbd>
              </button>
            ))}
          </div>
        ) : (
          <p className="tap-hint">Tap the card to see the answer</p>
        )}
      </div>
    </>
  );
}
