# Spider web — description and implementation plan

This is a brief for a session that will implement the game. It is self-contained: read it,
then read the files named under "Where things are", and start.

## Scope

One new game: guess the letters of a Maltese word before the spider reaches the bee. It rewards
knowing part of a word, which no other game does: Infinite typing judges the whole spelling at once.

| Step | Change | One line |
|------|--------|----------|
| a | Rules | `src/lib/web.ts`: the word's cells, a guess, the spider's steps. |
| b | Playable game, plain look | Meaning on top, empty cells, the whole alphabet as a comb of keys. |
| c | Web, bee, spider, feedback | Canvas scene, sound, the reveal. |
| d | Texts | The Games card and the README. |

Not in scope: a saved best score, hints, a timer, changes to the review schedule. Do not add them.

## Ground rules that must survive

- **Games never change the review schedule.** Nothing here calls `recordAnswer` or touches `data.cards`.
- **The header shows right and wrong counts** (`Tally` in `GameShell.tsx`) and nothing else.
  Right is a bee freed, wrong is a bee caught. The run of bees freed is internal.
- **Rules live in `src/lib/` as pure functions on plain data**, tested without a screen. Every
  tuning number is a named constant in the rules file.
- Always Polish/English → Maltese, like Infinite typing.
- A game reads its settings once, when it opens.
- Colours come from the CSS variables; light and dark must both look right. Honour
  `prefers-reduced-motion`; sound and vibration obey `settings.sound`.

## Where things are

- `src/lib/letters.ts` — `toKeys(word)` splits a Maltese word into keys ("għ" is one key, the
  punctuation `…?!.,` is dropped), `keyLabel`, the private `LAYOUT` and `DECOYS` lists.
