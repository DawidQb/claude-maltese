# Game direction picker and Protect the hive — description and implementation plan

This is a brief for a session that will implement the changes. It is self-contained: read it,
then read the files named under "Where things are", and start.

## Scope

Two changes, in this order. Part 2 builds on Part 1.

| Part | Change | One line |
|------|--------|----------|
| 1 | Game direction picker | A language-direction switch at the top of the Games tab, separate from the Study direction. Speed round and Busy bee follow it. |
| 2 | Protect the hive | A new game: words creep down towards the hive, and the bee zaps a word with its laser eyes when the player taps the word and its translation. |

Not in scope: changes to the review schedule, a per-direction best score, syncing settings,
a pause button, new word data. Do not add them.

## Ground rules that must survive

- **Games never change the review schedule.** Nothing here calls `recordAnswer` or touches `data.cards`.
- **The header shows right and wrong counts** (`Tally` in `GameShell.tsx`). Protect the hive adds
  the honey left and the wave number beside it; nothing else.
- **Rules live in `src/lib/` as pure functions on plain data**, tested without a screen. The
  component only draws and wires input. Every tuning number is a named constant in the rules file.
- A game reads its settings once, when it opens (`const [{ topic, show }] = useState(data.settings)`),
  so a change made elsewhere never alters a round in progress.
- Colours come from the CSS variables in `src/styles.css`; everything must look right in light and dark.
- Honour `prefers-reduced-motion`: no shake, particles or sliding when it is set.
- Sound and vibration obey `settings.sound`, as in Busy bee.

## Where things are

- `src/components/Games.tsx` — the Games tab: topic select and the list of game cards.
- `src/components/Home.tsx` — the Study tab; holds `DIRECTION_LABEL`, `TopicOptions` and the
  direction switch (a `.segmented` group, lines 50–61).
- `src/lib/store.ts` — `Settings`, `AppData`, `emptyData`, `sanitize`. `src/lib/merge.ts` — how two
  copies of progress merge (`games.speedBest` takes the larger).
- `src/components/games/SpeedRound.tsx` — the simplest game to copy from: ready card, playing, summary, best score.
- `src/components/games/MatchPairs.tsx` — `pick()` is the "tap one of each side" logic to model on.
- `src/components/games/BusyBee.tsx` — `BeeField` (canvas, game loop, particles, sound, reduced
  motion, `window.__bee` for automated checks) and `BusyBee` (round state, mistakes list, sound toggle).
- `src/lib/bounce.ts` — Busy bee rules; `doorLabel` (answer-side lines), `promptLabel`
  (question-side lines) and `beeWords` (length filter) take a direction.
- `src/lib/games.ts` — `WordStream` (endless words, `repeatLater` for missed ones), `makeQuestion`,
  `takeDistinct` (private today), `shuffle`.
- `src/lib/letters.ts` — `similarity(a, b)` between two Maltese words, for look-alike decoys.
- `src/lib/sound.ts` — `wakeSound`, `playSound` and the `Sound` names.
- `src/components/Cards.tsx` — `Face` and `TranslationLines`, which render a word's sides.
- `src/App.tsx` — maps a `GameId` to its component.

`Direction` is `'mt2x'` (Maltese → Polish/English) or `'x2mt'` (Polish/English → Maltese).

---

# Part 1 — Game direction picker

**For the player.** The Games tab gets a Direction switch above Topic, the same two-button
control as on the Study tab. It belongs to the games only: changing it does not change the Study
direction, and the Study direction no longer affects any game.

**Why separate.** Study progress is counted per direction, so a switch flipped for a game must not
silently change what the Study tab shows and schedules.

## 1a — The setting, the switch, Speed round

- `store.ts`: add `gameDirection: Direction` to `Settings`. Default `'x2mt'` in `emptyData`.
  In `sanitize`: `s.gameDirection === 'mt2x' ? 'mt2x' : 'x2mt'`.
- `Home.tsx`: pull the direction switch out into an exported `DirectionPicker({ id, value, onChange })`
  and use it on the Study tab unchanged in look and behaviour.
- `Games.tsx`: a "Direction" section with `DirectionPicker` above the Topic section, writing
  `settings.gameDirection`.
