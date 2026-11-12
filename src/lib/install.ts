import { useSyncExternalStore } from 'react';

/** Chrome's install prompt event; not in the standard DOM types. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

let promptEvent: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  // Captured at load: the browser fires this once, before any screen is open.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptEvent = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    promptEvent = null;
    notify();
  });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Returns a function that opens the browser's install dialog, or null if it is not on offer. */
export function useInstallPrompt(): (() => void) | null {
  const event = useSyncExternalStore(subscribe, () => promptEvent);
  if (!event) return null;
  return () => {
    void event.prompt();
    promptEvent = null;
    notify();
  };
}

export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is optional; the app works without it.
    });
  });
}

/** Asks the browser not to evict saved progress when storage runs low. */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    // Not supported: nothing to do.
  }
}
