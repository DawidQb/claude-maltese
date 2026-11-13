# Queen's orders — description and implementation plan

This is a brief for a session that will implement the game. It is self-contained: read it,
then read the files named under "Where things are", and start.

## Scope

One new game that practises conjugated verb forms, the part of the deck no other game aims at.

| Step | Change | One line |
|------|--------|----------|
| a | Rules | `src/lib/court.ts`: which verbs can be asked, what an audience holds, how an order gets its wrong answers. |
| b | Playable game, plain look | Queen's order at the top, four workers carrying forms walk up to her, tap the right one. |
| c | Queen, workers, feedback | Canvas art, sound, the table of the verb's forms after each audience. |
| d | Best score, texts | `queenBest`, the Games card, the README. |

Not in scope: plural forms, person and tense as data (the deck has neither), new word data,
changes to the review schedule, a pause button. Do not add them.

## Ground rules that must survive

- **Games never change the review schedule.** Nothing here calls `recordAnswer` or touches `data.cards`.
- **The header shows right and wrong counts** (`Tally` in `GameShell.tsx`), plus the audience
  number ("Verb 2 of 4"); nothing else.
- **Rules live in `src/lib/` as pure functions on plain data**, tested without a screen. The
  component only draws and wires input. Every tuning number is a named constant in the rules file.
- Always Polish/English → Maltese: the order is a meaning, the workers carry Maltese forms.
- A game reads its settings once, when it opens (`const [{ show }] = useState(data.settings)`).
- Colours come from the CSS variables in `src/styles.css`; everything must look right in light and dark.
- Honour `prefers-reduced-motion`; sound and vibration obey `settings.sound`, as in Protect the hive.

## Where things are

- `src/lib/words.ts` — `Word`. A conjugated form has `formOf` set to its verb's dictionary form,
  which is itself a word (`id` equals its Maltese text).
- `src/lib/games.ts` — `shuffle`, `Question`, `makeQuestion` (the shape to return), `Rng`.
- `src/lib/letters.ts` — `similarity(a, b)` between two Maltese words, for look-alike wrong answers.
- `src/components/games/ProtectHive.tsx` — the model for this game: real `<button>`s moved by a
  `requestAnimationFrame` loop that writes `style.transform`, a canvas behind them, the reveal
  overlay, the foot with the sound toggle and Finish, `window.__hive` for automated checks.
- `src/components/games/beeArt.ts` — `readColors`, `drawBee`.
- `src/components/games/GameShell.tsx` — `GameShell`, `Tally`, `MistakesList`, `SpeakerIcon`.
- `src/components/games/SpeedRound.tsx` — ready card, summary card and best score to copy from.
- `src/components/Games.tsx`, `src/App.tsx` — the list of games and the route per `GameId`.
- `src/lib/store.ts`, `src/lib/merge.ts` — `games` records and how two copies merge.

## What the deck allows

In the shipped deck 24 verbs have four or more forms (22 have eleven: five past, six present;
*kien* has five, *kellu* thirteen), 260 forms in all. Another 67 verbs have a single form ("he
sells") and cannot be asked. A form says who and when only through its translation ("we ate",
"jedliśmy"), and some forms cover two persons ("I ate / you ate"). So the order is the form's
translation, never a separate "person + tense" label. Every translation in the deck is unique,
so an order has exactly one right form.

The two sides differ a lot in length: a Maltese form is at most 9 letters, a translation runs to
32 characters ("I read (past) / you read (past)"). That is why the workers carry the Maltese.

The deck is downloaded from the database and can change: the rules must work for any number
of forms per verb, and the game must say so when no verb qualifies.

## For the player

The queen sits at the top of the comb. She names a verb, *kiel* · jeść / to eat, and gives an
order: "jedliśmy / we ate". Four workers set off towards her from the bottom of the field, each
carrying one form of that verb: *kilna*, *kilt*, *nieklu*, *kielu*. Tap the worker with the
right form before they reach her. The right worker delivers and the others fly off. A wrong
tap, or workers that arrive untapped, and the queen shows the form she wanted.

An audience is one verb and five orders. After it the verb's forms are shown as a table, with
the ones just missed marked. A run is four audiences: twenty orders. The score is the number
filled.

## Rules

