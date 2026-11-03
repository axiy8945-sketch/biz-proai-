'use server';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../supabase/admin';
import { PERMISSIONS, type Permissions } from '../types';
import { bool, email, str, uuid } from '../validate';
import { run, unwrap } from './_run';

function permsFrom(form: FormData): Permissions {
  return Object.fromEntries(PERMISSIONS.map((p) => [p, bool(form.get(`perm_${p}`))])) as Permissions;
}

/** Owner creates an employee login. The temporary password is shown once to the owner. */
export async function addEmployee(form: FormData) {
  return run(async (ctx, sb) => {
    if (!ctx.isOwner) throw new Error('owner_only');
    const admin = supabaseAdmin();
    if (!admin) throw new Error('msg:' + ctx.t.emp.serviceKeyMissing);
    const mail = email(form.get('email'));
    const fullName = str(form.get('full_name'), { max: 120 });
    const password = str(form.get('password'), { optional: true, max: 72 }) || randomBytes(6).toString('base64url');
    if (password.length < 8) throw new Error('invalid_amount');
    const created = await admin.auth.admin.createUser({ email: mail, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (created.error || !created.data.user) throw new Error(/registered|exists/i.test(created.error?.message ?? '') ? 'duplicate key' : 'generic');
    unwrap(await sb.rpc('add_member', {
      p_business: ctx.business.id, p_user: created.data.user.id, p_full_name: fullName,
      p_phone: str(form.get('phone'), { max: 40, optional: true }) || null, p_permissions: permsFrom(form),
    }));
    return { email: mail, password };
  }, (ctx) => ctx.t.emp.created);
}

export async function updateEmployee(memberId: string, form: FormData) {
  return run(async (ctx, sb) => {
    if (!ctx.isOwner) throw new Error('owner_only');
    unwrap(await sb.rpc('update_member', {
      p_member: uuid(memberId), p_permissions: permsFrom(form), p_active: form.get('active') === null ? null : bool(form.get('active')),
      p_full_name: str(form.get('full_name'), { max: 120, optional: true }) || null, p_phone: str(form.get('phone'), { max: 40, optional: true }) || null,
    }));
  }, (ctx) => ctx.t.common.saved);
}

export async function setEmployeeActive(memberId: string, active: boolean) {
  return run(async (ctx, sb) => {
    if (!ctx.isOwner) throw new Error('owner_only');
    unwrap(await sb.rpc('update_member', { p_member: uuid(memberId), p_permissions: null, p_active: active }));
  });
}
