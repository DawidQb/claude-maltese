import type { AppData, Update } from '../lib/store';
import { DIRECTION_LABEL, TopicOptions } from './Home';

export type GameId = 'bee' | 'typing' | 'pairs' | 'speed';

interface Props {
  data: AppData;
  update: Update;
  onPlay: (game: GameId) => void;
}

export function Games({ data, update, onPlay }: Props) {
  const { topic, direction } = data.settings;
  const best = data.games.speedBest;

  const games: { id: GameId; name: string; text: string; detail?: string }[] = [
    {
      id: 'bee',
      name: 'Busy bee',
      text: 'Tap to keep the bee flying and steer it through the door with the right Maltese word.',
      detail: DIRECTION_LABEL.x2mt,
    },
    {
      id: 'typing',
      name: 'Infinite typing',
      text: 'An endless random stream of words. See the Polish or English, type the Maltese.',
    },
    {
      id: 'pairs',
      name: 'Match pairs',
      text: 'Six Maltese words and six translations. Tap the two that belong together. No timer.',
    },
    {
      id: 'speed',
      name: 'Speed round',
      text: '60 seconds of questions with four answers to choose from.',
      detail: `${DIRECTION_LABEL[direction]}${best > 0 ? ` · best ${best}` : ''}`,
    },
  ];

  return (
    <div className="stack">
      <section>
        <h2 className="eyebrow">
          <label htmlFor="game-topic">Topic</label>
        </h2>
        <select
          id="game-topic"
          className="input"
          value={topic}
          onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, topic: e.target.value } }))}
        >
          <TopicOptions include={data.settings} />
        </select>
      </section>

      <section className="game-list" aria-label="Games">
        {games.map((g) => (
          <article key={g.id} className="game">
            <div>
              <h2 className="game-name">{g.name}</h2>
              <p className="muted">{g.text}</p>
              {g.detail && <p className="game-detail">{g.detail}</p>}
            </div>
            <button className="btn btn-primary" onClick={() => onPlay(g.id)} aria-label={`Play ${g.name}`}>
              Play
            </button>
          </article>
        ))}
      </section>

      <p className="muted">Games are just for practice: they don’t change which cards are due on the Study tab.</p>
    </div>
  );
}
