import 'server-only';
import { getAppContext, type AppContext } from '../context';
import { errorMessage, type ActionResult } from '../errors';
import { dict } from '../i18n';
import { supabaseServer } from '../supabase/server';
import { InvalidInput } from '../validate';

type Supa = Awaited<ReturnType<typeof supabaseServer>>;

/** Wraps a mutation: loads context, validates, maps DB errors to localized messages. */
export async function run<T>(fn: (ctx: AppContext, supabase: Supa) => Promise<T>, okMessage?: (ctx: AppContext) => string): Promise<ActionResult<T>> {
  let ctx: AppContext | null = null;
  try {
    ctx = await getAppContext();
    const supabase = await supabaseServer();
    const data = await fn(ctx, supabase);
    return { ok: true, data, message: okMessage?.(ctx) };
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_REDIRECT')) throw e;
    const t = ctx?.t ?? dict('ky');
    if (e instanceof InvalidInput) return { ok: false, error: e.message === 'invalid_amount' ? t.errors.invalid_amount : t.common.required };
    return { ok: false, error: errorMessage(t, e) };
  }
}

export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