- `SpeedRound.tsx`: read `gameDirection` instead of `direction`; fix the doc comment.
- Game cards (`Games.tsx`): drop the direction from the Busy bee and Speed round details (the
  switch above says it); Speed round keeps `best N`. Infinite typing gets the detail
  `Always Polish / English → Maltese`; Match pairs gets `Direction does not apply`.

**Tests (`store.test.ts`).** `sanitize` keeps `gameDirection: 'mt2x'`, and gives `'x2mt'` when it
is missing or malformed. Update the existing `toEqual` checks on settings for the new key.

**Done when.** Flipping the switch on the Games tab changes Speed round's question side and
leaves the Study tab's direction and counts untouched, and the other way round.

## 1b — Busy bee both ways

Busy bee is fixed to `'x2mt'` at `BusyBee.tsx:807`. `BeeField`, `doorLabel`, `promptLabel`,
`beeWords` and `drawLabel` already take a direction, so most of the work is the places that
assume the doors carry Maltese:

- `BusyBee.tsx:805–807`: read `gameDirection` from the settings captured at mount; delete the comment.
- `BusyBee.tsx:327`: the text that floats up after a right answer is `✓ ` plus the Maltese word.
  Float what was on the door instead: the first line of `doorLabel(answer, dir, show)`, with the
  Maltese font only when `dir === 'x2mt'`.
- `BusyBee.tsx:880–900`, the mistakes list: it shows the translation as the question and Maltese
  words as the answers. Make it follow the direction: the asked side from `promptLabel`, the right
  and the chosen answers from `doorLabel`, `lang="mt"` on whichever side is Maltese.
  Move this list into a small shared component (in `GameShell.tsx`) taking
  `{ mistakes, dir, show, missedText }`, because Protect the hive shows the same list.
- Look-alike wrong answers keep comparing Maltese words (`similarity(w.mt, answer.mt)`) in both
  directions: in `mt2x` the doors then carry the translations of words that look like the one asked.
- `Games.tsx`: the Busy bee text says "the door with the right Maltese word"; make it "the door
  with the right answer". Add `dir` to `window.__bee.state`.
- With `mt2x` and both languages shown a door label has two lines. Check by screenshot that it
  fits a door at every difficulty level (two doors, narrow doors, three doors).

**Tests.** `bounce.test.ts` already covers `beeWords` for both directions. Add one for the
mistakes component's text in each direction only if it ends up with logic worth testing.

**Done when.** Busy bee plays in both directions with readable prompts, door labels, floating
answers and mistakes list, and `x2mt` looks exactly as it does today.

**Commits.** One for 1a, one for 1b.

---

# Part 2 — Protect the hive

## For the player

The hive sits at the bottom of the field with the bee hovering in front of it. Words appear at
the top and creep down towards it. Under the field is a tray of answers. Tap a word and its
answer, in either order, and the bee fires its laser eyes and the word is gone. A wrong pair
makes every word lurch closer. A word that reaches the hive costs one of three cells of honey
and shows what it meant. Words come in waves; each wave brings more of them. The run ends when
the honey is gone, and the number of words shot down is the score.

In `mt2x` the creeping words are Maltese and the tray holds translations; in `x2mt` it is the
other way round. The direction is the one chosen on the Games tab (Part 1).

## Rules

