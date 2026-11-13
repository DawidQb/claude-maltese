# Busy bee: five improvements — description and implementation plan

This is a brief for a session that will implement the changes. It is self-contained: read it,
then read the three files named under "Where things are", and start.

## Scope

Five changes to the Busy bee game, in this order of work:

| # | Change | One line |
|---|--------|----------|
| A | Fly through the door | A right answer carries the bee into a new room instead of bouncing it back. |
| B | Close the bump loophole | Hitting the wall twice on the same question counts as a miss. |
| C | Difficulty that grows | Narrower doors, look-alike wrong answers and a third door as a run of right answers grows. |
| D | Juicier feedback | Particles, the answer floating up, a streak trail, optional sound and vibration. |
| E | Pollen to collect | Grains in mid-air to pick up on the way across. Ship last; easy to switch off. |

Not in scope: lives, a saved best score, a visible score or multiplier, changes to the review
schedule, and the "smoother" fixes (resume on tap, hold wobble, label overlap). Do not add them.

## Ground rules that must survive

- **Games never change the review schedule.** Nothing here calls `recordAnswer` or touches `data.cards`.
- **The header shows right and wrong counts** (`Tally` in `GameShell.tsx`). The run of right answers
  used below is internal: it drives difficulty and effects and is never shown as a number.
  The only new figure on screen is the pollen count (change E).
- **Rules live in `src/lib/bounce.ts` as pure functions on plain data**, tested in
  `src/lib/bounce.test.ts` without a screen. The component only draws and wires input.
  Keep every tuning number as a named constant in `bounce.ts`.
- Always Polish/English → Maltese: the doors carry Maltese words (`dir = 'x2mt'` in `BusyBee`).
- Crossing time never drops below about two seconds (`SPEED.max`), so labels stay readable.
- Colours come from the CSS variables read in `readColors()`; the game must look right in light and dark.
- Honour `prefers-reduced-motion`: no shake, slide, particles or trail when it is set.

## Where things are

- `src/lib/bounce.ts` — physics and rules: `step`, `placeDoors`, `turn`, `flap`, `nextSpeed`, `beeWords`, constants.
- `src/lib/bounce.test.ts` — their tests; `flyTo` is a small autopilot that flies a bee to a wall.
- `src/components/games/BusyBee.tsx` — `BeeField` (canvas, game loop, input) and `BusyBee` (round state, summary).
- `src/lib/games.ts` — `makeQuestion` (answer plus distractors, same topic first) and `WordStream`.
- `src/lib/letters.ts` — `toKeys` and `LOOKALIKES` (h/ħ/għ, g/ġ/għ, z/ż, ċ/k); note it imports from `games.ts`.
- `src/lib/store.ts` — `Settings`, `emptyData`, `sanitize`; `src/components/Settings.tsx` — the settings form.
- `src/styles.css` — `.bee-*` rules from the "Busy bee" comment on.
- In dev builds `window.__bee.state` exposes the bee, arena, speed, answer and options for automated checks.

How it works today: the bee flies towards one wall, which has two doors, one per answer. `step`
returns `'correct'`, `'wrong'` or `'bump'` when the bee reaches that wall. Correct: next question,
turn around. Wrong: show the right answer for 1.4 s, then next question, turn around. Bump (solid
wall between doors): same question, turn around, no cost.

## Step 0 — groundwork (no change in behaviour)

Small refactors the later steps rely on. One commit, all existing tests still pass.

1. **`step` reports which door.** Return `{ event: WallEvent; door?: Door } | null` instead of the bare
   event. `BusyBee.tsx:152` currently works out the wrong answer as "the option that is not the
   answer", which only holds for two doors; use `q.options[hit.door.option]` instead.
2. **`placeDoors` takes a door count and a size scale.** Signature becomes
   `placeDoors(arena, correctOption, rng, headroom, count = 2, scale = 1)`. Split the height below
   `headroom` into `count` equal bands and place one door at a random height in each, keeping
   `DOOR_PAD` and `DOOR_GAP` as now. With `count = 2, scale = 1` the result must equal today's.
3. **A run counter in the loop.** `let run = 0` in `BeeField`: +1 on correct, 0 on wrong. Add it, and
   later `room`, to `__bee.state`.

