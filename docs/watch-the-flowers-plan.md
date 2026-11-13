# Watch the flowers — description and implementation plan

This is a brief for a session that will implement the screen. It is self-contained: read it,
then read the files named under "Where things are", and start.

## Scope

Not a game. A meadow to look at: bees fly about a few flowers, and now and then one brings a
word. Nothing is asked, nothing is counted. It sits at the bottom of the Games tab.

| Step | Change | One line |
|------|--------|----------|
| a | Rules | `src/lib/meadow.ts`: which word comes next, the word's cycle, flowers, how the bees move. |
| b | The screen, plain look | Flowers as plain shapes, bees flying, a word carried in and its meaning shown. |
| c | Flowers, touches, pace | Drawn flowers, tap to see sooner, tap to hold, the pace switch, screen kept awake. |
| d | Texts | The entry on the Games tab and the README. |

Not in scope: scores, right and wrong counts, a summary, sound, new word data, any change to
the review schedule. Do not add them.

## Ground rules that must survive

- **Nothing here changes the review schedule.** The screen reads `data.cards` once, when it
  opens, to choose words. It never calls `recordAnswer` and never writes `data.cards`.
- **No tally.** The header shows the title and nothing on the right.
- **Rules live in `src/lib/` as pure functions on plain data**, tested without a screen. Every
  tuning number is a named constant in the rules file.
- The screen reads its settings once, when it opens; only the pace can change while it is open.
- Colours come from the CSS variables; light and dark must both look right.
- Honour `prefers-reduced-motion`: then nothing flies, and words simply appear on a flower.
- Silent: no sound and no vibration, whatever `settings.sound` says.

## Where things are

- `src/lib/swarm.ts` — the background bees: `SwarmBee`, `newSwarm`, `stepSwarm`, `velocity`,
  `SWARM`. The wandering here is the same movement.
- `src/components/BeeSwarm.tsx` — the canvas loop to copy: resize with device pixel ratio,
  capped step, `readColors` on a colour-scheme change, standing still under reduced motion,
  `window.__swarm` for automated checks.
- `src/components/games/beeArt.ts` — `readColors`, `drawBee`.
- `src/lib/srs.ts` — `CardState { box, due }`, `cardKey(dir, wordId)`, `addDays`, `toISODate`.
  A word answered wrong goes to box 1; a word never studied has no card.
- `src/lib/words.ts` — `wordsInTopic(topic, settings)` returns words in deck order.
- `src/lib/bounce.ts` — `promptLabel` (question-side lines) and `doorLabel` (answer-side lines).
- `src/lib/games.ts` — `Rng`, `shuffle`.
- `src/components/games/ProtectHive.tsx` — real DOM labels placed over a canvas by writing
  `style.transform` from the loop.
- `src/components/games/GameShell.tsx` — `GameShell` (back button, title, Escape).
- `src/components/Games.tsx`, `src/App.tsx` — the list of games and the route per `GameId`.
- `src/lib/store.ts` — `Settings`, `emptyData`, `sanitize`.

## For the person watching

A meadow: a few flowers on their stems, and bees wandering between them, stopping on a flower
for a moment and flying on. Every so often a bee comes in from the side carrying a word. It
flies to a flower and lands; the flower opens and shows what the word means. After a few
seconds the flower closes and the meadow is just bees again.

The few seconds of flight are the point: there is time to think of the meaning before the
flower gives it. Tapping the bee shows the meaning at once. Tapping the open flower keeps it
open until it is tapped again. A switch at the bottom sets how often words come: seldom,
normal, often. The screen stays on while the meadow is open, so the phone can stand on a desk.

Which side the bee carries follows the Games direction: Maltese on the bee and the meaning on
the flower for Maltese → Polish/English, the other way round otherwise. The words are those of
the topic chosen on the Games tab.

## Rules

**Which word.** Watching teaches little about a word never met, and helps keep one already met.
So each word of the topic gets a weight from its card in the direction being shown, and words
are drawn at random by weight:

| Word | Weight |
|------|--------|
| Shaky: has a card in box `SHAKY_BOX = 2` or lower | 6 |
| Coming back: has a card due within `SOON_DAYS = 3` days, or overdue | 4 |
| Next up: no card, and among the first `FRESH_AHEAD = 20` such words in deck order | 2 |
| Any other word with a card | 1 |
| Any other word without a card | 0 |

