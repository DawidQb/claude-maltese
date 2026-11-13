# Honeycomb spell — description and implementation plan

This is a brief for a session that will implement the game. It is self-contained: read it,
then read the files named under "Where things are", and start.

## Scope

One new game: the letters of a Maltese word are hidden in a comb of nineteen cells, each next
to the one before, and the player traces the word with a finger.

| Step | Change | One line |
|------|--------|----------|
| a | Rules | `src/lib/spell.ts`: the comb, a path for the word, the other letters, tracing and judging. |
| b | Playable game, plain look | Meaning on top, the comb, tracing by drag and by taps. |
| c | Feedback | The traced line, the right path shown after a miss, sound. |
| d | Texts | The Games card and the README. |

Not in scope: a timer, a saved best score, more than one word in a comb, changes to the review
schedule. Do not add them.

## Ground rules that must survive

- **Games never change the review schedule.** Nothing here calls `recordAnswer` or touches `data.cards`.
- **The header shows right and wrong counts** (`Tally` in `GameShell.tsx`) and nothing else.
  Right is a word spelled, wrong is a word shown. The run of words spelled is internal.
- **Rules live in `src/lib/` as pure functions on plain data**, tested without a screen. Every
  tuning number is a named constant in the rules file.
- Always Polish/English → Maltese, like Infinite typing.
- A game reads its settings once, when it opens.
- Colours come from the CSS variables; light and dark must both look right. Honour
  `prefers-reduced-motion`; sound and vibration obey `settings.sound`.

## Where things are

- `src/lib/letters.ts` — `toKeys(word)` splits a Maltese word into keys ("għ" is one key),
  `keyLabel`, and the private `LAYOUT`, `DECOYS` and `LOOKALIKES` (h/ħ/għ, g/ġ/għ, z/ż, ċ/k).
