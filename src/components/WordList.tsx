import { useMemo, useState } from 'react';
import { cardKey } from '../lib/srs';
import type { AppData } from '../lib/store';
import { fold } from '../lib/text';
import { TOPICS, WORDS, topicsWith } from '../lib/words';
import { DIRECTION_LABEL } from './Home';

const INDEX = WORDS.map((w) => ({ word: w, text: fold(`${w.mt} ${w.pl} ${w.en}`) }));

function boxLabel(box: number): string {
  if (box === 0) return 'New';
  return box >= 3 ? `Known · ${box}` : `Learning · ${box}`;
}

export function WordList({ data }: { data: AppData }) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const { direction: dir, plurals, verbForms } = data.settings;
  const topics = topicsWith(data.settings);

  const groups = useMemo(() => {
    const q = fold(query.trim());
    const hits = INDEX.filter(
      (e) =>
        (plurals || !e.word.pluralOf) &&
        (verbForms || !e.word.formOf) &&
        (topic === 'all' || e.word.topic === topic) &&
        (q === '' || e.text.includes(q)),
    );
    return TOPICS.map((t) => ({ topic: t, words: hits.filter((e) => e.word.topic === t).map((e) => e.word) })).filter(
      (g) => g.words.length > 0,
    );
  }, [query, topic, plurals, verbForms]);

  const count = groups.reduce((n, g) => n + g.words.length, 0);

  return (
    <div className="stack">
      <div className="filters">
        <input
          type="search"
          className="input"
          placeholder="Search Maltese, Polish or English"
          aria-label="Search words"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="input" aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="all">All topics</option>
          {topics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <p className="muted">
        {count} {count === 1 ? 'word' : 'words'} · progress shown for {DIRECTION_LABEL[dir]}
      </p>

      {groups.map((g) => (
        <section key={g.topic}>
          <h2 className="eyebrow">{g.topic}</h2>
          <ul className="wordlist">
            {g.words.map((w) => {
              const box = data.cards[cardKey(dir, w.id)]?.box ?? 0;
              return (
                <li key={w.id}>
                  <div className="wordlist-text">
                    <span>
                      <span className="wordlist-mt" lang="mt">
                        {w.mt}
                      </span>
                      {w.pluralOf && <span className="tag">plural</span>}
                      {w.formOf && (
                        <span className="tag tag-form">
                          form of <span lang="mt">{w.formOf}</span>
                        </span>
                      )}
                    </span>
                    <span className="wordlist-tr">
                      <span lang="pl">{w.pl}</span> · <span lang="en">{w.en}</span>
                    </span>
                  </div>
                  <span className={`badge badge-${box === 0 ? 'new' : box >= 3 ? 'known' : 'learning'}`}>{boxLabel(box)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {count === 0 && <p className="empty">No words match that search.</p>}
    </div>
  );
}