## A — Fly through the door

**For the player.** Passing the right door no longer turns the bee around in the doorway. It flies
on through the wall into the next room, the view slides after it, and the next word is waiting
there. A wrong door or a bump still throws the bee back, so only right answers move it forward.

**Rules.**
- Correct: direction is kept. The bee enters a new room through the wall it just passed, and the
  far wall of that room carries the doors for the next question.
- Wrong: unchanged (reveal, then next question and turn around, staying in the same room).
- Bump: unchanged for now (turn around, same question); see B.
- Reading time must not shrink: the bee still has a full wall-to-wall crossing for each question.

**How.**
- Add `enterRoom(bee, arena, speed, doors)` to `bounce.ts`. Rooms share a wall, so the next room is
  offset by `arena.width - WALL`: subtract `dir * (arena.width - WALL)` from `bee.x`, keep `y`, `vy`
  and `dir`, set `vx` from `speed`, install the new doors. The bee then sits in the doorway of the
  entry wall and flies out of it.
- In `BeeField`, keep a `camera` offset that starts at `dir * (arena.width - WALL)` when a room is
  entered and eases out to 0 over about 320 ms (`ROOM_SLIDE_MS`). Translate the whole scene by it.
  While it is non-zero, also draw the room being left (its walls and door openings, no labels)
  one room-width back, so the bee's position on screen is continuous through the wall.
  Physics and input keep running during the slide; nothing is paused.
- Remember the door flown through as the entry opening and draw it, unlabelled, on the wall behind
  the bee. If the bee later turns to face that wall (a bump or a wrong answer), the wall gets fresh
  doors exactly as today.
- Give the eye something that moves: a faint backdrop per room (a few flowers or honeycomb cells
  in `--line` / `--surface-2`, placed from a seeded rng per room number) drawn behind everything
  and sliding with the camera. With a flat background the slide is barely visible.
- `resize` clamps `bee.x` inside the walls; relax that while the bee is still in the entry doorway.
- With `prefers-reduced-motion`, set `camera` to 0 at once (a cut instead of a slide).

**Tests (`bounce.test.ts`).** After `enterRoom`: direction unchanged; `x` shifted by one room;
`y` and `vy` untouched; the bee reaches the far wall (not the entry wall) next, after roughly a
full crossing; no wall event fires while it leaves the entry doorway.

**Done when.** Ten right answers in a row move the bee through ten rooms in one direction; a wrong
answer or a bump sends it back within the same room; the bee never jumps on screen at a transition.

## B — Close the bump loophole

**For the player.** One slip against the wall is forgiven. A second bump on the same question
counts as a miss: the right answer is shown and the game moves on. Stalling is no longer free.

**Rules.**
- First bump on a question: as today (shake, turn around, same question), and the run resets to 0.
- Second bump on the same question: treated as wrong — `nextSpeed(speed, 'wrong')`, reveal for
  `REVEAL_MS`, `stream.repeatLater`, tally +1 wrong, then next question and turn around.
- The bump count resets whenever a new question starts.

**How.**
- Add `MAX_BUMPS = 1` (free bumps per question) to `bounce.ts` and a `bumps` counter in the loop.
- `onWrong` gains a case with no chosen word: change the type to `chosen: Word | null`. In the
  summary list (`BusyBee.tsx:497` on) show "✗ hit the wall twice" instead of "you chose …" for it.
- After the first bump, change the foot hint to something like "Careful: one more bump counts as a miss"
  until the question changes.

**Tests.** The counting is in the component, so cover it with the automated play check (see
Verification): two bumps on one question raise the wrong count by one and change the question;
one bump followed by a right answer raises only the right count.

**Done when.** Flying into the solid wall repeatedly ends each question after the second hit and
lists it under "Your mistakes".

## C — Difficulty that grows

**For the player.** The game starts as gentle as it is now and tightens while you keep answering
correctly: wrong answers start to look like the right one, doors get narrower, and on a long run
a third door appears. A wrong answer or a bump drops it back to gentle.

**Rules.** Driven by `run` (right answers in a row), evaluated each time a question is created:

