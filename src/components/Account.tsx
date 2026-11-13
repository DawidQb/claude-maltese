import { useState, type FormEvent } from 'react';
import type { Account as AccountState } from '../lib/account';

const STATUS_TEXT: Record<AccountState['status'], string> = {
  idle: '',
  syncing: 'Syncing…',
  synced: 'Up to date',
  offline: 'Offline: changes will sync when you are back online',
  error: 'Sync failed',
};

function timeOf(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Sign in with an emailed code to keep progress in step across devices. */
export function Account({ account }: { account: AccountState }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!account.ready) return <p className="muted">Checking sign-in…</p>;

  const attempt = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error && e.message ? `${failure} ${e.message}` : failure);
    } finally {
      setBusy(false);
    }
  };

  if (account.email) {
    const status = STATUS_TEXT[account.status];
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
          <button className="btn btn-secondary" disabled={busy} onClick={() => void attempt(account.signOut, 'Could not sign out.')}>
            Sign out
          </button>
        </div>
        <p className="status" role="status">
          {message ??
            [status, account.status === 'error' && account.error, account.lastSynced && `last synced ${timeOf(account.lastSynced)}`]
              .filter(Boolean)
              .join(' · ')}
        </p>
      </>
    );
  }

  const send = (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    void attempt(async () => {
      await account.sendCode(address);
      setSentTo(address);
      setCode('');
    }, 'Could not send the email.');
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void attempt(() => account.verifyCode(sentTo!, code.trim()), 'That code did not work.');
  };

  if (sentTo) {
    return (
      <form onSubmit={verify}>
        <p className="muted">
          We emailed <strong>{sentTo}</strong>. Type the code from the email here, or open its link in this browser.
        </p>
        <label className="field">
          <span>Code</span>
          <input
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy || code.length < 6}>
            Sign in
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setSentTo(null)}>
            Use another email
          </button>
        </div>
        <p className="status" role="status">
          {message}
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={send}>
      <p className="muted">
        Sign in to keep your progress in step on every device. Progress already on this device is kept and added to your
        account.
      </p>
      <label className="field">
        <span>Email</span>
        <input
          className="input"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}>
          Email me a code
        </button>
      </div>
      <p className="status" role="status">
        {message}
      </p>
    </form>
  );
}
