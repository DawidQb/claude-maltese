import { cardKey, countDue, countNew, type Direction } from '../lib/srs';
import { newLeft, type AppData, type Settings, type Update } from '../lib/store';
import { ALL_TOPICS, SOURCE, TARGET, topicsWith, wordsInTopic, type Include } from '../lib/words';

interface Props {
  data: AppData;
  update: Update;
  today: string;
  onStudy: () => void;
}

/** A direction by name, e.g. "Maltese → Polish / English", for the language being learned. */
export function directionLabel(dir: Direction): string {
  return dir === 'mt2x' ? `${TARGET} → ${SOURCE}` : `${SOURCE} → ${TARGET}`;
}

/** The topic choices, with card counts that follow the plural-forms setting. */
export function TopicOptions({ include }: { include: Include }) {
  return (
    <>
      <option value={ALL_TOPICS}>All topics ({wordsInTopic(ALL_TOPICS, include).length} cards)</option>
      {topicsWith(include).map((t) => (
        <option key={t} value={t}>
          {t} ({wordsInTopic(t, include).length})
        </option>
      ))}
    </>
  );
}

/** The two-button direction switch, with its heading. `id` labels the group, so it must be unique on the page. */
export function DirectionPicker({ id, value, onChange }: { id: string; value: Direction; onChange: (dir: Direction) => void }) {
  return (
    <div>
      <h2 id={id} className="eyebrow">
        Direction
      </h2>
      <div className="segmented" role="group" aria-labelledby={id}>
        {(['mt2x', 'x2mt'] as Direction[]).map((d) => (
          <button key={d} aria-pressed={value === d} onClick={() => onChange(d)}>
            {directionLabel(d)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Home({ data, update, today, onStudy }: Props) {
  const { direction: dir, topic, typing } = data.settings;
  const words = wordsInTopic(topic, data.settings);
  const base = { wordIds: words.map((w) => w.id), cards: data.cards, dir, today };
  const due = countDue(base);
  const fresh = countNew({ ...base, newLeft: newLeft(data, dir, today) });
  const total = due + fresh;

  const boxes = words.map((w) => data.cards[cardKey(dir, w.id)]?.box ?? 0);
  const learning = boxes.filter((b) => b >= 1 && b <= 2).length;
  const known = boxes.filter((b) => b >= 3).length;
  const unseen = words.length - learning - known;
  const pct = (n: number) => `${(n / words.length) * 100}%`;

  const set = (patch: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  return (
    <div className="stack">
      <section className="setup" aria-label="Session setup">
        <DirectionPicker id="dir-label" value={dir} onChange={(d) => set({ direction: d })} />

        {dir === 'x2mt' && (
          <label className="switch">
            <span>
              Type the answer
              <small>Spell the {TARGET} word on a letter pad instead of flipping the card</small>
            </span>
            <input type="checkbox" role="switch" checked={typing} onChange={(e) => set({ typing: e.target.checked })} />
          </label>
        )}

        <div>
          <h2 className="eyebrow">
            <label htmlFor="topic">Topic</label>
          </h2>
          <select id="topic" className="input" value={topic} onChange={(e) => set({ topic: e.target.value })}>
            <TopicOptions include={data.settings} />
          </select>
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
      </section>

      <section aria-labelledby="progress-label">
        <h2 id="progress-label" className="eyebrow">
          Progress · {topic === ALL_TOPICS ? 'all topics' : topic}
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