**Verbs.** A verb qualifies when its dictionary form is in the deck and at least `MIN_FORMS = 4`
of its forms are. The game takes its verbs from the whole deck: it ignores the topic chosen on
the Games tab and the "verb forms" switch in Settings (that switch is about Study cards; starting
this game is choosing verb forms).

**Audience.** `ORDERS = 5` different forms of one verb, at random; a verb with fewer than five
qualifying forms gives as many as it has. Verbs come in random order, none twice in a run. A run
is `AUDIENCES = 4` verbs, or fewer if fewer qualify.

**Order.** The right form plus three other forms of the same verb. While the run of right
answers is under `LOOKALIKES_FROM = 3` they are random; from then on they are the forms that
look most like the answer (`similarity` on the Maltese, three taken at random from the best
four), which in practice means the same tense: *kilt*, *kilna*, *kiltu* for *kielu*.

**Time.** The workers take `WALK.start = 12 s` to reach the queen. Every right answer in the run
takes `WALK.faster = 250 ms` off, down to `WALK.min = 8 s`; a miss puts it back to the start.

**Outcome.** Right worker tapped: right +1, run +1. Wrong worker tapped or time up: wrong +1,
run reset, the field freezes for `REVEAL_MS = 1600` while the order and the right form are shown
together, and the mistake is recorded (form asked, form chosen or none).

## a — Rules: `src/lib/court.ts` and `src/lib/court.test.ts`

Pure functions, no DOM. Names may change, the behaviour may not:

- Constants: `MIN_FORMS`, `ORDERS`, `AUDIENCES`, `LOOKALIKES_FROM`, `WALK`, `REVEAL_MS`, `BANNER_MS`.
- `interface Verb { verb: Word; forms: Word[] }`
- `courtVerbs(words) → Verb[]` — groups words by `formOf`, in deck order, and drops verbs
  without a dictionary row or with fewer than `MIN_FORMS` forms.
- `planRun(verbs, rng) → Verb[]` and `planAudience(verb, rng) → Word[]`.
- `makeOrder(verb, form, run, rng) → Question` (the type from `games.ts`): four options, shuffled.
- `walkMs(run) → number`.
- `paradigm(verb, asked) → { form: Word; state: 'right' | 'wrong' | 'unasked' }[]` in deck order,
  for the table after an audience.

**Tests.** `courtVerbs` on a hand-made deck: a verb with three forms is out, one with four is
in, a form whose verb row is missing is out, order follows the deck. On the shipped deck: 24
verbs, none with fewer than four forms. `planAudience`: five different forms, all of that verb;
four for a four-form verb. `makeOrder`, over many seeded runs: always four options, the answer
exactly once, every option a form of the same verb; from a run of 3 the wrong options are among
the four forms most similar to the answer. `walkMs`: 12 s at 0, never under 8 s at 100. `paradigm` marks states
and keeps deck order.

## b — The playable game (plain look)

- `src/components/games/QueensOrders.tsx`, in two parts like Protect the hive: `CourtField`
  (one run per mount: field, loop, input) and `QueensOrders` (ready card, tally, summary).
