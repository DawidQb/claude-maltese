# True or sting — description and implementation plan

This is a brief for a session that will implement the game. It is self-contained: read it,
then read the files named under "Where things are", and start.

## Scope

One new game: a Maltese word and a meaning are shown together, and the player says whether they
belong together. Thirty seconds, one thumb.

| Step | Change | One line |
|------|--------|----------|
| a | Rules | `src/lib/guard.ts`: true or false, where a false meaning comes from, the time a mistake costs. |
| b | Playable game | Timer, the visitor's card, two buttons, swipe and arrow keys, best score. |
| c | Feedback | The card flying off, the correction, sound. |
| d | Texts | The Games card and the README. |

Not in scope: canvas art, lives, a per-topic best, changes to the review schedule. Do not add them.

## Ground rules that must survive

- **Games never change the review schedule.** Nothing here calls `recordAnswer` or touches `data.cards`.
- **The header shows right and wrong counts** (`Tally` in `GameShell.tsx`) and nothing else.
- **Rules live in `src/lib/` as pure functions on plain data**, tested without a screen. Every
  tuning number is a named constant in the rules file.
- A game reads its settings once, when it opens.
- Colours come from the CSS variables; light and dark must both look right. Honour
  `prefers-reduced-motion`; sound and vibration obey `settings.sound`.

## Where things are

- `src/components/games/SpeedRound.tsx` — the game to copy from: ready card, the 60-second
  clock (`endAt`, the `honey-timer` row of cells), the pause after an answer, the summary and
  `speedBest`.
- `src/lib/games.ts` — `WordStream`, `shuffle`, `Rng`.
- `src/lib/letters.ts` — `similarity(a, b)` between two Maltese words.
- `src/lib/words.ts` — `Word` with `plural`, `pluralOf`, `formOf`; `wordsInTopic`.
- `src/lib/hive.ts` — `hornetSecond` finds a word's plural in a pool; `clash(a, b)` tells
  whether two words share any text.
- `src/components/Cards.tsx` — `TranslationLines` for the meaning.
- `src/components/games/GameShell.tsx` — `GameShell`, `Tally`, `MistakesList`, `SpeakerIcon`.
- `src/lib/store.ts`, `src/lib/merge.ts` — `games` records and how two copies merge.
- `src/components/Games.tsx`, `src/App.tsx` — the list of games and the route per `GameId`.

## For the player

You are the guard at the door of the hive. Visitors arrive one at a time, each carrying a
Maltese word and what it says the word means: *ħobż* = chleb / bread. If that is true, let it
in: the right-hand button, a swipe to the right, or →. If it is false, sting it: the left-hand
button, a swipe to the left, or ←. A wrong call shows what the word really means and costs two
seconds. The round lasts thirty seconds and the score is the number of right calls.

## Rules

**Truth.** Each visitor is honest with probability one half, except that the same kind never
comes more than `MAX_SAME = 3` times in a row: after three honest visitors the next is an
impostor, and the other way round.

**A false meaning** is the meaning of another word. Which word depends on the run of right calls:

| Run | The other word |
|-----|----------------|
| 0–3 | Any word from the same topic. |
| 4–7 | One of the four words in the topic that look most like it (`similarity` on the Maltese): *ħobż* = ryba / fish, from *ħut*. |
| 8+  | Half of the time a relative, when the pool holds one: the plural for a singular and the other way round (*kotba* = książka / book), another form of the same verb for a verb form (*kilna* = jedli / they ate), a form for its verb. Otherwise as in the row above. |

No Maltese word or translation appears twice in the deck, so the meaning of another word is
always false. A wrong call resets the run, so the hardest row is only ever reached by someone
who is getting them right.

**Time.** `ROUND_MS = 30 000`. After a right call the next visitor comes in `AFTER_RIGHT_MS = 200`.
After a wrong call the correction stays for `AFTER_WRONG_MS = 1200`, during which the clock keeps
running, and `PENALTY_MS = 2000` more is taken off the clock. So tapping at random scores well
under half of what careful play does; keep it that way if the numbers change.

**Words.** The words of the chosen topic, with the Settings switches for plurals and verb forms.
Fewer than `MIN_POOL = 8`: the whole deck. Words come from a `WordStream`; a word called wrongly
is queued with `repeatLater`.

