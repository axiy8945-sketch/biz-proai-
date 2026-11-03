import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ALLOWED_RPC, DataError, type AllowedRpc, type DataPort } from '../ai/types';

/** The agents' only door to the database: whitelisted RPCs under the caller's session. */
export function supabaseDataPort(supabase: SupabaseClient): DataPort {
  return {
    async call<T>(fn: AllowedRpc, args: Record<string, string | number | null>): Promise<T> {
      if (!(ALLOWED_RPC as readonly string[]).includes(fn)) throw new DataError('rpc_not_allowed');
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw new DataError((error.message || 'error').split(':')[0].trim(), error.message);
      return data as T;
    },
  };
}