- Add `'queen'` to `GameId`, a card in `Games.tsx` right after Protect the hive ("The queen asks
  for a form of a verb. Tap the worker carrying it before they reach her."), and the route in
  `App.tsx` with `update`.
- **Layout**, top to bottom inside `GameShell`: the field (`flex: 1`), then the foot (hint, sound
  toggle, Finish; reuse `.bee-foot`). In the field, the top strip is the queen's: the verb with
  its meaning on one line, the order in large type below, wrapping when it is long. The strip is
  as tall as its content; measure it, because the walk ends at its bottom edge. Under it the
  four workers.
- **Workers are real `<button>`s** in two lanes, two to a lane, staggered so no two overlap,
  rendered as `ProtectHive` renders `.hive-word` (a `tile-mt` span with `lang="mt"`), with
  `data-word` set to the form's id. They move up as one group; position is one number `t` from 0
  (start) to 1 (the first worker touches the queen's strip), written straight to each element's
  `style.transform` every frame.
- **Loop and phases.** One `requestAnimationFrame` loop with the state in refs, `dt` capped and
  the clock stopped while the tab is hidden, as in `HiveField`. Phases: `ready`, `order`
  (workers walking, input on), `reveal` (frozen, overlay), `table` (after an audience, until
  Continue is pressed), `over`.
- **Table.** A card with the verb, its meaning and its forms in two columns (Maltese, meaning),
  from `paradigm`: missed forms marked with `--no`, right ones with `--known`, the rest plain.
  One button, Continue (Finish on the last audience).
- **Summary.** Orders filled as the big number, "of 20", right and wrong, the best line as in
  Speed round (step d), `MistakesList` with `dir="x2mt"` and `missedText` "the workers arrived", Play again, Done.
- **No verbs.** If `courtVerbs` is empty the ready card says "No verb in the deck has enough
  forms for this game" and offers only Back.
- **Short screens.** Under about 640 px of height the workers start nearer the queen's strip so
  that at least 150 px of walk is left; `WALK` does not change.
- In dev builds expose `window.__queen.state`: phase, audience, order index, `t`, the verb id,
  the answer id and the option ids.

**Done when.** A whole run of four audiences can be played by tapping, with `show` set to
`pl`, `en` and `both`.

## c — The queen, the workers and feedback

- **One canvas behind the buttons** draws the comb at the top, the queen (the bee from `drawBee`,
  1.6 times the size, with a small crown: three triangles in `--accent`), and a small bee over
  each worker button, wings moving. Colours from `readColors()`, redrawn on a colour-scheme change.
- **Right.** The chosen worker's bee flies up to the queen in about 250 ms and a `--accent` burst
  marks the delivery; the other three buttons fade and their bees turn away. Sound `'right'`.
- **Wrong or late.** The chosen button flashes `--no`, the right one `--known`, the queen shakes
  once. Sound `'wrong'`, a short vibration.
- **New verb.** Sound `'wave'` and a banner with the verb for `BANNER_MS = 1200`.
- **Reduced motion.** No shake, no burst, no wing movement; the workers still walk (that is the
  timer), linearly.

**Done when.** Nothing drawn ever covers a label, and with sound off the game is silent and still.

## d — Best score, texts

- `store.ts`: add `queenBest: number` to `games` (`emptyData`, `sanitize`); `merge.ts`: the larger
  wins. Save it when the run ends, as `SpeedRound` saves `speedBest`. Show `best N` on the card,
  on the ready card and in the summary. A run ended early with Finish does not set a best.
- Card details: `best N` when there is one, otherwise `All verbs with forms · topic does not apply`.
- `README.md`: raise the count of practice games by one and describe the game in the same
  sentence style.

**Tests.** `store.test.ts`: `sanitize` keeps a saved `queenBest`, gives 0 when missing or
malformed. `merge.test.ts`: the larger `queenBest` wins.

## Order, commits, checks

One commit per step, a to d, each leaving `npm test` and `npm run build` green.

1. `npm test` and `npm run build`.
2. Play it automatically: `npm run dev`, Playwright at 390×844. From `window.__queen.state`
   click the button whose `data-word` is the answer id. Check: right count rises and the walk
   shortens; a deliberate wrong tap and an untouched order each raise the wrong count, show the
   reveal and reset the walk to 12 s; after five orders the table shows with the misses marked;
   after four audiences the summary shows a score out of 20.
3. Screenshots in light and dark, at 390×844 and about 390×560, with `show: both` and the
   longest orders ("przychodzisz / ona przychodzi", "you understand / she understands"): the
   order wraps inside the queen's strip, and workers never overlap each other or the strip.

## Decisions taken here, easy to change

- One direction only. Maltese → Polish/English (the queen shows a form, the workers carry
  meanings) needs four full-width workers for the long translations, and Speed round on the
  "Verb forms" topic already asks that way round.
- A run is four verbs and twenty orders, with no lives. The alternative is an endless run with
  three drops of royal jelly, as Protect the hive has honey.
- A missed form is not asked again in the same audience; the table shows it instead. Asking it
  once more as a sixth order would teach more and make the score harder to read.
- The topic and the "verb forms" switch are ignored. Respecting the switch would leave the game
  empty for anyone who turned verb forms off.
- Workers are moving buttons. If tapping them proves fiddly, keep the four answers still at the
  bottom and let only the bees on the canvas walk.
- Plurals could be a second kind of order ("many of *ktieb*") later; wrong answers for them
  would have to be plurals of other nouns, which is a weaker question than this one.
