import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeData, progressKey, sameProgress, takeProgress } from './merge';
import type { AppData, Update } from './store';
import { accountsEnabled, getClient, remoteFor } from './supabase';
import { syncOnce, type SyncMeta } from './sync';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface Account {
  enabled: boolean;
  /** The saved sign-in has been checked. */
  ready: boolean;
  email: string | null;
  status: SyncStatus;
  lastSynced: Date | null;
  error: string | null;
  /** True after opening a password-reset link: the app should ask for a new password. */
  recovering: boolean;
  signIn(email: string, password: string): Promise<void>;
  /** Emails a link that opens the app ready to set a new password. */
  sendPasswordReset(email: string): Promise<void>;
  setPassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  syncNow(): void;
  /** Makes `data` the account's progress on every device (Reset and Import). */
  replace(data: AppData): void;
}

const META_KEY = 'nahla:sync';
/** Waits this long after the last answer before saving, so a study session is one save, not dozens. */
const SAVE_DELAY_MS = 3000;

function loadMeta(): SyncMeta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as Partial<SyncMeta> | null;
    if (m && (typeof m.userId === 'string' || m.userId === null) && typeof m.generation === 'number') {
      return { userId: m.userId, generation: m.generation };
    }
  } catch {
    // Unreadable: treat this device as never synced.
  }
  return { userId: null, generation: 0 };
}

function saveMeta(meta: SyncMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Without storage the next sync merges again, which is safe.
  }
}

/** Where links in emails lead back to: this page, without any query or hash. */
function appUrl(): string {
  return window.location.origin + window.location.pathname;
}

/** Supabase's error in words for the app. Never names whether an account exists. */
export function authMessage(e: { code?: string; message?: string }): string {
  switch (e.code) {
    case 'invalid_credentials':
      return 'Wrong email or password.';
    case 'email_not_confirmed':
      return 'Confirm your email address first: open the link in the email we sent you.';
    case 'weak_password':
      return e.message || 'Choose a stronger password.';
    case 'same_password':
      return 'The new password must differ from the old one.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a few minutes and try again.';
    default:
      return e.message || 'Something went wrong. Try again.';
  }
}

interface User {
  id: string;
  email: string | null;
}

export function useAccount(data: AppData, update: Update): Account {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!accountsEnabled);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);

  const dataRef = useRef(data);
  dataRef.current = data;
  const userRef = useRef(user);
  userRef.current = user;
  /** Syncs run one at a time, in order. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  /** Bumped by replace(), so a merge already under way does not bring old cards back. */
  const epoch = useRef(0);
  /** The progress last seen in the account; local changes beyond it need saving. */
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
    if (!accountsEnabled) return;
    let unsubscribe = () => {};
    let cancelled = false;
    void getClient().then(async (supabase) => {
      const toUser = (u: { id: string; email?: string } | undefined) => (u ? { id: u.id, email: u.email ?? null } : null);
      const { data: auth } = await supabase.auth.getSession();
      if (cancelled) return;
      setUser(toUser(auth.session?.user));
      setReady(true);
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') setRecovering(true);
        if (event === 'SIGNED_OUT') setRecovering(false);
        const next = toUser(session?.user);
        setUser((prev) => (prev?.id === next?.id && prev?.email === next?.email ? prev : next));
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const run = useCallback(
    (mode: 'merge' | 'replace', payload?: AppData) => {
      if (mode === 'replace') epoch.current++;
      const task = queue.current.then(async () => {
        const current = userRef.current;
        if (!current) return;
        const startEpoch = epoch.current;
        setStatus('syncing');
        try {
          const supabase = await getClient();
          const local = payload ?? dataRef.current;
          const result = await syncOnce(remoteFor(supabase, current.id), local, loadMeta(), current.id, mode);
          saveMeta(result.meta);
          lastSeen.current = progressKey(result.data);
          if (mode === 'merge' && epoch.current === startEpoch) {
            update((cur) => {
              const next = result.replaceLocal ? takeProgress(cur, result.data) : mergeData(cur, result.data);
              return sameProgress(next, cur) ? cur : next;
            });
          }
          setStatus('synced');
          setLastSynced(new Date());
          setError(null);
        } catch (e) {
          if (!navigator.onLine) {
            setStatus('offline');
          } else {
            setStatus('error');
            setError(e instanceof Error ? e.message : 'Sync failed.');
          }
        }
      });
      queue.current = task;
      return task;
    },
    [update],
  );

  // Sync on sign-in, then whenever the app comes back to the screen or back online.
  useEffect(() => {
    if (!user) {
      lastSeen.current = null;
      setStatus('idle');
      return;
    }
    void run('merge');
    const onVisible = () => document.visibilityState === 'visible' && void run('merge');
    const onOnline = () => void run('merge');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [user, run]);

  // Save local progress a few seconds after it changes.
  useEffect(() => {
    if (!user || lastSeen.current === null || progressKey(data) === lastSeen.current) return;
    const timer = setTimeout(() => void run('merge'), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [data, user, run]);

  // Passwords are only passed through to Supabase Auth over HTTPS, which stores a bcrypt
  // hash. The app never saves or logs them; the browser keeps only the session tokens.
  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = await getClient();
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) throw new Error(authMessage(e));
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const supabase = await getClient();
    const { error: e } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
    if (e) throw new Error(authMessage(e));
  }, []);

  const setPassword = useCallback(async (password: string) => {
    const supabase = await getClient();
    const { error: e } = await supabase.auth.updateUser({ password });
    if (e) throw new Error(authMessage(e));
    setRecovering(false);
  }, []);

  const signOut = useCallback(async () => {
    await run('merge');
    const supabase = await getClient();
    // Only this device: other devices stay signed in. Progress stays on this device too.
    await supabase.auth.signOut({ scope: 'local' });
    setLastSynced(null);
  }, [run]);

  const syncNow = useCallback(() => void run('merge'), [run]);
  const replace = useCallback((next: AppData) => void run('replace', next), [run]);

  return {
    enabled: accountsEnabled,
    ready,
    email: user?.email ?? null,
    status,
    lastSynced,
    error,
    recovering,
    signIn,
    sendPasswordReset,
    setPassword,
    signOut,
    syncNow,
    replace,
  };
}
