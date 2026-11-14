import { useCallback, useMemo, useState } from 'react';
import { BeeSwarm } from './components/BeeSwarm';
import { Games, type GameId } from './components/Games';
import { BouncyBee } from './components/games/BouncyBee';
import { HoneycombSpell } from './components/games/HoneycombSpell';
import { InfiniteTyping } from './components/games/InfiniteTyping';
import { MatchPairs } from './components/games/MatchPairs';
import { ProtectHive } from './components/games/ProtectHive';
import { QueensOrders } from './components/games/QueensOrders';
import { SpeedRound } from './components/games/SpeedRound';
import { SpiderWeb } from './components/games/SpiderWeb';
import { TrueOrSting } from './components/games/TrueOrSting';
import { WatchFlowers } from './components/games/WatchFlowers';
import { Home } from './components/Home';
import { Settings } from './components/Settings';
import { Study } from './components/Study';
import { WordList } from './components/WordList';
import { useAccount } from './lib/account';
import { toISODate } from './lib/srs';
import { useStore, viewOf } from './lib/store';
import { useDeck } from './lib/useDeck';
import { setLearn, TARGET } from './lib/words';

type Tab = 'home' | 'games' | 'words' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Study' },
  { id: 'games', label: 'Games' },
  { id: 'words', label: 'Words' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [stored, update] = useStore();
  // Before anything below reads the deck: the words, letters and names of the language being learned.
  setLearn(stored.settings.learn);
  const data = useMemo(() => viewOf(stored), [stored]);
  const account = useAccount(stored, update);
  const [tab, setTab] = useState<Tab>('home');
  // A study session or a game takes over the whole screen.
  const [activity, setActivity] = useState<'study' | GameId | null>(null);
  const close = useCallback(() => setActivity(null), []);
  // Re-renders when a newer deck from the database is switched to.
  const deckVersion = useDeck(activity === null, update);
  const today = toISODate(new Date());

  const swarm = data.settings.bees && <BeeSwarm />;

  if (activity) {
    return (
      <>
        {swarm}
        <div className="shell">
          {activity === 'study' && <Study data={data} update={update} today={today} onExit={close} />}
          {activity === 'bee' && <BouncyBee data={data} update={update} onExit={close} />}
          {activity === 'hive' && <ProtectHive data={data} update={update} onExit={close} />}
          {activity === 'queen' && <QueensOrders data={data} update={update} onExit={close} />}
          {activity === 'typing' && <InfiniteTyping data={data} onExit={close} />}
          {activity === 'spell' && <HoneycombSpell data={data} update={update} onExit={close} />}
          {activity === 'web' && <SpiderWeb data={data} update={update} onExit={close} />}
          {activity === 'pairs' && <MatchPairs data={data} onExit={close} />}
          {activity === 'sting' && <TrueOrSting data={data} update={update} onExit={close} />}
          {activity === 'speed' && <SpeedRound data={data} update={update} onExit={close} />}
          {activity === 'meadow' && <WatchFlowers data={data} update={update} onExit={close} />}
        </div>
      </>
    );
  }

  return (
    <>
      {swarm}
      <div className="shell">
        <header className="topbar">
          <span className="brand" lang="mt">
            naħla
          </span>
          <span className="brand-sub">{TARGET} flashcards</span>
        </header>

        <main className="content" key={deckVersion}>
          {tab === 'home' && <Home data={data} update={update} today={today} onStudy={() => setActivity('study')} />}
          {tab === 'games' && <Games data={data} update={update} onPlay={setActivity} />}
          {tab === 'words' && <WordList data={data} />}
          {tab === 'settings' && <Settings data={stored} update={update} account={account} />}
        </main>

        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