- `src/lib/games.ts` — `WordStream` (`next`, `repeatLater`), `Rng`.
- `src/lib/words.ts` — `wordsInTopic(topic, settings)`, `ALL_TOPICS`.
- `src/components/Cards.tsx` — `Face` (a word's translation side) and `TileCard`, whose pad
  markup (`.keys.keys-pad.keys-comb`, `.key`) this game reuses with more keys.
- `src/components/games/InfiniteTyping.tsx` — the simplest endless game: stream, tally, `GameShell`.
- `src/components/games/ProtectHive.tsx` — canvas set-up, `readColors` on a colour-scheme
  change, reduced motion, the reveal overlay (`.bee-overlay.bee-reveal`), the foot
  (`.bee-foot`: hint, sound toggle, Finish), the summary with `MistakesList`.
- `src/components/games/beeArt.ts` — `readColors`, `drawBee`.
- `src/lib/sound.ts` — `wakeSound`, `playSound`.
- `src/components/Games.tsx`, `src/App.tsx` — the list of games and the route per `GameId`.

## For the player

A bee hangs in a web and a spider waits at the top of its thread. Under the web is what the
word means, and a row of empty cells, one per letter. Below that is the Maltese alphabet as a
comb of keys. Tap a letter: if the word has it, every cell where it stands fills in; if not, the
spider comes one step down the thread. Fill the word and the bee tears free. Six wrong letters
and the spider gets there, and the word is shown. Then the next word.

## Rules

**Keys.** The 29 letters of the pad's alphabet: `LAYOUT` without `à`, `è`, `-`, `'` and the
space (today's private `DECOYS` list; export it as `ALPHABET`). "għ" is one key and one cell:
tapping `g` or `h` does not fill it.

**Cells.** One per key of `toKeys(word.mt)`. A hyphen, an apostrophe and a space are shown from
the start and are never guessed (*il-lejl it-tajjeb* opens as `__-____ __-______`). `à` and `è`
are filled by `a` and `e`. The punctuation `toKeys` drops is not shown until the reveal.

**Guess.** A key can be tapped once; then it is disabled and coloured: `--known` when it was in
the word, `--no` when not. A hit fills every cell with that letter. A miss moves the spider one
step. This is where look-alikes cost something: `h` for a word with `ħ` is a miss.

**Steps.** `STEPS = 6` misses and the bee is caught. From a run of `HARDER.five = 4` bees freed
in a row the spider needs five, from `HARDER.four = 8` four; never fewer. A caught bee resets the run.

**End of a word.** All cells filled: right +1, run +1, the next word after `FREED_MS = 800`.
Spider arrived: wrong +1, run reset, the word is queued with `stream.repeatLater`, the remaining
cells fill in `--no` and an overlay shows the word and its meaning until a tap or `CAUGHT_MS = 2200`.
"Don't know" in the foot does the same at once.

**Words.** The words of the chosen topic with at most `MAX_CELLS = 18` cells, at least
`MIN_LETTERS = 3` of them to be guessed: all but 15 of the 1229 cards in the shipped deck. If fewer than `MIN_POOL = 12` are left, the whole deck.

**The run.** Endless, like Infinite typing; Finish in the foot shows the summary.

## a — Rules: `src/lib/web.ts` and `src/lib/web.test.ts`

Pure functions, no DOM. Names may change, the behaviour may not:

- Constants: `STEPS`, `HARDER`, `MIN_LETTERS`, `MAX_CELLS`, `MIN_POOL`, `FREED_MS`, `CAUGHT_MS`.
- `letters.ts`: export `ALPHABET` (the list `DECOYS` holds today; keep `DECOYS` as a name for it or replace its uses).
- `interface Cell { key: string; given: boolean }` — `key` is what is shown once filled (`à` stays `à`).
- `interface Round { word: Word; cells: Cell[]; guessed: string[]; misses: number; steps: number }`
- `webCells(mt) → Cell[]`, `webWords(words) → Word[]`, `webPool(inTopic, all) → Word[]`.
- `stepsFor(run) → number`, `newRound(word, run) → Round`.
- `guess(round, key) → { round: Round; hit: boolean; state: 'open' | 'freed' | 'caught' }` —
  returns a new round; a key already guessed, or one not in `ALPHABET`, changes nothing.
- `shown(round) → (string | null)[]` — per cell the letter to draw, or `null` while hidden.

**Tests.** `webCells`: *għasfur* is six cells starting with "għ"; *il-lejl it-tajjeb* has the two
hyphens and the space given; *x'jismek?* has the apostrophe given and no cell for "?"; *kafè*
ends in a cell that `e` fills and that shows "è". `guess`: a hit fills every occurrence and adds
no miss; a miss adds one; a repeated key changes nothing; `h` misses on *ħobż* and `ħ` hits; the
last hit gives `freed`, the last miss gives `caught`, and neither can happen after the other.
`stepsFor`: 6, then 5 from a run of 4, 4 from 8, still 4 at 100. `webWords` drops two-letter
words and *titkellem bl-Ingliż?* (19 cells); `webPool` falls back to the whole deck under twelve words.

## b — The playable game (plain look)

- `src/components/games/SpiderWeb.tsx`. Add `'web'` to `GameId`, a card in `Games.tsx` after
  Infinite typing ("A bee is stuck in a web. Guess the letters of the Maltese word before the
  spider reaches it.", detail `Always Polish / English → Maltese`), and the route in `App.tsx`
  with `update` (for the sound toggle).
- **Layout**, top to bottom inside `GameShell`: the scene (`flex: 1`, at least 120 px; in this
  step just the spider's progress as a row of pips with an `aria-label` such as "2 of 6 steps"),
  the meaning (`Face` with `side="x"` on a `.card.comb-bg`), the cells, the keys, the foot
  (Don't know, sound toggle, Finish).
- **Cells.** A wrapping row, `lang="mt"`, each cell a fixed-width box with the letter or an
  underline; a space is a gap. One `aria-live="polite"` label reads the word so far ("k, blank,
  blank, b"). Size the cells so that 18 fit in two rows of nine at 390 px.
- **Keys.** 29 `<button class="key">` in the comb layout `TileCard` uses, six to a row. Each has
  `aria-label` with the letter and, once used, "in the word" or "not in the word", and `disabled`.
- **Keyboard.** A hardware key press guesses that letter; "għ" has no key of its own on a
  keyboard and is reached with Tab. Escape still leaves through `GameShell`.
- **Phases.** `playing`, `freed` (input off, short), `caught` (overlay), `over` (summary). No
  ready card: the game starts on its first word, as Infinite typing does. `wakeSound()` on the first key.
- **Summary.** Bees freed as the big number, right and wrong, the longest run of bees freed,
  `MistakesList` with `dir="x2mt"` and `missedText` "the spider got there", Play again, Done.
- In dev builds expose `window.__web.state`: phase, word id, the keys of the word, guessed keys,
  misses, steps.

**Done when.** Words can be freed and lost by tapping, long phrases and "għ" words lay out
correctly, and a caught word comes back later in the run.

## c — The web, the bee, the spider and feedback

- **One canvas** fills the scene. The web: eight spokes and four rings in `--line`, centred low.
  The bee sits at the centre (`drawBee`), wriggling a little. The spider hangs from the top on a
  thread drawn in `--muted`; its height is `misses / steps` of the way to the bee, so with fewer
  steps each one is longer. Add `drawSpider(ctx, x, y, r, now, colors)` to `beeArt.ts`: a round
  body in `--ink`, eight legs that flex with `now`, two `--no` eyes.
- **Hit.** The filled cells pop, the web gives one small shake. Sound `'pollen'`.
- **Miss.** The spider slides down its step over about 300 ms, the key flashes `--no`. Sound
  `'bump'`, a short vibration.
- **Freed.** The bee flies up and out of the scene with a burst of `--accent`. Sound `'right'`.
- **Caught.** The spider reaches the bee, the scene dims, the overlay follows. Sound `'wrong'`,
  a longer vibration.
- **Reduced motion.** No shake, wriggle, burst or slide; the spider jumps to its place.

**Done when.** The spider's distance can be read at a glance at every step count, and the scene
never pushes the keys off a 390×560 screen.

## d — Texts

- `README.md`: raise the count of practice games by one and describe the game in the same
  sentence style.

## Order, commits, checks

One commit per step, a to d, each leaving `npm test` and `npm run build` green.

1. `npm test` and `npm run build`.
2. Play it automatically: `npm run dev`, Playwright at 390×844. From `window.__web.state` click
   the keys of the word: the right count rises and the next word arrives. Click six letters the
   word does not have: the wrong count rises, the overlay shows the word, and the word returns
   within the next dozen. Free four in a row and check `steps` is 5.
3. Screenshots in light and dark, at 390×844 and about 390×560: the longest phrase, a word with
   "għ", the keys after several hits and misses, the caught overlay.

## Decisions taken here, easy to change

- The whole alphabet is on the pad. A smaller pad (the word's letters plus decoys, as in
  Infinite typing) would make most taps hits and the spider harmless.
- No saved best score and no lives across words: each word already has its own six lives.
  A best "bees freed in a row" would be the natural record to add (`webBest`).
- The spider speeds up by needing fewer misses, never by a timer.
- "għ" must be guessed as "għ". Letting `g` or `h` reveal it would be kinder and teach less.
- "Almost" does not exist here: a word is freed or caught.
