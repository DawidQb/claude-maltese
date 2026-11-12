# Kelma

Flashcards for memorising Maltese words through their Polish and English translations.
*Kelma* is Maltese for "word".

- Two directions, each with its own progress: Maltese → Polish/English and Polish/English → Maltese.
- Spaced repetition: words you know come back after 1, 3, 7, 14 and then 30 days; words you miss come back the same session.
- 291 seed words in 12 topics; study everything or one topic at a time.
- Typing mode (Polish/English → Maltese): write the Maltese word, with keys for ċ ġ għ ħ ż. Missing special letters or a single typo count as "almost".
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
`[Maltese, Polish, English]`. The Maltese word is the key for saved progress, so
changing its spelling resets progress for that word.

## Offline support

`vite.config.ts` emits `sw.js` from `src/sw.template.js` at build time, listing every built
file so the whole app is saved on the first visit. Each build gets a new cache name, and old
caches are removed when the new version takes over.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes
to GitHub Pages. Pages must be switched on once in the repository settings:
Settings → Pages → Source: **GitHub Actions**.
