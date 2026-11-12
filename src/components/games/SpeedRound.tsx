import { useCallback, useEffect, useRef, useState } from 'react';
import { makeQuestion, WordStream, type Question } from '../../lib/games';
import type { AppData, Update } from '../../lib/store';
import { wordsInTopic } from '../../lib/words';
import { Face, TranslationLines } from '../Cards';
import { DIRECTION_LABEL } from '../Home';
import { GameShell, Tally } from './GameShell';

const ROUND_MS = 60_000;
const AFTER_CORRECT_MS = 250;
const AFTER_WRONG_MS = 900;

type Phase = 'ready' | 'playing' | 'over';

/** 60 seconds of four-choice questions, in the direction chosen on the Study tab. */
export function SpeedRound({ data, update, onExit }: { data: AppData; update: Update; onExit: () => void }) {
  const [{ topic, show, direction: dir }] = useState(data.settings);
  const [words] = useState(() => wordsInTopic(topic));
  const [stream] = useState(() => new WordStream(words));
  const [phase, setPhase] = useState<Phase>('ready');
  const [question, setQuestion] = useState<Question | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [remaining, setRemaining] = useState(ROUND_MS);
  // The record to beat, fixed when the round starts.
  const [bestBefore, setBestBefore] = useState(data.games.speedBest);

  const endAt = useRef(0);
  const scoreRef = useRef(0);
  const nextTimer = useRef<number | undefined>(undefined);

  const ask = useCallback(() => {
    setChosen(null);
    setQuestion(makeQuestion(words, stream.next()));
  }, [words, stream]);

  const start = () => {
    scoreRef.current = 0;
    setScore(0);
    setWrong(0);
    setBestBefore(data.games.speedBest);
    endAt.current = Date.now() + ROUND_MS;
    setRemaining(ROUND_MS);
    setPhase('playing');
    ask();
  };

  useEffect(() => {
    if (phase !== 'playing') return;
    const tick = window.setInterval(() => {
      const left = endAt.current - Date.now();
      if (left > 0) {
        setRemaining(left);
        return;
      }
      window.clearTimeout(nextTimer.current);
      setRemaining(0);
      setPhase('over');
      const final = scoreRef.current;
      update((d) => (final > d.games.speedBest ? { ...d, games: { ...d.games, speedBest: final } } : d));
    }, 100);
    return () => window.clearInterval(tick);
  }, [phase, update]);

  useEffect(() => () => window.clearTimeout(nextTimer.current), []);

  const choose = (id: string) => {
    if (phase !== 'playing' || chosen !== null || !question) return;
    setChosen(id);
    const right = id === question.answer.id;
    if (right) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
    } else {
      setWrong((n) => n + 1);
    }
    nextTimer.current = window.setTimeout(ask, right ? AFTER_CORRECT_MS : AFTER_WRONG_MS);
  };

  const seconds = Math.ceil(remaining / 1000);

  return (
    <GameShell title="Speed round" status={phase === 'playing' ? <Tally ok={score} bad={wrong} /> : ''} onExit={onExit}>
      {phase === 'playing' && question && (
        <>
          <div className="timer">
            <div className="progress" role="timer" aria-label={`${seconds} seconds left`}>
              <span style={{ width: `${(remaining / ROUND_MS) * 100}%` }} />
            </div>
            <span className="timer-num">{seconds}s</span>
          </div>

          <div className="card card-quiz" key={question.answer.id}>
            <Face word={question.answer} side={dir === 'mt2x' ? 'mt' : 'x'} show={show} />
          </div>

          <div className="options">
            {question.options.map((w) => {
              const state =
                chosen === null ? '' : w.id === question.answer.id ? 'is-right' : w.id === chosen ? 'is-wrong' : 'is-dim';
              return (
                <button key={w.id} className={`tile-btn option ${state}`} onClick={() => choose(w.id)}>
                  {dir === 'mt2x' ? (
                    <TranslationLines word={w} show={show} />
                  ) : (
                    <span className="tile-mt" lang="mt">
                      {w.mt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {phase === 'ready' && (
        <div className="card card-done">
          <p className="done-title">60 seconds</p>
          <p className="done-text">Pick the right answer out of four, as many times as you can.</p>
          <p className="muted">{DIRECTION_LABEL[dir]}</p>
          {data.games.speedBest > 0 && <p className="muted">Your best: {data.games.speedBest}</p>}
          <div className="done-actions">
            <button className="btn btn-primary btn-wide" onClick={start} autoFocus>
              Start
            </button>
          </div>
        </div>
      )}

      {phase === 'over' && (
        <div className="card card-done" role="status">
          <p className="done-title">{score}</p>
          <p className="done-text">
            {score === 1 ? 'right answer' : 'right answers'} in 60 seconds, {wrong} wrong
          </p>
          <p className="muted">
            {score > bestBefore && bestBefore > 0
              ? `New best! Before: ${bestBefore}`
              : bestBefore > 0
                ? `Your best: ${Math.max(score, bestBefore)}`
                : ''}
          </p>
          <div className="done-actions">
            <button className="btn btn-secondary btn-wide" onClick={start}>
              Play again
            </button>
            <button className="btn btn-primary btn-wide" onClick={onExit}>
              Done
            </button>
          </div>
        </div>
      )}
    </GameShell>
  );
}