| Run | Wrong answers | Door size | Doors |
|-----|---------------|-----------|-------|
| 0–2 | same topic, random (as now) | 100% | 2 |
| 3–5 | look-alikes | 100% | 2 |
| 6–8 | look-alikes | 85% | 2 |
| 9+  | look-alikes | 85% | 3 if they fit, otherwise 2 at 70% |

- A door is never shorter than `MIN_DOOR = 72` px. Three doors "fit" when each band leaves room
  for a door of at least 84 px below the prompt strip.
- Speed: raise `SPEED.faster` from 0.006 to 0.012, so top speed takes about 15 right answers
  instead of 30. Leave `SPEED.max`, `SPEED.min` and `SPEED.slower` alone.

**How.**
- `difficulty(run, arena, headroom) → { doors: 2 | 3; scale: number; lookalikes: boolean }` in
  `bounce.ts`, built from named thresholds. Pass its result to `placeDoors` and to the question.
- Look-alike distractors: add `similarity(a, b): number` to `letters.ts`, comparing two Maltese
  words by their keys (`toKeys`): shared prefix length, shared letters, closeness in length, with
  the `LOOKALIKES` groups folded together so `ħ` and `h` count as the same letter. Export nothing
  from `letters.ts` into `games.ts` (that would be a circular import). Instead give `makeQuestion`
  an optional last parameter `prefer?: (candidate: Word) => number`; when present, order the
  same-topic candidates by it, take the best four, shuffle those, then the rest as now. Taking
  four keeps the same word from always getting the same decoy. `BeeField` passes
  `(w) => similarity(w.mt, answer.mt)`.
- `makeQuestion` already takes an option count; pass 3 when `difficulty` says so. `takeDistinct`
  already keeps options from sharing a translation.
- `drawLabel` sizes text to half the field width, which still works with three doors; check that
  an 18-character word fits a 72 px door at the smallest font size.

**Tests.** `difficulty` at each threshold and on a short arena (falls back to two doors);
`placeDoors` with three doors: all inside the arena, below the headroom, no overlap, exactly one
correct, at heights from 400 to 900 px; `placeDoors` with `scale` never returns a door under
`MIN_DOOR`; `similarity` ranks `ħobż`/`hobz`-style pairs above unrelated words; `makeQuestion`
with `prefer` still returns distinct options containing the answer, and without it behaves as
before (existing tests unchanged); `nextSpeed` test updated for the new step.

**Done when.** On a phone-sized screen a run of nine right answers brings up a third door, and one
wrong answer brings back two wide doors.

## D — Juicier feedback

**For the player.** Right answers feel rewarding and mistakes are unmistakable, without anything
covering the words.

**What to add.**
- **Answer floats up.** On a right answer, replace the bare ✓ spark with "✓ " plus the Maltese word,
  rising and fading over about 900 ms from the door. It doubles as reinforcement.
- **Pollen burst.** 8–12 small `--accent` dots thrown from the door on a right answer, falling under
  gravity, gone in 500 ms. A short `--no` puff on a wrong door; a few `--muted` specks on a bump.
- **Door flash.** The frame of the door flown through turns `--known` or `--no` for 250 ms.
- **Streak trail.** From `run >= 3`, fading dots behind the bee from its last dozen positions;
  a little longer and brighter from `run >= 6`. It disappears when the run resets.
- **Sound.** Synthesised with the Web Audio API, no audio files: a two-note rising chime for right,
  a low thud for wrong, a soft knock for a bump, a blip for pollen (E). No sound on flapping.
  Create the `AudioContext` lazily on the first press (browsers require a user gesture) and resume
  it if suspended. Put this in a small `src/lib/sound.ts`.
- **Vibration.** `navigator.vibrate?.(…)`: a short pulse on a bump, a longer one on wrong. It does
  nothing on iPhone; that is fine.
- **Sound setting.** Add `sound: boolean` (default `true`) to `Settings` in `store.ts`
  (`emptyData`, `sanitize`), a checkbox in `Settings.tsx` next to the existing ones, and a small
  speaker toggle button in `.bee-foot`. `BusyBee` needs `update` passed from `App.tsx:40` for that,
  as `SpeedRound` already gets. The toggle governs sound and vibration together.

