# Naħla

Flashcards for memorising Maltese words through their Polish and English translations.
*Naħla* is Maltese for "bee".

- Two directions, each with its own progress: Maltese → Polish/English and Polish/English → Maltese.
- Spaced repetition: words you know come back after 1, 3, 7, 14 and then 30 days; words you miss come back the same session.
- 713 words in 16 topics. Study everything or one topic at a time.
- 189 plural forms of nouns and 327 conjugated verb forms ("he eats", "we danced") as cards of their own; each kind can be switched off in Settings.
- Typing mode (Polish/English → Maltese): spell the Maltese word on a ten-letter pad, so the phone keyboard is not needed. The pad holds the word's letters plus look-alike decoys such as h for ħ, and grows by a row when a word has more than ten different letters. A correct spelling is accepted at once (this can be switched off in Settings). Wrong special letters or a single typo count as "almost".
- Four practice games that never change the review schedule and show only a count of right and wrong answers: Busy bee (tap to keep a bee flying between two walls and steer it through the door with the right answer), infinite typing (an endless random stream of the whole deck, spelled on a ten-letter pad so the phone keyboard is not needed; missed words return later, at most one turn in four), match pairs (untimed) and a 60-second speed round with four answer choices.
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

The deck is `src/data/words.json`: a list of topics, each with rows of
`[Maltese, Polish, English]`. A noun can carry its plural as a fourth item, itself a
`[Maltese, Polish, English]` row:

```json
["ktieb", "książka", "book", ["kotba", "książki", "books"]]
```

A conjugated verb form names its verb as the fourth item instead:

```json
["żfinna", "tańczyliśmy", "we danced", "żifen"]
```

The Maltese word is the key for saved progress, so changing its spelling resets progress
for that word; moving a word to another topic does not. No Polish or English translation
may appear twice in the deck (the tests check this), so every question has one answer.

## Accounts and sync (Supabase)

Signing in is optional. It uses an emailed code (or the link in the same email) through
Supabase Auth, and stores each account's progress as one row of the `progress` table.
Settings are not synced; each device keeps its own.

- Every device keeps working from local storage and syncs on sign-in, a few seconds after
  each answer, when the app comes back to the screen, and when the connection returns.
- Two copies are merged card by card, keeping the later due date (a review always moves
  it past today), so merging is order-free and nothing answered on either device is lost.
  Writes check a version number, so two devices saving at once retry instead of
  overwriting each other.
- Reset and Import replace the account's progress and bump its `generation`; other devices
  then take the account's copy instead of merging their old cards back in.
- The merge and sync logic is in `src/lib/merge.ts` and `src/lib/sync.ts` (tested without a
  network); `src/lib/supabase.ts` holds the project URL and key, and `src/lib/account.ts`
  the React hook.

Setting up a Supabase project:

1. SQL Editor: run `supabase/migrations/20261113000000_progress.sql` once.
2. Authentication → URL Configuration: set Site URL to the GitHub Pages address and add it,
   plus `http://localhost:5173`, to Redirect URLs.
3. Authentication → Email Templates → Magic Link: add `{{ .Token }}` to the message, so the
   email carries a code as well as a link. An app installed on the home screen cannot catch
   the link (it opens in the browser), so it signs in with the code.
4. Put the project URL and its anon (publishable) key in `src/lib/supabase.ts`. Both are
   public; row-level security keeps each account's row private. Never use the
   `service_role` key in the app. With the key left empty, the Account section is hidden.

## Offline support

`vite.config.ts` emits `sw.js` from `src/sw.template.js` at build time, listing every built
file so the whole app is saved on the first visit. Each build gets a new cache name, and old
caches are removed when the new version takes over.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes
to GitHub Pages. Pages must be switched on once in the repository settings:
Settings → Pages → Source: **GitHub Actions**.
