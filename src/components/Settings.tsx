import { useRef, useState } from 'react';
import type { Account as AccountState } from '../lib/account';
import { isInstalled, useInstallPrompt } from '../lib/install';
import { toISODate } from '../lib/srs';
import { emptyData, sanitize, type AppData, type ShowLang, type Update } from '../lib/store';
import { ALL_TOPICS, SOURCE, TARGET, wordsInTopic, type Include } from '../lib/words';
import { Account } from './Account';

const SHOW_OPTIONS: { value: ShowLang; label: string }[] = [
  { value: 'both', label: 'Polish + English' },
  { value: 'pl', label: 'Polish only' },
  { value: 'en', label: 'English only' },
];

const NEW_PER_DAY = [0, 5, 10, 15, 20, 30];

export function Settings({ data, update, account }: { data: AppData; update: Update; account: AccountState }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const learned = Object.keys(data.cards).length;
  const install = useInstallPrompt();
  const [installed] = useState(isInstalled);
  const signedIn = account.email !== null;

  /** Switches a kind of card on or off. If that empties the chosen topic, falls back to all topics. */
  const include = (patch: Include) =>
    update((d) => {
      const settings = { ...d.settings, ...patch };
      if (wordsInTopic(settings.topic, settings).length === 0) settings.topic = ALL_TOPICS;
      return { ...d, settings };
    });

  const exportProgress = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nahla-progress-${toISODate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Progress file downloaded.');
  };

  const importProgress = async (file: File) => {
    try {
      const parsed = sanitize(JSON.parse(await file.text()));
      if (!parsed) throw new Error('not app data');
      update(() => parsed);
      account.replace(parsed);
      setMessage(`Imported progress for ${Object.keys(parsed.cards).length} cards.`);
    } catch {
      setMessage('That file is not a Naħla progress export.');
    }
  };

  const reset = () => {
    const where = signedIn ? 'on every device signed in to your account' : 'in both directions';
    if (!window.confirm(`Delete all progress ${where}? This cannot be undone.`)) return;
    update((d) => ({ ...emptyData(), settings: d.settings }));
    account.replace(emptyData());
    setMessage('Progress reset.');
  };

  return (
    <div className="stack">
      {account.enabled && (
        <section>
          <h2 className="eyebrow">Account</h2>
          <div className="panel">
            <Account account={account} />
          </div>
        </section>
      )}

      <section>
        <h2 className="eyebrow">Cards</h2>
        <div className="panel">
          <label className="switch">
            <span>
              Learn English
              <small>Study the English words through Polish instead of Maltese. Each language keeps its own progress.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={data.settings.learn === 'en'}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, learn: e.target.checked ? 'en' : 'mt' } }))}
            />
          </label>
          {data.settings.learn === 'mt' && (
            <label className="field">
              <span>Translations shown</span>
              <select
                className="input"
                value={data.settings.show}
                onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, show: e.target.value as ShowLang } }))}
              >
                {SHOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>New words per day</span>
            <select
              className="input"
              value={data.settings.newPerDay}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, newPerDay: Number(e.target.value) } }))}
            >
              {NEW_PER_DAY.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="switch">
            <span>
              Plural forms
              <small>Study the plural of each noun as a card of its own</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={data.settings.plurals}
              onChange={(e) => include({ plurals: e.target.checked })}
            />
          </label>
          <label className="switch">
            <span>
              Verb forms
              <small>Study conjugated forms such as “he eats” and “we danced”</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={data.settings.verbForms}
              onChange={(e) => include({ verbForms: e.target.checked })}
            />
          </label>
          <label className="switch">
            <span>
              Type the answer
              <small>In {SOURCE} → {TARGET}, spell the word on a letter pad instead of flipping the card</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={data.settings.typing}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, typing: e.target.checked } }))}
            />
          </label>
          <label className="switch">
            <span>
              Check automatically
              <small>On the letter pad, accept a correctly spelled word at once, without a tap on Check</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={data.settings.autoCheck}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, autoCheck: e.target.checked } }))}
            />
          </label>
          <label className="switch">
            <span>
              Sound in games
              <small>Chimes, zaps, knocks and vibration in the games</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={data.settings.sound}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, sound: e.target.checked } }))}
            />
          </label>
        </div>
      </section>

      <section>
        <h2 className="eyebrow">App</h2>
        <div className="panel">
          <label className="switch">
            <span>
              Beeeeeeeeeeeees!
              <small>Lots of bees flying about in the background. They keep still if your device asks for less motion.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={data.settings.bees}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, bees: e.target.checked } }))}
            />
          </label>
          {installed ? (
            <p className="muted">Naħla is installed on this device and works without a connection.</p>
          ) : (
            <>
              <p className="muted">
                Install Naħla to open it from your home screen and study without a connection.
              </p>
              {install ? (
                <div className="row">
                  <button className="btn btn-secondary" onClick={install}>
                    Install app
                  </button>
                </div>
              ) : (
                <ul className="steps">
                  <li>
                    <strong>iPhone / iPad:</strong> in Safari tap Share, then “Add to Home Screen”. The installed app starts
                    with empty progress, so export here first and import there.
                  </li>
                  <li>
                    <strong>Android / computer:</strong> open the browser menu and choose “Install app” or “Add to Home
                    screen”.
                  </li>
                </ul>
              )}
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="eyebrow">Progress</h2>
        <div className="panel">
          <p className="muted">
            {signedIn
              ? `Progress is saved on this device and in your account (${learned} ${learned === 1 ? 'card' : 'cards'} so far). Import and Reset change it on every device.`
              : `Progress is saved in this browser only (${learned} ${learned === 1 ? 'card' : 'cards'} so far). ${account.enabled ? 'Sign in above, or export it,' : 'Export it'} to move to another device.`}
          </p>
          <div className="row">
            <button className="btn btn-secondary" onClick={exportProgress}>
              Export
            </button>
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              Import
            </button>
            <button className="btn btn-danger" onClick={reset}>
              Reset
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importProgress(file);
              e.target.value = '';
            }}
          />
          <p className="status" role="status">
            {message}
          </p>
        </div>
      </section>
    </div>
  );
}
