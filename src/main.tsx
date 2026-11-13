import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadCachedDeck } from './lib/deck';
import { registerServiceWorker } from './lib/install';
import { setDeck } from './lib/words';
import './styles.css';

// Start with the deck downloaded last time, if any, before saved progress is read.
const cached = loadCachedDeck();
if (cached) setDeck(cached);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