A word that fits two rows takes the larger weight. Someone who has studied nothing therefore
sees the twenty words Study would introduce next. A word is not drawn again until
`NO_REPEAT = 12` others have been (fewer in a small pool: the pool's size less one).

**A word's cycle.**
1. `gap` — no word. Lasts `PACE.seldom = 25 s`, `PACE.normal = 10 s` or `PACE.often = 3 s`.
   The first word comes after `FIRST_MS = 2 s`.
2. `carry` — a bee enters from the left or right edge with the word under it and flies to a
   free flower along a gentle arc, taking `CARRY_MS = 4 s`. A tap on the bee or its word shows
   the meaning next to the word for the rest of the flight.
3. `shown` — the bee has landed, the flower is open, word and meaning are shown together for
   `SHOW_MS = 5 s`. A tap on the flower's label holds it: the cycle stops there until a second
   tap, then `shown` starts again from the beginning.
4. The label fades, the flower closes, the bee joins the wandering ones or flies off; back to `gap`.

Only one word is ever on the screen.

**Flowers.** Three under 480 px of width, four up to 720, five beyond. Spread evenly across the
width with a little random shift, never closer than `MIN_GAP = 90 px`; heads between 45 % and
70 % of the way down the field, so labels have room above and stems below.

**Wandering bees.** One per `AREA_PER_BEE = 45 000` square px, between 4 and 10. Each moves as a
background bee does (`stepSwarm`). About every `VISIT_EVERY_MS = 9 s` a wandering bee turns to a
flower no bee is on, lands, stays `FEED_MS = 2.5 s` while the flower nods, and wanders on. The
flower the word-bee is heading for or sitting on is never free.

**Reduced motion.** Bees are drawn still, one on each of two flowers. A word appears as a label
over a flower (the carried side for `CARRY_MS`, then the meaning as well for `SHOW_MS`), fading
in and out without movement. The cycle and the taps are the same.

## a — Rules: `src/lib/meadow.ts` and `src/lib/meadow.test.ts`

Pure functions, no DOM. Names may change, the behaviour may not:

- Constants: `WEIGHT`, `SHAKY_BOX`, `SOON_DAYS`, `FRESH_AHEAD`, `NO_REPEAT`, `PACE`, `FIRST_MS`,
  `CARRY_MS`, `SHOW_MS`, `MIN_GAP`, `AREA_PER_BEE`, `VISIT_EVERY_MS`, `FEED_MS`.
- `type Pace = 'seldom' | 'normal' | 'often'`
- `meadowWeights(words, cards, dir, today) → { word: Word; weight: number }[]` — the table above;
  words with weight 0 are left out.
- `pickWord(weighted, recent, rng) → Word` — `recent` is the ids drawn last, newest last.
- `interface Cycle { phase: 'gap' | 'carry' | 'shown'; leftMs: number; held: boolean; early: boolean }`
  and `stepCycle(cycle, dtMs, pace) → { cycle: Cycle; entered?: 'carry' | 'shown' | 'gap' }` —
  `entered` tells the component when to draw a word, land the bee, or clear up. `hold(cycle)`
  and `showEarly(cycle)` for the two taps.
- `interface Flower { x: number; headY: number; baseY: number; r: number }` and
  `placeFlowers(width, height, rng) → Flower[]`.
- `carrierPos(from, to, t) → { x, y }` — `t` from 0 to 1, eased at both ends, along a quadratic
  curve whose control point is above the midpoint.
- `interface MeadowBee extends SwarmBee { state: 'wander' | 'toFlower' | 'feeding'; flower: number | null; leftMs: number }`,
  `newMeadow(width, height, rng) → MeadowBee[]`, and
  `stepMeadow(bees, flowers, taken, dtMs, width, height, rng)` — `taken` is the index of the
  word-bee's flower, or `null`.

**Tests.** `meadowWeights`: a box-1 card weighs 6; a box-4 card due tomorrow 4 and due in ten
days 1; a box-2 card due today 6, not 4; without any cards exactly the first twenty words in
deck order have weight 2 and the rest are left out; with cards only in the other direction the
result is the same as with none. `pickWord`, over many seeded draws: never one of the last
twelve; a weight-6 word comes up about six times as often as a weight-1 word; with a pool of
three it still returns, and never the same word twice running. `stepCycle`: gap, carry, shown
and gap again after the right times for each pace; `entered` is reported once per change; a
held `shown` does not run down and restarts in full when released; `showEarly` changes nothing
outside `carry`. `placeFlowers`: three, four and five flowers at 390, 600 and 900 px; all inside
the field; none closer than `MIN_GAP`. `carrierPos`: `from` at 0, `to` at 1, above the straight
line at one half. `stepMeadow`, over a long seeded run: never two bees on one flower, never a
bee on the taken flower, a feeding bee leaves after `FEED_MS`.

## b — The screen (plain look)

- `src/components/games/WatchFlowers.tsx`. Add `'meadow'` to `GameId` and the route in
  `App.tsx` with `update` (for the pace).
- **Words.** `wordsInTopic(topic, settings)` with the settings captured at mount, weighted with
  `data.cards`, `gameDirection` and today's date, all read once.
- **Layout** inside `GameShell` (title "Watch the flowers", no status): the field (`flex: 1`),
  and a foot holding the pace switch (step c).
- **Canvas.** One canvas fills the field, set up and looped as in `BeeSwarm.tsx`. In this step
  a flower is a stem and a circle. The loop steps the wandering bees, the word-bee and the cycle.
  The clock stops while the tab is hidden.
- **Labels are DOM, not canvas text**, so they wrap, carry `lang="mt"` on the Maltese side, and
  can be read by a screen reader. Two elements, placed by `style.transform` from the loop:
  the carried label, hanging under the word-bee, and the flower label, above the flower's head.
  Both are at most 70 % of the field wide and are kept inside it; the longest translation in
  the deck (36 characters) must wrap, not overflow. Lines come from `promptLabel` (carried) and
  `doorLabel` (flower).
- **For screen readers** one `aria-live="polite"` line reads "word — meaning" when the flower
  opens. The canvas is `aria-hidden`.
- In dev builds expose `window.__meadow.state`: the cycle, the word id, the flower index, the
  recent ids, the number of wandering bees, whether motion is reduced.

**Done when.** Left alone for two minutes at the normal pace the screen shows about eight words,
each first as its carried side and then with its meaning, in both directions.

## c — Flowers, touches, pace, staying awake

- **Flowers.** Add `drawFlower(ctx, flower, open, nod, colors)` to `beeArt.ts`: a curved stem
  and two leaves in `--known`, six petals in `--accent` around a `--ink` centre. `open` from 0
  (petals folded up) to 1 (spread), eased over 400 ms when a word lands and leaves. `nod` tips
  the head a few degrees while a bee is on it. A strip of ground in `--surface-2` at the bottom.
- **The word-bee** is drawn larger than the wandering ones (radius 14 against 7 to 11) and
  solid; the wandering bees are fainter the smaller they are, as in `BeeSwarm`.
- **Tap the bee.** The carried label is a `<button>`; a tap calls `showEarly` and the meaning
  appears beside it in smaller type. A tap on the canvas within 32 px of the word-bee does the same.
- **Tap the flower.** The flower label is a `<button aria-pressed>`; a tap holds it (a small pin
  mark in `--accent`), a second tap releases it.
- **Pace.** A `.segmented` group in the foot, "Seldom · Normal · Often", labelled "Words".
  `store.ts`: add `meadowPace: Pace` to `Settings`, default `'normal'`, with a line in
  `sanitize`. A change applies from the next `gap`.
- **Staying awake.** While the screen is open and the tab visible, hold
  `navigator.wakeLock.request('screen')`; ask again on `visibilitychange`, release on leaving.
  Where the API is missing or refuses, do nothing and show nothing.
- **Reduced motion** as under Rules; check it with the pace at "often".

**Tests.** `store.test.ts`: `sanitize` keeps `meadowPace: 'often'` and gives `'normal'` when it
is missing or malformed; update the existing `toEqual` checks on settings for the new key.

**Done when.** The meadow is pleasant to leave running, a tap on the bee and on the flower do
what the text says, and no label is ever cut off by the edge of the field.

## d — Texts

- **Games tab.** The last entry in the list, after Speed round. Give the list's items an
  optional `action` (default "Play") and use "Watch" here, with `aria-label` "Watch the flowers".
  Name: "Watch the flowers". Text: "Not a game. Bees fly about the flowers, and now and then
  one brings a word and a flower shows what it means. Nothing to answer, nothing counted."
  Detail: "Mostly words you are still learning".
- The line under the list ("Games are just for practice…") stays true and stays as it is.
- `README.md`: a bullet of its own after the games, not one more game in their count: what it
  shows, that it follows the Games direction and topic, that it favours shaky and soon-due words
  and never changes the schedule, the pace switch, and that the screen stays on.

## Order, commits, checks

One commit per step, a to d, each leaving `npm test` and `npm run build` green.

1. `npm test` and `npm run build`.
2. Watch it automatically: `npm run dev`, Playwright at 390×844, pace "often".
   - With empty storage, collect the word ids from `window.__meadow.state` for a minute: all are
     among the first twenty words of the topic, none repeats within twelve.
   - With saved progress holding five box-1 cards in the Games direction: they make up most of
     what is shown.
   - Click the carried label during `carry`: the meaning shows before the flower opens. Click
     the flower label: the cycle stays in `shown` past `SHOW_MS`; click again: it goes on.
   - With reduced motion emulated: no bee moves between frames, and words still come and go.
   - Flip the Games direction and check which side is carried. Check that `data.cards` in
     storage is byte-for-byte the same after five minutes.
3. Screenshots in light and dark, at 390×844, about 390×560 and 900×700, with `show: both` and
   the longest translations: labels wrap inside the field and never cover the word-bee.

## Decisions taken here, easy to change

- It lives at the bottom of the Games tab with a "Watch" button, not on the Study tab.
- One word at a time. Several at once would turn the meadow into a list to read.
- The meaning is always given after four seconds. A longer wait makes a better quiz and a worse
  thing to glance at.
- Weights favour shaky words 6 to 1 over settled ones; change `WEIGHT` to make it gentler.
- Words never studied appear only as the next twenty in deck order, so the meadow previews what
  Study will bring rather than the whole deck.
- The pace is a setting kept on the device, like the others; it is not synced.
- The screen is kept awake without a switch. Add one beside the pace if it proves unwelcome.
- Silent. A soft sound when a flower opens would help someone not looking at the screen, and
  would annoy everyone else in the room.
