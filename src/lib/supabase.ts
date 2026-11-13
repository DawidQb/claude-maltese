import type { SupabaseClient } from '@supabase/supabase-js';
import type { RemoteApi, Row } from './sync';

// Both values (the project URL and its publishable key) are public by design: they end up
// in the browser either way, and the row-level security rules in supabase/migrations keep
// each account's progress private and the deck read-only. Never put a secret or
// service_role key here.
export const SUPABASE_URL = 'https://xxygzmaesmsgxjwqbuab.supabase.co';
export const SUPABASE_KEY: string = 'sb_publishable_CIrCOfHRUkVCrhJmQvYclQ_MVciSjVL';

/** With the key left empty the app works without accounts and with the shipped deck only. */
export const accountsEnabled = SUPABASE_KEY !== '';

let client: Promise<SupabaseClient> | null = null;

/** The client library is loaded on demand, so it never delays the first screen. */
export function getClient(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  );
  return client;
}

export function remoteFor(supabase: SupabaseClient, userId: string): RemoteApi {
  const table = () => supabase.from('progress');
  return {
    async load() {
      const { data, error } = await table().select('data, version, generation').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
    async create(data, generation) {
      const { error } = await table().insert({ user_id: userId, data, version: 1, generation });
      if (error?.code === '23505') return false; // Another device created the row first.
      if (error) throw error;
      return true;
    },
    async save(data, version, generation) {
      const { data: rows, error } = await table()
        .update({ data, version: version + 1, generation })
        .eq('user_id', userId)
        .eq('version', version)
        .select('version');
      if (error) throw error;
      return rows.length === 1;
    },
  };
}
