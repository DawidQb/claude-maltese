import { useState } from 'react';
import { WordStream } from '../../lib/games';
import type { Grade } from '../../lib/srs';
import type { AppData } from '../../lib/store';
import { wordsInTopic } from '../../lib/words';
import { TileCard } from '../Cards';
import { GameShell, Tally } from './GameShell';

/** An endless, random stream of words to type in Maltese. Practice only: nothing is scheduled. */
export function InfiniteTyping({ data, onExit }: { data: AppData; onExit: () => void }) {
  const [{ topic, show, autoCheck }] = useState(data.settings);
  const [stream] = useState(() => new WordStream(wordsInTopic(topic, data.settings)));
  const [word, setWord] = useState(() => stream.next());
  const [turn, setTurn] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);

  const onGrade = (grade: Grade) => {
    if (grade === 'knew') {
      setCorrect((n) => n + 1);
    } else {
      // "Almost" counts as a fail here: the word was not typed correctly.
      setWrong((n) => n + 1);
      stream.repeatLater(word);
    }
    setWord(stream.next());
    setTurn((n) => n + 1);
  };

  return (
    <GameShell title="Infinite typing" status={<Tally ok={correct} bad={wrong} />} onExit={onExit}>
      <TileCard key={turn} word={word} show={show} autoCheck={autoCheck} onGrade={onGrade} tapToContinue comb />
    </GameShell>
  );
}
