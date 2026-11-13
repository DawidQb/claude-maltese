import { describe, expect, it } from 'vitest';
import { progressOf } from './merge';
import { emptyData, recordAnswer, type AppData } from './store';
import { syncOnce, type RemoteApi, type Row } from './sync';

const TODAY = '2026-03-10';
const USER = 'user-a';

/** An in-memory account. `interfere` runs once before the first write, as another device would. */
function fakeRemote(initial: Row | null, interfere?: (row: Row | null) => Row) {
  const remote = { row: initial, writes: 0 };
  let pending = interfere;
  const collide = () => {
    if (!pending) return false;
    remote.row = pending(remote.row);
    pending = undefined;
    return true;
  };
  const api: RemoteApi = {
    load: async () => (remote.row ? structuredClone(remote.row) : null),
    create: async (data, generation) => {
      if (collide() || remote.row) return false;
      remote.row = { data: structuredClone(data), version: 1, generation };
      remote.writes++;
      return true;
    },
    save: async (data, version, generation) => {
      if (collide() || !remote.row || remote.row.version !== version) return false;
      remote.row = { data: structuredClone(data), version: version + 1, generation };
      remote.writes++;
      return true;
    },
  };
  return { api, remote };
}

const row = (data: AppData, version = 1, generation = 0): Row => ({ data: progressOf(data), version, generation });
const answered = (word: string, base = emptyData()) => recordAnswer(base, 'mt2x', word, 'knew', TODAY);

describe('syncOnce', () => {
  it('uploads this device on the first sign-in to an empty account', async () => {
    const local = answered('ħobż');
    const { api, remote } = fakeRemote(null);
    const out = await syncOnce(api, local, { userId: null, generation: 0 }, USER, 'merge');
    expect(out.replaceLocal).toBe(false);
    expect(out.meta).toEqual({ userId: USER, generation: 0 });
    expect(remote.row?.data).toEqual(progressOf(local));
  });

  it('merges this device into an account that already has progress', async () => {
    const { api, remote } = fakeRemote(row(answered('ilma')));
    const out = await syncOnce(api, answered('ħobż'), { userId: null, generation: 0 }, USER, 'merge');
    expect(Object.keys(out.data.cards).sort()).toEqual(['mt2x:ilma', 'mt2x:ħobż']);
    expect(remote.row?.version).toBe(2);
  });

  it('does not write when nothing changed', async () => {
    const data = answered('ħobż');
    const { api, remote } = fakeRemote(row(data));
    await syncOnce(api, data, { userId: USER, generation: 0 }, USER, 'merge');
    expect(remote.writes).toBe(0);
  });

  it('keeps settings on the device', async () => {
    const remoteData = answered('ilma');
    const local = { ...emptyData(), settings: { ...emptyData().settings, typing: true } };
    const { api, remote } = fakeRemote(row(remoteData));
    const out = await syncOnce(api, local, { userId: USER, generation: 0 }, USER, 'merge');
    expect(out.data.settings.typing).toBe(true);
    expect(remote.row?.data).not.toHaveProperty('settings');
  });

  it('takes the account as it is after a reset on another device', async () => {
    const { api } = fakeRemote(row(emptyData(), 4, 1));
    const out = await syncOnce(api, answered('ħobż'), { userId: USER, generation: 0 }, USER, 'merge');
    expect(out.replaceLocal).toBe(true);
    expect(out.data.cards).toEqual({});
    expect(out.meta.generation).toBe(1);
  });

  it('does not mix in progress left on the device by a different account', async () => {
    const { api, remote } = fakeRemote(null);
    const out = await syncOnce(api, answered('ħobż'), { userId: 'user-b', generation: 0 }, USER, 'merge');
    expect(out.replaceLocal).toBe(true);
    expect(out.data.cards).toEqual({});
    expect(remote.row?.data).toEqual(progressOf(emptyData()));
  });

  it('replace overwrites the account and bumps the generation', async () => {
    const { api, remote } = fakeRemote(row(answered('ilma'), 3, 2));
    const out = await syncOnce(api, emptyData(), { userId: USER, generation: 2 }, USER, 'replace');
    expect(remote.row).toEqual({ data: progressOf(emptyData()), version: 4, generation: 3 });
    expect(out.meta.generation).toBe(3);
  });

  it('retries and keeps both answers when another device saves at the same moment', async () => {
    const { api, remote } = fakeRemote(row(emptyData()), (r) => ({ ...r!, data: progressOf(answered('ilma')), version: r!.version + 1 }));
    const out = await syncOnce(api, answered('ħobż'), { userId: USER, generation: 0 }, USER, 'merge');
    expect(Object.keys(out.data.cards).sort()).toEqual(['mt2x:ilma', 'mt2x:ħobż']);
    expect(remote.row?.version).toBe(3);
  });
});

