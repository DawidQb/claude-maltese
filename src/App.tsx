import { useState } from 'react';
import { Home } from './components/Home';
import { Settings } from './components/Settings';
import { Study } from './components/Study';
import { WordList } from './components/WordList';
import { toISODate } from './lib/srs';
import { useStore } from './lib/store';

type Tab = 'home' | 'words' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Study' },
  { id: 'words', label: 'Words' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [data, update] = useStore();
  const [tab, setTab] = useState<Tab>('home');
  const [studying, setStudying] = useState(false);
  const today = toISODate(new Date());

  if (studying) {
    return (
      <div className="shell">
        <Study data={data} update={update} today={today} onExit={() => setStudying(false)} />
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand" lang="mt">
          kelma
        </span>
        <span className="brand-sub">Maltese flashcards</span>
      </header>

      <main className="content">
        {tab === 'home' && <Home data={data} update={update} today={today} onStudy={() => setStudying(true)} />}
        {tab === 'words' && <WordList data={data} />}
        {tab === 'settings' && <Settings data={data} update={update} />}
      </main>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
