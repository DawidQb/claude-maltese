import { useState } from 'react';
import { WordStream } from '../../lib/games';
import type { Grade } from '../../lib/srs';
import type { AppData } from '../../lib/store';
import { wordsInTopic } from '../../lib/words';
import { TypeCard } from '../Cards';
import { GameShell } from './GameShell';

/** An endless, random stream of words to type in Maltese. Practice only: nothing is scheduled. */
export function InfiniteTyping({ data, onExit }: { data: AppData; onExit: () => void }) {
  const [{ topic, show }] = useState(data.settings);
  const [stream] = useState(() => new WordStream(wordsInTopic(topic)));
  const [word, setWord] = useState(() => stream.next());
  const [turn, setTurn] = useState(0);
  // Only ever goes up: a count of what went well, not a streak to protect.
  const [correct, setCorrect] = useState(0);

  const onGrade = (grade: Grade) => {
    if (grade === 'knew') setCorrect((n) => n + 1);
    else stream.repeatSoon(word);
    setWord(stream.next());
    setTurn((n) => n + 1);
  };

  return (
    <GameShell title="Infinite typing" status={correct > 0 ? `${correct} correct` : ''} onExit={onExit}>
      <TypeCard key={turn} word={word} show={show} onGrade={onGrade} />
    </GameShell>
  );
}