**Field.** Words ("invaders") move straight down in lanes: 2 lanes, or 3 when the field is at
least 560 px wide. Position is `y` from 0 (just above the top edge, out of sight) to 1 (the
word's bottom edge touches the hive). All invaders in a wave move at the same speed, so they
never catch each other up.

**Waves.** A wave is a fixed number of words. They enter one at a time, `gap` apart, never more
than `onScreen` at once, and never into a lane whose last word is still too close to the top. If
the field is empty the next word enters after `QUICK_SPAWN_MS = 600`, so a fast player is not
kept waiting. The wave ends when all its words are shot or have landed; then a "Wave N" banner
shows for `WAVE_PAUSE_MS = 1200` and the next begins.

| Wave | Words | On screen at most | Top-to-hive time | Gap between words | Tray | Decoys |
|------|-------|-------------------|------------------|-------------------|------|--------|
| 1    | 5     | 2                 | 20 s             | 5 s               | 4    | same topic, random |
| 2    | 6     | 3                 | 20 s             | 4 s               | 4    | same topic, random |
| 3–4  | 8     | 3                 | 18 s             | 3.5 s             | 6    | look-alikes |
| 5–6  | 10    | 4                 | 16 s             | 3 s               | 6    | look-alikes |
| 7+   | 12    | 4                 | 14 s             | 2.5 s             | 6    | look-alikes |

Difficulty grows by the number of words, not by speed: the top-to-hive time never drops below
14 s, so a word can always be read.

**Tray.** A fixed grid of answer chips (two columns). It always holds the answer to every word on
the field, plus decoys to fill it. A chip keeps its slot for as long as it is there, so chips do
not jump around under the finger. When a word enters, its answer takes an empty slot or replaces
a random decoy. When a word is shot or lands, its chip is replaced by a new decoy. The tray is
rebuilt from scratch at the start of each wave. A decoy never shares its Maltese, Polish or
English text with a word on the field or with another chip, so every word has exactly one answer.

**Pairing.** As in Match pairs: tap one word and one chip, in either order; tapping another on the
same side moves the choice, tapping the chosen one again clears it. When both are chosen:

- They match: the word is destroyed, right +1, the run of hits +1.
- They do not: wrong +1, the run resets, both flash red for 600 ms, and every word on the field
  moves down by `SURGE = 0.06`. The word stays and can be tried again. The mistake is recorded
  (word asked, chip chosen) for the summary.

**Landing.** A word at `y >= 1` has reached the hive: honey −1, wrong +1, the run resets, the word
is queued with `stream.repeatLater`, and the field freezes for `REVEAL_MS = 1400` while an
overlay shows the word and its meaning (as Busy bee does after a wrong door). The mistake is
recorded with no chosen answer ("reached the hive").

**Honey.** `HONEY = 3` cells. A wave in which no word landed gives one cell back, up to 3.
At 0 the run is over.

**Words.** The words of the chosen topic that are short enough for both sides: question-side lines
up to 18 characters, answer-side lines up to 20. If fewer than 12 are left, use the whole deck
(as Busy bee does). Words come from a `WordStream`; a word that is already on the field is skipped.

**Score.** Words shot down in the run. The best is saved (see 2d).

## 2a — Rules: `src/lib/hive.ts` and `src/lib/hive.test.ts`

Pure functions, no DOM. Suggested shape; names may change, the behaviour may not:

- Constants: `HONEY`, `SURGE`, `REVEAL_MS`, `WAVE_PAUSE_MS`, `QUICK_SPAWN_MS`, `MIN_POOL`,
  `MAX_QUESTION`, `MAX_ANSWER`, and the wave table.
- `interface Invader { id: number; word: Word; lane: number; y: number }`
- `waveSpec(wave) → { words, onScreen, crossMs, gapMs, tray, lookalikes }`.
- `hiveWords(words, dir, show) → Word[]`, built on `promptLabel` / `doorLabel` from `bounce.ts`.
- `advance(invaders, dtMs, crossMs) → landed: Invader[]` — moves every `y` by `dtMs / crossMs`
  and returns (and removes) those at 1 or beyond.
- `surge(invaders)` — every `y` up by `SURGE`; anything pushed past 1 lands on the next `advance`.
- `spawnDue(spec, invaders, toSpawn, sinceSpawnMs) → boolean` — the wave rules above.
- `pickLane(lanes, invaders, clear, rng) → number | null` — a lane whose highest word is at
  `y >= clear`, preferring the emptiest; `null` when none is free (the spawn waits). The
  component passes `clear` as (tallest invader height + 12 px) / fall height.
- `fillTray(tray, invaders, pool, size, rng, prefer?) → Word[]` — `tray` is `(Word | null)[]`
  with `null` for emptied slots. Keeps valid chips in place, puts each missing answer into an
  empty slot or over a random decoy, fills what is left with decoys from the invaders' topics
  first. `prefer` scores candidates as in `makeQuestion` (take the best few, shuffled). If a
  word entering the field is already in the tray as a decoy, that chip simply becomes its answer.
  Export `takeDistinct` from `games.ts` for this.
- `honeyAfterWave(honey, landedThisWave) → number`.

**Tests.** `waveSpec` at each row of the table and far beyond it (wave 50 is still the last row,
never under 14 s). `hiveWords` drops long words in both directions and for `pl`, `en`, `both`.
`advance` moves by the right amount and reports each landing once. `surge` keeps the spacing
between words. `spawnDue`: respects `onScreen`, the gap, the quick spawn on an empty field, and
stops at the wave's count. `pickLane`: never a lane with a word near the top, `null` when all are
blocked. `fillTray`, over many seeded runs: always exactly `size` chips; the answer to every
invader present exactly once; no two chips sharing Maltese, Polish or English; untouched chips
keep their slots; growing from 4 to 6 works. `honeyAfterWave` caps at 3.

## 2b — The playable game (plain look)

No bee or lasers yet: get the rules, layout and input right first.

- `src/components/games/ProtectHive.tsx`, in two parts like Busy bee: `HiveField` (field, tray,
  loop, input; one run per mount) and `ProtectHive` (ready card, tally, summary, play again).
- Add `'hive'` to `GameId`, a card in `Games.tsx` right after Busy bee ("Words creep towards the
  hive. Tap a word and its answer to zap it before it gets there."), and the route in `App.tsx`
  (it needs `update`, for the sound toggle and the best score).
- **Layout**, top to bottom inside `GameShell`: the field (`flex: 1`), the tray, a foot with a
  hint, the sound toggle and Finish (reuse Busy bee's foot). The bottom strip of the field
  (about 96 px, 72 on short screens) is the hive; words stop at its top edge.
- **Invaders and chips are real `<button>`s**, not canvas text: they wrap, take `lang="mt"`, and are
  reachable by keyboard and screen reader. Render the question side and the answer side the way
  `SpeedRound` renders its prompt and options (`tile-mt` span or `TranslationLines`). Give each
  `data-word` with the word id, and `aria-pressed` when chosen.
- **Loop.** One `requestAnimationFrame` loop holding the rules state in refs. Each frame it calls
  `advance` and writes each invader's position straight to its element
  (`style.transform = translate(-50%, …px)`). React state changes only on events: spawn, hit,
  landing, a change of choice, wave change. Cap `dt` and stop the clock while the tab is hidden,
  as `BeeField` does.
- **Phases.** `ready` (card with one sentence of instructions, the direction, the best score and
  Start, which also calls `wakeSound`), `playing`, `reveal` (frozen, overlay), `between` (wave
  banner), `over` (summary). Input is ignored outside `playing`.
- **Header.** `Tally`, then honey as three small cells (filled or empty, with an `aria-label`
  such as "2 honey left"), then "Wave 3".
- **Summary.** Words shot down as the big number, the wave reached, right and wrong, the best
  score line as in Speed round, the shared mistakes list from 1b (with "reached the hive" for a
  landing), Play again and Done. Finish in the foot ends the run early and shows the same card.
- **Short screens.** Below about 640 px of height cap the tray at 4 chips so the field keeps at
  least 180 px of fall height.
- In dev builds expose `window.__hive.state`: phase, wave, honey, run, the invaders
  (id, word id, lane, y), the tray's word ids and the current choice.

**Done when.** A whole run can be played by tapping: waves advance, wrong pairs surge the field,
landings cost honey and show the meaning, the run ends at no honey, in both directions.

## 2c — The bee, lasers and feedback

- **One canvas under the buttons** (`pointer-events: none` on it is not needed if it sits behind
  them) draws the hive strip as honeycomb with the honey cells, the bee, beams and particles.
  Read colours as `readColors()` does in `BusyBee.tsx`, and redraw on a colour-scheme change.
- **The bee** hovers inside the hive strip, in the middle, so words never cover it. Lift
  `drawBee` out of `BusyBee.tsx:494` into a shared module both games use (no change to how Busy
  bee looks). It bobs gently and turns to face the chosen word, or the lowest one when none is chosen.
- **Laser.** On a hit, two thin beams from the bee's eyes to the centre of the word: a `--no`
  core with a wider translucent `--accent` glow, visible about 180 ms. The word's button then
  bursts into `--accent` particles and is removed; its chip flashes `--known`. The hit counts at
  the tap; beam and burst are decoration that follows.
- **Run of hits.** From a run of 3 the beam is thicker; from 6 thicker still and the zap is
  pitched higher. The run is never shown as a number.
- **Wrong pair.** The two buttons flash `--no`, the field shakes once, the words slide down by the
  surge over about 250 ms rather than jumping.
- **Landing.** The lost honey cell empties with a `--no` puff; the reveal overlay follows.
- **Wave cleared without a landing.** The cell that comes back fills with a short glow.
- **Sound** (`sound.ts`): add `'laser'` (a quick falling zap, e.g. sawtooth 1800 → 300 Hz over
  0.12 s) and `'wave'` (three rising notes). Reuse `'bump'` for a wrong pair, `'wrong'` for a
  landing, `'pollen'` for honey coming back. Vibrate briefly on a wrong pair and longer on a
  landing, as Busy bee does.
- **Reduced motion.** No shake, no particles, no bobbing, the surge is a jump; keep the beam and
  the flashes.

**Done when.** Shooting a word feels like firing a laser, with sound off the game is silent and
still, and nothing drawn ever sits on top of a word or a chip for more than a moment.

## 2d — Best score, texts

- `store.ts`: `games` becomes `{ speedBest: number; hiveBest: number }` (`emptyData`, `sanitize`).
  `merge.ts`: `hiveBest` takes the larger, like `speedBest`. Save it when the run ends, the way
  `SpeedRound` saves its best. Show it on the game's card (`best N`), the ready card and the summary.
- An older copy of the app on another device drops `hiveBest` when it syncs; the newer one puts
  it back on its next merge. That is acceptable; do not add versioning for it.
- `README.md`: "Four practice games" becomes five; describe Protect the hive in the same
  sentence style; say that Busy bee, Protect the hive and Speed round follow the direction
  chosen on the Games tab.

**Tests.** `store.test.ts`: `sanitize` keeps a saved `hiveBest`, gives 0 when missing or
malformed. `merge.test.ts`: the larger `hiveBest` wins.

## 2e — The hornet (last, and optional)

**For the player.** The last word of every third wave is carried by a hornet: larger, slower, and
it takes two hits. After the first it shows a second word.

**Rules.** Top-to-hive time ×1.5 (it is the last of its wave, so nothing is behind it to catch
up). The second word is the plural of the first when the first has one and it is in the pool,
otherwise the next word from the stream. It keeps its place on the field between the two hits.
Reaching the hive costs one honey, as any word does. Each hit counts as a right answer.

**Judge it by playing.** If it adds confusion rather than a climax, leave it out; 2a–2d stand without it.

---

## Order, commits, checks

One commit per step, in the order 1a, 1b, 2a, 2b, 2c, 2d, (2e), each leaving `npm test` and
`npm run build` green.

**Verification after each step.**
1. `npm test` and `npm run build`.
2. Play it automatically: `npm run dev`, open the app with Playwright at 390×844.
   - Part 1: flip the Games direction, start Speed round and Busy bee, and check the prompt and
     the answers are in the expected languages; check the Study tab's direction did not move.
     Fly Busy bee from `window.__bee.state` as described in `docs/busy-bee-plan.md`.
   - Part 2: from `window.__hive.state`, for each invader click the button with its `data-word`
     in the field and the one in the tray. Check: right count and score rise and waves advance;
     a deliberate wrong pair raises the wrong count and moves every `y` up by the surge; leaving
     a word alone costs one honey and shows the reveal; three landings end the run; a clean wave
     gives a cell back; the tray never holds two chips for one word. Run it in both directions
     and with `show` set to `pl`, `en` and `both`.
3. Screenshots in light and dark, at 390×844 and at a short height (about 390×560), in both
   directions with both languages shown: the longest words fit their lane, chips do not overflow,
   the bee is never covered.

## Decisions taken here, easy to change

- Game direction defaults to Polish/English → Maltese. Busy bee therefore starts as it is today;
  Speed round changes for anyone whose Study direction is Maltese → Polish/English.
- One best score per game, not per direction, although Maltese → Polish/English is the easier way.
- Two taps per shot (word and answer). The alternative is auto-aim at the lowest word, so that
  one tap on a chip fires; it is faster but takes away the choice of which word to deal with.
- A wrong pair surges every word. The alternative is a cost in honey.
- Three cells of honey, one back per clean wave. Change `HONEY` or drop the refill in `honeyAfterWave`.
- The score is words shot down, not waves survived.