**Mistakes.** A false meaning let in is recorded with the word it came from (the list shows it
as "you chose …"). An honest visitor stung is recorded with no chosen word ("you stung an
honest bee").

## a — Rules: `src/lib/guard.ts` and `src/lib/guard.test.ts`

Pure functions, no DOM. Names may change, the behaviour may not:

- Constants: `ROUND_MS`, `AFTER_RIGHT_MS`, `AFTER_WRONG_MS`, `PENALTY_MS`, `MAX_SAME`,
  `MIN_POOL`, `LEVELS = { lookalikes: 4, relatives: 8 }`.
- `interface Visitor { word: Word; claim: Word; honest: boolean }` — `claim` is `word` itself for
  an honest visitor.
- `nextHonest(history, rng) → boolean` — `history` is the truth of the visitors so far.
- `relatives(word, pool) → Word[]` — plural or singular, sibling forms, the verb of a form, the
  forms of a verb.
- `impostorFor(word, pool, run, rng) → Word` — the table above; never `word` itself.
- `makeVisitor(word, pool, run, history, rng) → Visitor`.
- `judge(visitor, letIn) → boolean` — whether the call was right.
- `guardPool(inTopic, all) → Word[]`.

**Tests.** `nextHonest`, over many seeded runs: about half honest, never four the same in a row.
`relatives`: a singular gives its plural, a plural its singular, a verb form its siblings and
its verb, a plain word nothing; relatives missing from the pool are left out. `impostorFor`:
never the word itself; at run 0 from the same topic when the topic has another word; at run 4
among the four most similar in the topic; at run 8 a relative roughly half of the time for a
word that has one, and never for a word that has none; with a one-word topic it falls back to
the rest of the pool. `judge`: all four combinations. A check on the constants: guessing takes
`AFTER_RIGHT_MS + AFTER_WRONG_MS + PENALTY_MS` per right call, which must be more than twice
`1200 + AFTER_RIGHT_MS`, a careful call.

## b — The playable game

- `src/components/games/TrueOrSting.tsx`. Add `'sting'` to `GameId`, a card in `Games.tsx`
  before Speed round ("A word and a meaning. Let it in if they match, sting it if they don't.
  30 seconds.", detail `best N` when there is one, otherwise `Direction does not apply`), and
  the route in `App.tsx` with `update`.
- Structure, phases (`ready`, `playing`, `over`), the clock and the best score follow
  `SpeedRound.tsx` line for line where they can. The penalty is `endAt.current -= PENALTY_MS`.
- **Layout**, top to bottom: the timer (the `honey-timer` cells, twelve of 2.5 s each), the
  visitor's card, the two buttons.
- **Card.** `.card.card-quiz.comb-bg` holding the Maltese word (`.word-mt`, `lang="mt"`), an
  equals sign, and `TranslationLines` for the claim, large. With `show: both` the claim has two
  lines, both from the same word.
- **Buttons.** Two, side by side, filling the width, at least 72 px tall, at the bottom where a
  thumb reaches: "✗ Sting" on the left in `--no`, "✓ Let in" on the right in `--known`. Each has
  the full sentence as `aria-label` ("Sting: the meaning is wrong").
- **Swipe.** Pointer events on the card with `touch-action: pan-y`: the card follows the finger
  and tilts up to 12°; released beyond `SWIPE_PX = 72` it counts as that side's button, otherwise
  it springs back. A tap on the card does nothing.
- **Keys.** ← stings, → lets in.
- **Best score.** `store.ts`: add `stingBest: number` to `games` (`emptyData`, `sanitize`);
  `merge.ts`: the larger wins. Saved when the clock runs out, shown on the ready card, the
  summary and the Games card.
- **Summary.** Right calls as the big number, "in 30 seconds, N wrong", the best line,
  `MistakesList` with `dir="mt2x"` and `missedText` "you stung an honest bee" (for a false
  meaning let in, `chosen` is the claim's word), Play again, Done.
- In dev builds expose `window.__sting.state`: phase, the word id, the claim id, `honest`, the
  run, milliseconds left.

**Tests.** `store.test.ts`: `sanitize` keeps a saved `stingBest`, gives 0 when missing or
malformed. `merge.test.ts`: the larger `stingBest` wins.

**Done when.** A round can be played with buttons, swipes and keys; a wrong call takes two
seconds off the clock; the best score is kept.

## c — Feedback

- **Right call.** Let in: the card slides down and shrinks into the bottom edge. Stung: it flips
  to `--no` and flies off to the left. Both in under 200 ms, so they never slow the next card.
  Sound `'pollen'` for a let-in, `'laser'` for a sting, pitched up with the run as Protect the
  hive pitches its laser.
- **Wrong call.** The card stays. The claim is struck through and the real meaning appears under
  it in `--known`; for an honest visitor that was stung, the claim turns `--known` with "this was
  true". The lost timer cells empty at once with a `--no` flash. Sound `'wrong'`, a short vibration.
- **Reduced motion.** No slide, tilt or flight: the next card simply replaces the last, and the
  swipe still works without the card following the finger.

**Done when.** A fast player is never waiting for an animation, and the correction can be read
in the time it stays.

## d — Texts

- `README.md`: raise the count of practice games by one and describe the game in the same
  sentence style.

## Order, commits, checks

One commit per step, a to d, each leaving `npm test` and `npm run build` green.

1. `npm test` and `npm run build`.
2. Play it automatically: `npm run dev`, Playwright at 390×844. From `window.__sting.state`
   press the right button for each visitor: the right count rises and after eight in a row some
   claims are relatives of the word. Press the wrong button once: the wrong count rises, the
   milliseconds left drop by about 3200 across the correction, the run is back at 0. Let the
   clock run out and check the best score on the Games card. Repeat one round with swipes
   (`mouse.down`, `move`, `up`) and one with the arrow keys.
3. Screenshots in light and dark, at 390×844 and about 390×560, with `show` set to `pl`, `en`
   and `both` and the longest translations in the deck (36 characters): the claim wraps inside
   the card and the buttons stay on screen.

## Decisions taken here, easy to change

- Thirty seconds. Speed round has sixty; this one is meant to be shorter than a tram stop.
- A mistake costs time, not points. The alternative is a score of right minus wrong, which the
  header would then have to explain.
- Half of the visitors are honest. More impostors would make "sting" the safe guess.
- One best score for all topics and settings, as in the other games.
- Direction does not apply: both sides are on the card. The word is always Maltese on top.
- Relatives as impostors start only at a run of eight, because *kotba* = book is a trap even for
  someone who knows the word.