- `src/lib/games.ts` — `WordStream` (`next`, `repeatLater`), `shuffle`, `Rng`.
- `src/lib/words.ts` — `wordsInTopic(topic, settings)`.
- `src/components/Cards.tsx` — `Face` (a word's translation side); `TileCard` for the
  `.tile-display` line that shows the letters so far.
- `src/styles.css` — `.cell` is the hexagonal button used by Match pairs and Speed round;
  `.keys-comb` lays keys out as a comb.
- `src/components/games/InfiniteTyping.tsx` — the simplest endless game: stream, tally, `GameShell`.
- `src/components/games/ProtectHive.tsx` — the reveal overlay, the foot (`.bee-foot`: hint, sound
  toggle, Finish), the summary with `MistakesList`, reduced motion, `window.__hive`.
- `src/lib/sound.ts` — `wakeSound`, `playSound`.
- `src/components/Games.tsx`, `src/App.tsx` — the list of games and the route per `GameId`.

## For the player

The meaning is at the top: chleb / bread. Below it is a comb of nineteen cells, a letter in
each. Somewhere in it the Maltese word runs from cell to neighbouring cell: ħ, o, b, ż. Put a
finger on the first letter and slide through the rest, or tap them one after another. The
letters traced so far show above the comb, with a blank for each one still to come. The moment
the trace spells the word it is accepted. A trace of the right length that spells something else
flashes red and clears; after three of those the comb shows where the word was.

## Rules

**Comb.** A hexagon of hexagons, two cells out from the centre: rows of 3, 4, 5, 4 and 3, with
pointy-top cells. In axial coordinates, the cells `(q, r)` with `|q|`, `|r|` and `|q + r|` all
at most `RADIUS = 2`. Two cells are neighbours when they differ by one of the six axial steps.
A cell has three to six neighbours.

**Words.** Words of the chosen topic whose keys are letters only (no space, hyphen or
apostrophe) and number `MIN_KEYS = 3` to `MAX_KEYS = 9`: 1141 of the 1229 cards in the shipped
deck. Fewer than `MIN_POOL = 12`: the whole deck.

**Path.** The word's keys are laid on a random walk that never uses a cell twice, starting
anywhere: a depth-first search with random neighbour order, backing out of dead ends. "għ" takes
one cell.

**The other cells** depend on the run of words spelled:

| Run | First cell | Other letters |
|-----|------------|---------------|
| 0–2 | Marked | Random letters the word does not have. |
| 3–5 | Marked | Look-alikes of the word's letters first (`ħ` and `għ` for a word with `h`), then random letters. |
| 6+  | Not marked | As above, and `FALSE_STARTS = 2` of them are copies of the word's first letter, placed away from the real start. |

A word shown resets the run.

**Tracing.** The trace is a list of cells.
- Empty trace: any cell starts it.
- A neighbour of the last cell that is not in the trace is added.
- The cell before the last one takes the last one off (sliding back, or tapping it).
- The last cell, tapped again, is taken off.
- Any other cell: while dragging, nothing; on a tap, the trace starts again from that cell.
- Lifting the finger changes nothing. The trace stays and can be continued either way.

**Judging** happens after every change. The traced letters equal the word's keys: right. Any
trace spelling the word counts, whichever cells it uses. The trace is as long as the word and
spells something else: a failed try; it flashes for `FLASH_MS = 600` and clears. At
`TRIES = 3` failed tries, or on "Show me" in the foot, the word is shown.

**End of a word.** Spelled: right +1, run +1, next comb after `SPELLED_MS = 700`. A word
spelled after a failed try still counts as right, and is queued with `stream.repeatLater`.
Shown: wrong +1, run reset, queued again, the right path lights up cell by cell and stays until
a tap or `SHOWN_MS = 2400`.

**The run.** Endless, like Infinite typing; Finish in the foot shows the summary.

## a — Rules: `src/lib/spell.ts` and `src/lib/spell.test.ts`

Pure functions, no DOM. Names may change, the behaviour may not:

- Constants: `RADIUS`, `MIN_KEYS`, `MAX_KEYS`, `MIN_POOL`, `TRIES`, `FALSE_STARTS`,
  `LEVELS = { lookalikes: 3, hard: 6 }`, `FLASH_MS`, `SPELLED_MS`, `SHOWN_MS`.
- `letters.ts`: export `LOOKALIKES` and the plain alphabet (`DECOYS` today) for the fill.
- `interface Hex { q: number; r: number }`; `COMB: Hex[]` — the nineteen cells in reading order
  (top row first, left to right), so a cell is known by its index.
- `areNeighbours(a, b) → boolean` on indices; `neighbours(i) → number[]`.
- `hexCentre(i, size) → { x, y }` — pixel centre relative to the comb's centre:
  `x = size · √3 · (q + r / 2)`, `y = size · 1.5 · r`. Kept here so the hit test can be tested.
- `cellAt(x, y, size) → number | null` — the cell whose centre is within `0.75 · size`, so a
  finger cutting a corner between two cells does not pick up a third.
- `layPath(length, rng) → number[]`.
- `interface Comb { letters: string[]; path: number[]; marked: boolean }`
- `makeComb(word, run, rng) → Comb`.
- `trace(path, cell, how: 'drag' | 'tap') → number[]` — the rules under "Tracing".
- `judge(comb, path, word) → 'open' | 'right' | 'wrong'`.
- `spellWords(words) → Word[]`, `spellPool(inTopic, all) → Word[]`.

**Tests.** `COMB` has 19 cells in rows of 3, 4, 5, 4, 3; `areNeighbours` is symmetric, never
true for a cell and itself; the centre has six neighbours and each corner three. `cellAt` gives
each cell at its own centre and `null` at the point where three cells meet. `layPath`, for every
length from 3 to 9 over many seeds: that many different cells, each a neighbour of the one
before. `makeComb`: 19 letters; the letters along `path` are `toKeys(word.mt)`, with "għ" in one
cell; at run 0 no other cell holds a letter of the word and `marked` is true; at run 3 a word
with `h` gets `ħ` or `għ` among the others; at run 6 `marked` is false and two other cells hold
the first letter, neither a neighbour of the start. `trace`: adds a free neighbour; ignores a
used cell and a far cell while dragging; steps back on the previous cell; a tap on the last
cell removes it; a tap on a far cell starts again. `judge`: `open` while short, `right` on the
path and on a different path with the same letters, `wrong` at full length otherwise.
`spellWords` drops phrases, hyphenated words, two-letter words and words over nine keys.

## b — The playable game (plain look)

- `src/components/games/HoneycombSpell.tsx`. Add `'spell'` to `GameId`, a card in `Games.tsx`
  after Infinite typing ("The Maltese word is hidden in a comb of letters. Trace it from cell
  to cell.", detail `Always Polish / English → Maltese`), and the route in `App.tsx` with
  `update` (for the sound toggle).
- **Layout**, top to bottom inside `GameShell`: the meaning (`Face` with `side="x"` on a
  `.card.comb-bg`, kept short: no more than 96 px), the letters so far (`.tile-display`,
  `lang="mt"`, `aria-live="polite"`, blanks as "·"), the comb (`flex: 1`), the foot (Show me,
  the tries left as three small cells, sound toggle, Finish).
- **Comb.** A square-ish box measured with a `ResizeObserver`; `size = min(width / (5 · √3),
  height / 8)`, capped at 46 px. Nineteen `<button class="cell">` placed absolutely at
  `hexCentre`, each `2 · size` tall, `lang="mt"`, `data-cell` with its index, `aria-pressed`
  when in the trace. The marked first cell has a ring in `--accent` and "first letter" in its
  `aria-label`.
- **Input.** `touch-action: none` on the comb. `pointerdown` on the comb captures the pointer
  and calls `trace(…, 'drag')` with `cellAt` of the pointer; `pointermove` does the same;
  `pointerup` releases. A press and release on the same cell without leaving it is a tap:
  undo what the press did and call `trace(…, 'tap')` instead, so both ways of playing share one
  handler. The buttons' own `click` handles keyboard activation (Enter or Space) as a tap.
- **Phases.** `playing`, `flash` (input off for `FLASH_MS`), `spelled` (short), `shown`
  (overlay off; the comb itself shows the path), `over` (summary). No ready card.
  `wakeSound()` on the first pointer down.
- **Summary.** Words spelled as the big number, right and wrong, `MistakesList` with
  `dir="x2mt"` and `missedText` "shown in the comb", Play again, Done.
- In dev builds expose `window.__spell.state`: phase, word id, the nineteen letters, the
  answer path, the trace, tries left, run.

**Done when.** A word can be traced in one drag, by taps, and by a mix of both; sliding back
undoes; three wrong traces show the path; "għ" words and nine-letter words work.

## c — Feedback

- **The trace.** Cells in the trace turn `--accent` and are joined by a line drawn on an SVG
  laid over the comb (`pointer-events: none`), centre to centre, with round joins. Each added
  cell plays `'pollen'`, pitched a step higher than the one before.
- **Right.** The traced cells turn `--known` and pop one after another along the path; sound `'right'`.
- **Failed try.** The trace turns `--no`, the comb shakes once, one of the three try cells
  empties; sound `'bump'`, a short vibration.
- **Shown.** The right path lights up in `--known` one cell every 150 ms with the line following
  it; sound `'wrong'`.
- **New comb.** The letters fade in over 150 ms so a new comb is never mistaken for the old one.
- **Reduced motion.** No shake, pop or fade; the path appears at once.

**Done when.** A finger moving quickly across five cells never drops or adds a cell it did not
cross, on a phone, at 390 px wide.

## d — Texts

- `README.md`: raise the count of practice games by one and describe the game in the same
  sentence style.

## Order, commits, checks

One commit per step, a to d, each leaving `npm test` and `npm run build` green.

1. `npm test` and `npm run build`.
2. Play it automatically: `npm run dev`, Playwright at 390×844 with touch. From
   `window.__spell.state` click the cells of the answer path in order: the right count rises
   and a new comb arrives. Then trace one by dragging (`mouse.down` on the first cell's centre,
   `move` through each next centre in several steps, `up`). Trace a wrong path of the right
   length three times: the tries run out, the wrong count rises, the path is shown and the word
   returns later. Spell six in a row and check that the first cell is no longer marked.
3. Screenshots in light and dark, at 390×844 and about 390×560: a three-letter word, a
   nine-letter word, a word with "għ", a failed try, the shown path. Every cell is at least
   44 px across at both sizes.

## Decisions taken here, easy to change

- One comb size for every word. A smaller comb for short words would make them easier still.
- The word is judged only when the trace is as long as the word, not letter by letter, so a
  wrong first letter is not given away at once.
- The number of letters is shown as blanks. Hiding it would make the game harder and the
  judging rule above impossible.
- The first cell is marked until a run of six. It is the difference between recalling a
  spelling and hunting for a letter.
- Words with spaces, hyphens and apostrophes are left out (61 cards) rather than given cells.
- No saved best score, as in Infinite typing and Busy bee.
