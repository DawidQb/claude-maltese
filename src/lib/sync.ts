import { mergeData, progressOf, sameProgress, takeProgress } from './merge';
import { emptyData, sanitize, type AppData } from './store';

/** The account's saved progress, as stored in the `progress` table. */
export interface Row {
  data: unknown;
  /** Bumped on every write. */
  version: number;
  /** Bumped by Reset and Import. */
  generation: number;
}

/** What this device remembers about its last sync. */
export interface SyncMeta {
  /** The account this device last synced with, or null if it never has. */
  userId: string | null;
  /** The account's generation at that sync. */
  generation: number;
}

export interface RemoteApi {
  load(): Promise<Row | null>;
  /** Saves the first row. Resolves false if the account already has one. */
  create(data: unknown, generation: number): Promise<boolean>;
  /** Overwrites the row if it is still at `version`. Resolves false if another device saved first. */
  save(data: unknown, version: number, generation: number): Promise<boolean>;
}

export interface SyncResult {
  /** The progress now stored in the account. */
  data: AppData;
  /** True when this device's own progress must be dropped in favour of `data`, not merged with it. */
  replaceLocal: boolean;
  meta: SyncMeta;
}

const MAX_ATTEMPTS = 5;

/**
 * Brings this device and the account to the same progress.
 *
 * `merge` combines both copies. It takes the account's copy as it is when the account was
 * reset or imported on another device since this device last synced, or when this device
 * last synced with a different account. `replace` (Reset and Import) makes `local` the
 * account's progress and tells other devices to drop theirs.
 */
export async function syncOnce(
  api: RemoteApi,
  local: AppData,
  meta: SyncMeta,
  userId: string,
  mode: 'merge' | 'replace',
): Promise<SyncResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await api.load();
    const remote = row ? sanitize({ ...(row.data as object), settings: local.settings }) ?? emptyData() : null;

    let data: AppData;
    let replaceLocal: boolean;
    let generation = row?.generation ?? meta.generation;

    if (mode === 'replace') {
      data = local;
      replaceLocal = false;
      generation += 1;
    } else {
      const otherAccount = meta.userId !== null && meta.userId !== userId;
      const resetElsewhere = meta.userId === userId && row !== null && row.generation > meta.generation;
      replaceLocal = otherAccount || resetElsewhere;
      const base = remote ?? takeProgress(local, emptyData());
      data = replaceLocal ? base : remote ? mergeData(local, remote) : local;
    }

    const upToDate = remote !== null && row!.generation === generation && sameProgress(data, remote);
    const saved =
      upToDate ||
      (row
        ? await api.save(progressOf(data), row.version, generation)
        : await api.create(progressOf(data), generation));
    if (saved) return { data, replaceLocal, meta: { userId, generation } };
    // Another device saved in between: load its copy and try again.
  }
  throw new Error('Sync kept colliding with another device. Try again in a moment.');
}
