# Naħla

Flashcards for memorising Maltese words through their Polish and English translations.
*Naħla* is Maltese for "bee".

- Two directions, each with its own progress: Maltese → Polish/English and Polish/English → Maltese.
- Spaced repetition: words you know come back after 1, 3, 7, 14 and then 30 days; words you miss come back the same session.
- 713 words in 16 topics. Study everything or one topic at a time.
- 189 plural forms of nouns and 327 conjugated verb forms ("he eats", "we danced") as cards of their own; each kind can be switched off in Settings.
- Typing mode (Polish/English → Maltese): spell the Maltese word on a ten-letter pad, so the phone keyboard is not needed. The pad holds the word's letters plus look-alike decoys such as h for ħ, and grows by a row for long words. A correct spelling is accepted at once (this can be switched off in Settings). Wrong special letters or a single typo count as "almost".
- Four practice games that never change the review schedule and show only a count of right and wrong answers: Busy bee (tap to keep a bee flying between two walls and steer it through the door with the right answer), infinite typing (an endless random stream of the whole deck, spelled on a ten-letter pad so the phone keyboard is not needed; missed words return later, at most one turn in four), match pairs (untimed) and a 60-second speed round with four answer choices.
- Installable and usable offline: add it to your home screen from the browser.
- Progress lives in the browser's local storage. Use Settings → Export / Import to move it between devices.

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

## Offline support

`vite.config.ts` emits `sw.js` from `src/sw.template.js` at build time, listing every built
file so the whole app is saved on the first visit. Each build gets a new cache name, and old
caches are removed when the new version takes over.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes
to GitHub Pages. Pages must be switched on once in the repository settings:
Settings → Pages → Source: **GitHub Actions**.
