import { useEffect, useRef, useState } from 'react';
import { fetchDeck, saveCachedDeck } from './deck';
import type { Update } from './store';
import { accountsEnabled, getClient } from './supabase';
import { ALL_TOPICS, DECK, setDeck, wordsInTopic, type RawTopic } from './words';

/** Checks the database for a newer deck at most this often while the app stays open. */
const RECHECK_MS = 10 * 60 * 1000;

/**
 * Keeps the deck in step with the database. A newer deck is saved for the next start at
 * once, and switched to as soon as `canApply` is true (not in the middle of a session or game).
 */
export function useDeck(canApply: boolean, update: Update): number {
  const [pending, setPending] = useState<RawTopic[] | null>(null);
  const [version, setVersion] = useState(0);
  const lastCheck = useRef(0);

  useEffect(() => {
    if (!accountsEnabled) return;
    // A download finishing after unmount still saves the deck for the next start, so it is not cancelled.
    const check = async () => {
      if (Date.now() - lastCheck.current < RECHECK_MS) return;
      lastCheck.current = Date.now();
      try {
        const deck = await fetchDeck(await getClient());
        if (!deck || JSON.stringify(deck) === JSON.stringify(DECK)) return;
        saveCachedDeck(deck);
        setPending(deck);
      } catch {
        // Offline or the database is unreachable: keep the deck we have.
        lastCheck.current = 0;
      }
    };
    void check();
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!pending || !canApply) return;
    setDeck(pending);
    setPending(null);
    setVersion((v) => v + 1);
    // The chosen topic may have been renamed, removed or emptied.
    update((d) =>
      d.settings.topic === ALL_TOPICS || wordsInTopic(d.settings.topic, d.settings).length > 0
        ? d
        : { ...d, settings: { ...d.settings, topic: ALL_TOPICS } },
    );
  }, [pending, canApply, update]);

  return version;
}
