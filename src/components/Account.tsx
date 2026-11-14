import { useState, type FormEvent } from 'react';
import type { Account as AccountState } from '../lib/account';

const STATUS_TEXT: Record<AccountState['status'], string> = {
  idle: '',
  syncing: 'Syncing…',
  synced: 'Up to date',
  offline: 'Offline: changes will sync when you are back online',
  error: 'Sync failed',
};

/** Asked for when a new password is chosen. Supabase's own minimum is 6; set the same or higher under Authentication → Sign In / Providers → Email. */
export const MIN_PASSWORD = 8;

type Mode = 'signin' | 'reset';

function timeOf(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Email and password accounts. Passwords live only in this component's state while a form is
 * filled in, are sent to Supabase Auth over HTTPS, and are cleared as soon as they are used.
 * The autocomplete hints let the browser's password manager offer and save strong passwords.
 */
export function Account({ account }: { account: AccountState }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!account.ready) return <p className="muted">Checking sign-in…</p>;

  const clearPasswords = () => {
    setPassword('');
    setRepeat('');
  };

  const switchTo = (next: Mode) => {
    clearPasswords();
    setMessage(null);
    setMode(next);
  };

  const attempt = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await action());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      clearPasswords();
      setBusy(false);
    }
  };

  const mismatch = repeat !== '' && repeat !== password;
  const status = <p className="status" role="status">{message}</p>;

  // Opened from a password-reset email: the link has signed this device in, so ask for the new password.
  if (account.recovering) {
    const save = (e: FormEvent) => {
      e.preventDefault();
      if (mismatch) return;
      void attempt(async () => {
        await account.setPassword(password);
        return 'Password changed.';
      });
    };
    return (
      <form onSubmit={save}>
        <p className="muted">Choose a new password for {account.email ?? 'your account'}.</p>
        <PasswordField label="New password" value={password} onChange={setPassword} isNew />
        <PasswordField label="Repeat new password" value={repeat} onChange={setRepeat} isNew />
        {mismatch && <p className="status">The passwords differ.</p>}
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy || password.length < MIN_PASSWORD || repeat !== password}>
            Save password
          </button>
        </div>
        {status}
      </form>
    );
  }

  if (account.email) {
    const syncText = STATUS_TEXT[account.status];
    return (
      <>
        <p className="muted">
          Signed in as <strong>{account.email}</strong>. Progress syncs to your account by itself; settings stay on each
          device.
        </p>
        <div className="row">
          <button className="btn btn-secondary" onClick={account.syncNow} disabled={account.status === 'syncing'}>
            Sync now
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() =>
              void attempt(async () => {
                await account.signOut();
                return null;
              })
            }
          >
            Sign out
          </button>
        </div>
        <p className="status" role="status">
          {message ??
            [syncText, account.status === 'error' && account.error, account.lastSynced && `last synced ${timeOf(account.lastSynced)}`]
              .filter(Boolean)
              .join(' · ')}
        </p>
      </>
    );
  }

  const address = email.trim();
  const emailField = (
    <label className="field">
      <span>Email</span>
      <input
        className="input"
        type="email"
        name="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </label>
  );

  if (mode === 'reset') {
    const send = (e: FormEvent) => {
      e.preventDefault();
      void attempt(async () => {
        await account.sendPasswordReset(address);
        return 'If that address has an account, we have emailed it a link. Open it in this browser to choose a new password.';
      });
    };
    return (
      <form onSubmit={send}>
        <p className="muted">We will email you a link to choose a new password.</p>
        {emailField}
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy || !address}>
            Email me a link
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => switchTo('signin')}>
            Back
          </button>
        </div>
        {status}
      </form>
    );
  }

  const signIn = (e: FormEvent) => {
    e.preventDefault();
    void attempt(async () => {
      await account.signIn(address, password);
      return null;
    });
  };
  return (
    <form onSubmit={signIn}>
      <p className="muted">
        Sign in to keep your progress in step on every device. Sign-in is only for people the app's owner has added by
        hand; there is no sign-up.
      </p>
      {emailField}
      <PasswordField label="Password" value={password} onChange={setPassword} />
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy || !address || !password}>
          Sign in
        </button>
      </div>
      <div className="row">
        <button className="btn btn-ghost btn-small" type="button" onClick={() => switchTo('reset')}>
          Forgot password?
        </button>
      </div>
      {status}
    </form>
  );
}

function PasswordField(props: { label: string; value: string; onChange: (v: string) => void; isNew?: boolean }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        className="input"
        type="password"
        name={props.isNew ? 'new-password' : 'password'}
        autoComplete={props.isNew ? 'new-password' : 'current-password'}
        minLength={props.isNew ? MIN_PASSWORD : undefined}
        required
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
