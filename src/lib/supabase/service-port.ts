import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ALLOWED_RPC, DataError, type AllowedRpc, type DataPort } from '../ai/types';

/** Data port for scheduled jobs (service role). Still limited to the whitelisted analytics functions. */
export function serviceDataPort(admin: SupabaseClient): DataPort {
  return {
    async call<T>(fn: AllowedRpc, args: Record<string, string | number | null>): Promise<T> {
      if (!(ALLOWED_RPC as readonly string[]).includes(fn)) throw new DataError('rpc_not_allowed');
      const { data, error } = await admin.rpc(fn, args);
      if (error) throw new DataError(error.message.split(':')[0], error.message);
      return data as T;
    },
  };
}