**How.**
- One particle array in the loop (`{ x, y, vx, vy, born, life, color, r }`), capped at about 80,
  updated with `dt` and drawn after the walls and before the bee. Particles and the trail live in
  room coordinates so they slide with the camera.
- Read `matchMedia('(prefers-reduced-motion: reduce)')` once and on change, like the colour scheme
  listener at `BusyBee.tsx:355`. When set: no shake (it is ignored today), no particles, no trail;
  keep the floating answer and the door flash.

**Tests.** `store.test.ts`: `sanitize` keeps `sound: false`, defaults to `true` when missing or
malformed. The rest is visual; cover it with screenshots (see Verification).

**Done when.** With sound off the game is silent and still; with reduced motion nothing shakes or
sprays; the effects never sit on top of the prompt or a door label for more than a moment.

## E — Pollen to collect (last, and optional)

**For the player.** Now and then a grain or two of pollen hangs in the air on the way across.
Fly through it to pick it up. It is a bonus, never required, and never hints at the answer.

**Rules.**
- No pollen during the first three crossings of a round.
- After that, per crossing: 50% one grain, 15% two, otherwise none (`POLLEN.one`, `POLLEN.two`).
- Grains sit in the first half of the crossing, between 22% and 48% of the way from the wall the
  bee is leaving, so they never overlap the door labels on the wall ahead, and between the prompt
  strip and 40 px above the floor.
- Placement uses its own rng draws and must not depend on which door is correct.
- A grain is collected when the bee's centre comes within `BEE_RADIUS + 8` of it. Grains left
  behind vanish when the bee turns or enters a new room.
- The count is shown as a third figure in the header, beside the tally, and on the summary card
  ("12 pollen"). It is not saved and does not affect anything else.

**How.**
- `placePollen(arena, dir, headroom, crossing, rng) → { x, y }[]` and
  `collectPollen(bee, grains) → { left, taken }` in `bounce.ts`.
- Call `placePollen` wherever doors are placed for a new crossing (`turn`, `enterRoom`); call
  `collectPollen` after each `step`. Draw grains as small `--accent` circles with a slow bob.
  On pickup: the blip from D, a few particles, and `onPollen()` up to `BusyBee` for the count.
- Setting both chances to 0 switches the feature off with no other change.
- Update the README sentence that says the games "show only a count of right and wrong answers".

**Tests.** No grains in the first three crossings; all grains inside the allowed band for both
directions and for heights 400–900 px; same grains whichever door is correct for the same rng;
`collectPollen` takes a grain the bee overlaps and leaves one it does not.

**Done when.** Pollen appears from the fourth crossing, can be picked up or ignored, and the count
shows in the header and the summary.

**Judge it by playing.** If reaching for pollen makes the words harder to read, lower the chances
or drop the feature; A–D stand without it.

## Order, commits, checks

One commit per step, in the order 0, A, B, C, D, E, each leaving `npm test` and `npm run build`
green. Update `README.md` (the Busy bee sentence in the feature list) at the end, and the game's
description in `src/components/Games.tsx` if "bounces between two walls" no longer fits.

**Verification after each step.**
1. `npm test` and `npm run build`.
2. Play it automatically: `npm run dev`, open the app with Playwright at 390×844, go to
   Games → Busy bee, and fly the bee from `window.__bee.state` (press the arena when the bee is
   below the middle of the door to aim for; the door for the answer is the one whose `option`
   matches the index of `answer` in `options`). Check: a run of right answers advances rooms and
   raises the right count; two deliberate bumps raise the wrong count; a run of nine shows three
   doors; pollen count rises when a grain is flown through. Extend `__bee.state` with `run`,
   `room`, `bumps`, `camera`, `doors` and `pollen` as each step lands.
3. Screenshots in light and dark, and at a short height (about 560 px tall) to confirm two doors
   and the prompt still fit.

## Decisions taken here, easy to change

- A bump resets the run (so difficulty eases) and the second one is a miss; the alternative is a
  time or speed penalty instead of a miss.
- Sound is on by default with a toggle; flip the default in `emptyData` if it should start silent.
- Pollen is a session-only count. If lives or a best score are added later, pollen can become
  bonus points there.
