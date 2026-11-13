import type { AppData, Settings, Update } from '../lib/store';
import { DirectionPicker, TopicOptions } from './Home';

export type GameId = 'bee' | 'hive' | 'queen' | 'typing' | 'pairs' | 'speed';

interface Props {
  data: AppData;
  update: Update;
  onPlay: (game: GameId) => void;
}

export function Games({ data, update, onPlay }: Props) {
  const { topic, gameDirection } = data.settings;
  const best = data.games.speedBest;
  const set = (patch: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  const games: { id: GameId; name: string; text: string; detail?: string }[] = [
    {
      id: 'bee',
      name: 'Busy bee',
      text: 'Tap to keep the bee flying and steer it through the door with the right answer.',
    },
    {
      id: 'hive',
      name: 'Protect the hive',
      text: 'Words creep towards the hive. Tap a word and its answer to zap it before it gets there.',
      detail: data.games.hiveBest > 0 ? `best ${data.games.hiveBest}` : undefined,
    },
    {
      id: 'queen',
      name: 'Queen’s orders',
      text: 'The queen asks for a form of a verb. Tap the worker carrying it before they reach her.',
    },
    {
      id: 'typing',
      name: 'Infinite typing',
      text: 'An endless random stream of words. See the Polish or English, spell the Maltese on a ten-letter pad.',
      detail: 'Always Polish / English → Maltese',
    },
    {
      id: 'pairs',
      name: 'Match pairs',
      text: 'Six Maltese words and six translations. Tap the two that belong together. No timer.',
      detail: 'Direction does not apply',
    },
    {
      id: 'speed',
      name: 'Speed round',
      text: '60 seconds of questions with four answers to choose from.',
      detail: best > 0 ? `best ${best}` : undefined,
    },
  ];

  return (
    <div className="stack">
      <section className="setup" aria-label="Game setup">
        <DirectionPicker id="game-dir-label" value={gameDirection} onChange={(d) => set({ gameDirection: d })} />

        <div>
          <h2 className="eyebrow">
            <label htmlFor="game-topic">Topic</label>
          </h2>
          <select id="game-topic" className="input" value={topic} onChange={(e) => set({ topic: e.target.value })}>
            <TopicOptions include={data.settings} />
          </select>
        </div>
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
