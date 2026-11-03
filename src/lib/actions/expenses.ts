'use server';
import { isIsoDate } from '../dates';
import { EXPENSE_CATEGORIES } from '../types';
import { numVal, oneOf, str, uuid } from '../validate';
import { run, unwrap } from './_run';

export async function addExpense(form: FormData) {
  return run(async (ctx, sb) => {
    const spent = String(form.get('spent_on') ?? '');
    unwrap(await sb.from('expenses').insert({
      business_id: ctx.business.id,
      category: oneOf(form.get('category'), EXPENSE_CATEGORIES),
      amount: numVal(form.get('amount'), { min: 0.01, max: 1e10 }),
      note: str(form.get('note'), { max: 500, optional: true }) || null,
      spent_on: isIsoDate(spent) && spent <= ctx.today ? spent : ctx.today,
    }));
  }, (ctx) => ctx.t.expenses.recorded);
}

export async function deleteExpense(id: string) {
  return run(async (ctx, sb) => {
    const res = await sb.from('expenses').delete().eq('id', uuid(id)).eq('business_id', ctx.business.id).select('id');
    if (!unwrap<{ id: string }[] | null>(res)?.length) throw new Error('forbidden');
  });
}
