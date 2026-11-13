# Naħla

Flashcards for memorising Maltese words through their Polish and English translations.
*Naħla* is Maltese for "bee".

- Two directions, each with its own progress: Maltese → Polish/English and Polish/English → Maltese.
- Spaced repetition: words you know come back after 1, 3, 7, 14 and then 30 days; words you miss come back the same session.
- 713 words in 16 topics. Study everything or one topic at a time.
- 189 plural forms of nouns and 327 conjugated verb forms ("he eats", "we danced") as cards of their own; each kind can be switched off in Settings.
- Typing mode (Polish/English → Maltese): spell the Maltese word on a ten-letter pad, so the phone keyboard is not needed. The pad holds the word's letters plus look-alike decoys such as h for ħ, and grows by a row when a word has more than ten different letters. A correct spelling is accepted at once (this can be switched off in Settings). Wrong special letters or a single typo count as "almost".
- Nine practice games that never change the review schedule and show only a count of right and wrong answers (plus, in Bouncy bee, the pollen picked up, in Protect the hive, the honey left and the wave, and in Queen's orders, which verb of four): Bouncy bee (tap or hold to keep a bee in the air and fly it through the door with the right answer into the next room; a wrong door, or a second bump into the wall, sends it back, and the doors get narrower and the wrong answers more alike as a run of right answers grows), Protect the hive (words creep down towards the hive in waves; tap a word and its answer in the tray below and the bee zaps it with its laser eyes; a wrong pair brings every word closer, a word that reaches the hive costs one of three cells of honey, each wave brings more words, and every third wave ends with a hornet that takes two hits, showing a second word, often the plural, after the first), Queen's orders (the queen asks for a form of a verb by its meaning, such as "jedliśmy / we ate", and four workers walk up to her, each carrying a Maltese form of that verb; tap the one with the right form before they arrive; a run is four verbs of five orders each, the verb's forms are shown as a table after each verb with the misses marked, and the walk gets shorter and the wrong forms more alike as a run of right answers grows), infinite typing (an endless random stream of the whole deck, spelled on a ten-letter pad so the phone keyboard is not needed; missed words return later, at most one turn in four), Honeycomb spell (the Maltese word is hidden in a comb of nineteen letters, each next to the one before; trace it with a finger or by taps; three wrong traces and the comb shows where it was, and as a run of right answers grows the other letters become look-alikes and the first letter is no longer marked), Spider web (a bee is stuck in a web: guess the letters of the Maltese word on a pad of the whole alphabet before the spider comes down its thread; every wrong letter is a step, six at first and fewer as a run of freed bees grows, and look-alikes such as h for ħ count as wrong), match pairs (untimed), True or sting (thirty seconds as the guard of the hive: a Maltese word and a meaning arrive together; let it in with a swipe right, → or the right-hand button if they belong together, sting it the other way if not; a wrong call shows the real meaning and costs two seconds, and as a run of right calls grows the false meanings come from look-alike words and then from the word's own plural or other verb forms) and a 60-second speed round with four answer choices. Bouncy bee, Protect the hive and the speed round follow the direction chosen on the Games tab, which is separate from the Study direction; Queen's orders always asks Polish/English → Maltese and takes its verbs from the whole deck.
- Beeeeeeeeeeeees! (Settings → App): switch on a swarm of bees flying about behind the whole app. They keep still on devices set to reduce motion.
- Installable and usable offline: add it to your home screen from the browser.
- Progress lives in the browser's local storage, so the app works without a connection or an account. Sign in (Settings → Account) to keep progress in step on every device, or use Settings → Export / Import to move it by hand.

## Develop

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run build    # type-check and build to dist/
```

## Edit the words

The deck lives in the Supabase database, in the `topics` and `words` tables. Edit it in
the Supabase dashboard (Table Editor or SQL Editor); the app has no write access to it.
Every device downloads the deck when the app starts (and again when it comes back to the
screen after ten minutes), keeps a copy for offline use, and switches to it once no study
session or game is running.

- `topics`: `name`, an optional `note` shown with its words, and `position` (ascending).
- `words`: `topic_id`, `mt` (Maltese), `pl`, `en`, and `position` within the topic.
  - A plural form is a row of its own with `plural_of` set to the Maltese singular. It is
    shown right after the singular, in the singular's topic.
  - A conjugated verb form has `form_of` set to the verb's dictionary form, itself a row.

The Maltese word is the key for saved progress, so changing its spelling resets progress
for that word (plurals and verb forms pointing at it follow the change); moving a word to
another topic does not. No Maltese word or Polish or English translation may appear twice,
so every question has one answer: the database refuses duplicates, and the app also drops
any row it cannot use.

`src/data/words.json` is the deck the app ships with. It is used until the first download
succeeds, without a Supabase key, and by the tests. It holds a list of topics, each with
rows of `[Maltese, Polish, English]`; a noun can carry its plural as a fourth item, itself a
`[Maltese, Polish, English]` row, and a conjugated verb form names its verb as the fourth
item instead:

```json
["ktieb", "książka", "book", ["kotba", "książki", "books"]]
["żfinna", "tańczyliśmy", "we danced", "żifen"]
```

`node scripts/words-to-sql.mjs` turns it into the seed migration that fills an empty database.

## Accounts and sync (Supabase)

The project holds three things: accounts (Supabase Auth), each account's progress, and the
word deck (see above). Signing in is optional. Accounts use an email address and a password (Supabase Auth, which
stores only a bcrypt hash; the app never saves or logs passwords, and the browser keeps only
the session tokens). A new account confirms its address through a link in an email, and a
forgotten password is reset the same way. Each account's progress is one row of the
`progress` table.
Settings are not synced; each device keeps its own.

- Every device keeps working from local storage and syncs on sign-in, a few seconds after
  each answer, when the app comes back to the screen, and when the connection returns.
- Two copies are merged card by card, keeping the later due date (a review always moves
  it past today), so merging is order-free and nothing answered on either device is lost.
  Writes check a version number, so two devices saving at once retry instead of
  overwriting each other.
- Reset and Import replace the account's progress and bump its `generation`; other devices
  then take the account's copy instead of merging their old cards back in.
- The merge and sync logic is in `src/lib/merge.ts` and `src/lib/sync.ts`, and the deck
  download in `src/lib/deck.ts` (all tested without a network); `src/lib/supabase.ts` holds
  the project URL and key; `src/lib/account.ts` and `src/lib/useDeck.ts` are the React hooks.

Setting up a Supabase project:

1. SQL Editor: run the three files in `supabase/migrations` once each, in name order:
   the progress table, the word tables, then the seed that loads the shipped deck.
2. Authentication → URL Configuration: set Site URL to the GitHub Pages address and add it,
   plus `http://localhost:5173`, to Redirect URLs.
3. Authentication → Sign In / Providers → Email: keep "Confirm email" on, and set the
   minimum password length to at least 8 (the app asks for 8).
4. Put the project URL and its publishable key in `src/lib/supabase.ts`. Both are public;
   row-level security keeps each account's row private and the deck read-only. Never put a
   secret or `service_role` key in the app. With the key left empty, the Account section is
   hidden and the app uses the shipped deck.

## Offline support

`vite.config.ts` emits `sw.js` from `src/sw.template.js` at build time, listing every built
file so the whole app is saved on the first visit. Each build gets a new cache name, and old
caches are removed when the new version takes over.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes
to GitHub Pages. Pages must be switched on once in the repository settings:
Settings → Pages → Source: **GitHub Actions**.
