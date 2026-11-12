import { cardKey, countDue, countNew, currentStreak, type Direction } from '../lib/srs';
import { newLeft, type AppData, type Update } from '../lib/store';
import { WORDS } from '../lib/words';

interface Props {
  data: AppData;
  update: Update;
  today: string;
  onStudy: () => void;
}

const WORD_IDS = WORDS.map((w) => w.id);

export const DIRECTION_LABEL: Record<Direction, string> = {
  mt2x: 'Maltese → Polish / English',
  x2mt: 'Polish / English → Maltese',
};

export function Home({ data, update, today, onStudy }: Props) {
  const dir = data.settings.direction;
  const base = { wordIds: WORD_IDS, cards: data.cards, dir, today };
  const due = countDue(base);
  const fresh = countNew({ ...base, newLeft: newLeft(data, dir, today) });
  const total = due + fresh;
  const streak = currentStreak(data.streak, today);

  const boxes = WORDS.map((w) => data.cards[cardKey(dir, w.id)]?.box ?? 0);
  const learning = boxes.filter((b) => b >= 1 && b <= 2).length;
  const known = boxes.filter((b) => b >= 3).length;
  const unseen = WORDS.length - learning - known;
  const pct = (n: number) => `${(n / WORDS.length) * 100}%`;

  const setDirection = (direction: Direction) => update((d) => ({ ...d, settings: { ...d.settings, direction } }));

  return (
    <div className="stack">
      <section aria-labelledby="dir-label">
        <h2 id="dir-label" className="eyebrow">
          Direction
        </h2>
        <div className="segmented" role="group" aria-labelledby="dir-label">
          {(['mt2x', 'x2mt'] as Direction[]).map((d) => (
            <button key={d} aria-pressed={dir === d} onClick={() => setDirection(d)}>
              {DIRECTION_LABEL[d]}
            </button>
          ))}
        </div>
      </section>

      <section className="hero">
        <p className="hero-count">{total}</p>
        <p className="hero-label">{total === 1 ? 'card to study today' : 'cards to study today'}</p>
        <button className="btn btn-primary btn-wide" onClick={onStudy}>
          {total > 0 ? 'Start studying' : 'Study extra words'}
        </button>
      </section>

      <section className="tiles" aria-label="Today">
        <div className="tile">
          <span className="tile-num">{due}</span>
          <span className="tile-label">Reviews due</span>
        </div>
        <div className="tile">
          <span className="tile-num">{fresh}</span>
          <span className="tile-label">New words</span>
        </div>
        <div className="tile">
          <span className="tile-num">{streak}</span>
          <span className="tile-label">Day streak</span>
        </div>
      </section>

      <section aria-labelledby="progress-label">
        <h2 id="progress-label" className="eyebrow">
          Progress in this direction
        </h2>
        <div className="bar" role="img" aria-label={`${known} known, ${learning} learning, ${unseen} not started`}>
          <span className="bar-known" style={{ width: pct(known) }} />
          <span className="bar-learning" style={{ width: pct(learning) }} />
        </div>
        <ul className="legend">
          <li>
            <i className="dot dot-known" />
            {known} known
          </li>
          <li>
            <i className="dot dot-learning" />
            {learning} learning
          </li>
          <li>
            <i className="dot dot-new" />
            {unseen} not started
          </li>
        </ul>
      </section>
    </div>
  );
}
