import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { checkAnswer, type Verdict } from '../lib/answer';
import { requestPersistentStorage } from '../lib/install';
import { buildSession, cardKey, type Direction, type Grade } from '../lib/srs';
import { newLeft, recordAnswer, type AppData, type ShowLang, type Update } from '../lib/store';
import { ALL_TOPICS, WORDS, wordsInTopic, type Word } from '../lib/words';
import { DIRECTION_LABEL } from './Home';

interface Props {
  data: AppData;
  update: Update;
  today: string;
  onExit: () => void;
}

const BY_ID = new Map(WORDS.map((w) => [w.id, w]));
const EXTRA_NEW = 10;

export function Study({ data, update, today, onExit }: Props) {
  // Direction, topic and answer mode are fixed for the whole session.
  const [{ direction: dir, topic, typing: typingSetting, show }] = useState(data.settings);
  const typing = dir === 'x2mt' && typingSetting;
  const wordIds = useMemo(() => wordsInTopic(topic).map((w) => w.id), [topic]);

  const [queue, setQueue] = useState<string[]>(() =>
    buildSession({ wordIds, cards: data.cards, dir, today, newLeft: newLeft(data, dir, today) }),
  );
  const [total, setTotal] = useState(queue.length);
  // Words already answered "No" this session: they repeat until known, without being re-scored.
  const [retry, setRetry] = useState<Set<string>>(() => new Set());
  const [tally, setTally] = useState<Record<Grade, number>>({ no: 0, almost: 0, knew: 0 });

  const current = queue.length > 0 ? BY_ID.get(queue[0]) : undefined;
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
  // Remount the card for every question, including a missed word coming round again.
  const cardId = current ? `${current.id}:${queue.length}:${done}` : '';

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
          <TypeCard key={cardId} word={current} show={show} onGrade={answer} />
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
      <div className="card">
        <p className="card-side">{dir === 'mt2x' ? 'Maltese' : 'Translate into Maltese'}</p>
        <Face word={word} side={dir === 'mt2x' ? 'mt' : 'x'} show={show} />
        {revealed && (
          <div className="card-answer">
            <Face word={word} side={dir === 'mt2x' ? 'x' : 'mt'} show={show} />
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
          <button className="btn btn-primary btn-wide" onClick={() => setRevealed(true)}>
            Show answer
          </button>
        )}
      </div>
    </>
  );
}

/* ---------- Typing mode: write the Maltese word, the app checks it ---------- */

const SPECIAL_KEYS = ['ċ', 'ġ', 'għ', 'ħ', 'ż'];

const VERDICT: Record<Verdict, { title: string; grade: Grade }> = {
  correct: { title: 'Correct', grade: 'knew' },
  close: { title: 'Almost', grade: 'almost' },
  wrong: { title: 'Not quite', grade: 'no' },
};

interface TypeProps {
  word: Word;
  show: ShowLang;
  onGrade: (grade: Grade) => void;
}

function TypeCard({ word, show, onGrade }: TypeProps) {
  const [value, setValue] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Put the cursor back after a special-letter key rewrites the field.
  useEffect(() => {
    if (caret.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);

  const insert = (text: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    caret.current = start + text.length;
    setValue(value.slice(0, start) + text + value.slice(end));
    el?.focus();
  };

  const check = (e: FormEvent) => {
    e.preventDefault();
    setVerdict(checkAnswer(value, word.mt));
  };

  const typed = value.trim();

  return (
    <>
      <div className="card card-typing">
        <p className="card-side">Translate into Maltese</p>
        <Face word={word} side="x" show={show} />
        {verdict && (
          <div className="card-answer" role="status">
            <p className={`verdict verdict-${verdict}`}>{VERDICT[verdict].title}</p>
            <Face word={word} side="mt" show={show} />
            {verdict !== 'correct' && typed !== '' && (
              <p className="typed">
                You typed <span lang="mt">{typed}</span>
              </p>
            )}
            {word.note && <p className="card-note">{word.note}</p>}
          </div>
        )}
      </div>

      <div className="actions">
        {verdict ? (
          <div className="result-actions">
            {verdict !== 'correct' && (
              <button className="btn btn-secondary" onClick={() => onGrade('knew')}>
                I was right
              </button>
            )}
            <button className="btn btn-primary" onClick={() => onGrade(VERDICT[verdict].grade)} autoFocus>
              Continue
            </button>
          </div>
        ) : (
          <form className="type-form" onSubmit={check}>
            <input
              ref={inputRef}
              className="input type-input"
              lang="mt"
              aria-label="Your answer in Maltese"
              placeholder="Type the Maltese word"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
            />
            <div className="keys" role="group" aria-label="Maltese letters">
              {SPECIAL_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="key"
                  lang="mt"
                  // Keep focus (and the phone keyboard) on the text field.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => insert(k)}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="result-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setVerdict('wrong')}>
                Don’t know
              </button>
              <button type="submit" className="btn btn-primary">
                Check
              </button>
            </div>
          </form>
        )}
      </div>
    </>
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
