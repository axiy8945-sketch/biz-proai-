-- BizPro AI — access control: helper functions, audit triggers, RLS policies, column grants.

-- ---------------------------------------------------------------- helpers
create or replace function public.app_is_service() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
$$;

create or replace function public.app_is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_is_service() or exists (
    select 1 from memberships m
    where m.business_id = b and m.user_id = auth.uid() and m.active)
$$;

create or replace function public.app_is_owner(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_is_service() or exists (
    select 1 from memberships m
    where m.business_id = b and m.user_id = auth.uid() and m.active and m.role = 'owner')
$$;

-- Owners have every permission; employees only what the owner granted.
create or replace function public.app_has_perm(b uuid, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_is_service() or exists (
    select 1 from memberships m
    where m.business_id = b and m.user_id = auth.uid() and m.active
      and (m.role = 'owner' or coalesce((m.permissions ->> perm)::boolean, false)))
$$;

create or replace function public.app_require(ok boolean, code text) returns void
language plpgsql immutable as $$
begin
  if not coalesce(ok, false) then
    raise exception '%', code using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------- audit fields
create or replace function public.app_set_audit_fields() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    if new.business_id is distinct from old.business_id then
      raise exception 'business_id_immutable' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace function public.app_set_audit_fields_biz() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace function public.app_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb;
  old_rec jsonb;
  diff jsonb;
  biz uuid;
begin
  if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;
  biz := case when tg_table_name = 'businesses' then (rec->>'id')::uuid else (rec->>'business_id')::uuid end;
  if tg_op = 'UPDATE' then
    old_rec := to_jsonb(old);
    select coalesce(jsonb_object_agg(k, jsonb_build_object('from', old_rec->k, 'to', rec->k)), '{}'::jsonb)
      into diff
      from jsonb_object_keys(rec) k
     where rec->k is distinct from old_rec->k and k not in ('updated_at','updated_by');
    if diff = '{}'::jsonb then return null; end if;
  elsif tg_op = 'DELETE' then
    diff := rec;
  else
    diff := null;
  end if;
  insert into audit_logs(business_id, actor_id, table_name, record_id, action, changes)
  values (biz, auth.uid(), tg_table_name, rec->>'id', lower(tg_op), diff);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['memberships','products','sales','expenses','recipes'] loop
    execute format('drop trigger if exists trg_audit_fields on public.%I', t);
    execute format('create trigger trg_audit_fields before insert or update on public.%I for each row execute function public.app_set_audit_fields()', t);
  end loop;
  execute 'drop trigger if exists trg_audit_fields on public.businesses';
  execute 'create trigger trg_audit_fields before insert or update on public.businesses for each row execute function public.app_set_audit_fields_biz()';
  foreach t in array array['businesses','memberships','products','sales','expenses','purchases','recipes','recipe_items','production_batches'] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.app_audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.businesses         enable row level security;
alter table public.memberships        enable row level security;
alter table public.profiles           enable row level security;
alter table public.products           enable row level security;
alter table public.product_serials    enable row level security;
alter table public.stock_movements    enable row level security;
alter table public.sales              enable row level security;
alter table public.sale_items         enable row level security;
alter table public.expenses           enable row level security;
alter table public.purchases          enable row level security;
alter table public.purchase_items     enable row level security;
alter table public.recipes            enable row level security;
alter table public.recipe_items       enable row level security;
alter table public.production_batches enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.ai_conversations   enable row level security;
alter table public.ai_messages        enable row level security;
alter table public.daily_reports      enable row level security;

-- businesses: created only through create_business(); members read; owners update/delete.
drop policy if exists biz_select on public.businesses;
create policy biz_select on public.businesses for select using (public.app_is_member(id));
drop policy if exists biz_update on public.businesses;
create policy biz_update on public.businesses for update using (public.app_is_owner(id)) with check (public.app_is_owner(id));
drop policy if exists biz_delete on public.businesses;
create policy biz_delete on public.businesses for delete using (public.app_is_owner(id));

-- memberships: you see your own row; owners see the whole team. Writes go through functions.
drop policy if exists mem_select on public.memberships;
create policy mem_select on public.memberships for select
  using (user_id = auth.uid() or public.app_is_owner(business_id));

-- profiles: strictly own row.
drop policy if exists prof_all on public.profiles;
create policy prof_all on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

-- products
drop policy if exists prod_select on public.products;
create policy prod_select on public.products for select using (public.app_is_member(business_id));
drop policy if exists prod_insert on public.products;
create policy prod_insert on public.products for insert with check (public.app_has_perm(business_id, 'manage_inventory'));
drop policy if exists prod_update on public.products;
create policy prod_update on public.products for update
  using (public.app_has_perm(business_id, 'manage_inventory'))
  with check (public.app_has_perm(business_id, 'manage_inventory'));
drop policy if exists prod_delete on public.products;
create policy prod_delete on public.products for delete using (public.app_has_perm(business_id, 'delete_records'));

drop policy if exists serial_select on public.product_serials;
create policy serial_select on public.product_serials for select using (public.app_is_member(business_id));

drop policy if exists mov_select on public.stock_movements;
create policy mov_select on public.stock_movements for select
  using (public.app_has_perm(business_id, 'manage_inventory') or public.app_has_perm(business_id, 'view_finance'));

-- sales: finance viewers see all sales; employees only the ones they entered.
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select
  using (public.app_has_perm(business_id, 'view_finance') or (created_by = auth.uid() and public.app_is_member(business_id)));
drop policy if exists sale_items_select on public.sale_items;
create policy sale_items_select on public.sale_items for select
  using (exists (select 1 from public.sales s where s.id = sale_id));   -- inherits sales visibility

-- expenses
drop policy if exists exp_select on public.expenses;
create policy exp_select on public.expenses for select
  using (public.app_has_perm(business_id, 'view_finance') or (created_by = auth.uid() and public.app_is_member(business_id)));
drop policy if exists exp_insert on public.expenses;
create policy exp_insert on public.expenses for insert
  with check (public.app_has_perm(business_id, 'add_expenses'));
drop policy if exists exp_update on public.expenses;
create policy exp_update on public.expenses for update
  using (public.app_is_owner(business_id) or (created_by = auth.uid() and public.app_has_perm(business_id, 'add_expenses') and created_at > now() - interval '24 hours'))
  with check (public.app_has_perm(business_id, 'add_expenses'));
drop policy if exists exp_delete on public.expenses;
create policy exp_delete on public.expenses for delete using (public.app_has_perm(business_id, 'delete_records'));

-- purchases (writes via record_purchase)
drop policy if exists pur_select on public.purchases;
create policy pur_select on public.purchases for select
  using (public.app_has_perm(business_id, 'manage_inventory') or public.app_has_perm(business_id, 'view_finance'));
drop policy if exists pur_items_select on public.purchase_items;
create policy pur_items_select on public.purchase_items for select
  using (exists (select 1 from public.purchases p where p.id = purchase_id));

-- recipes
drop policy if exists rec_select on public.recipes;
create policy rec_select on public.recipes for select using (public.app_is_member(business_id));
drop policy if exists rec_write on public.recipes;
create policy rec_write on public.recipes for all
  using (public.app_has_perm(business_id, 'manage_inventory'))
  with check (public.app_has_perm(business_id, 'manage_inventory'));
drop policy if exists rec_items_select on public.recipe_items;
create policy rec_items_select on public.recipe_items for select using (public.app_is_member(business_id));
drop policy if exists rec_items_write on public.recipe_items;
create policy rec_items_write on public.recipe_items for all
  using (public.app_has_perm(business_id, 'manage_inventory'))
  with check (public.app_has_perm(business_id, 'manage_inventory'));

drop policy if exists prodb_select on public.production_batches;
create policy prodb_select on public.production_batches for select
  using (public.app_has_perm(business_id, 'record_production') or public.app_has_perm(business_id, 'view_finance'));

-- audit log: owners only, read-only.
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select using (public.app_is_owner(business_id));

-- AI chat history: private to the user, inside a business they belong to.
drop policy if exists conv_all on public.ai_conversations;
create policy conv_all on public.ai_conversations for all
  using (user_id = auth.uid() and public.app_is_member(business_id))
  with check (user_id = auth.uid() and public.app_is_member(business_id));
drop policy if exists msg_all on public.ai_messages;
create policy msg_all on public.ai_messages for all
  using (user_id = auth.uid() and public.app_is_member(business_id))
  with check (user_id = auth.uid() and public.app_is_member(business_id)
              and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

drop policy if exists rep_select on public.daily_reports;
create policy rep_select on public.daily_reports for select using (public.app_has_perm(business_id, 'view_finance'));

-- ---------------------------------------------------------------- grants
-- Cost columns are hidden from direct table reads; cost is exposed only through
-- functions that check view_finance (see 0003).
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select (id, business_id, name, kind, category, sku, unit, sale_price, stock, min_stock, track_serial, active,
              created_by, created_at, updated_by, updated_at)
  on public.products to authenticated;
grant insert (business_id, name, kind, category, sku, unit, sale_price, cost_price, stock, min_stock, track_serial, active)
  on public.products to authenticated;
grant update (name, kind, category, sku, unit, sale_price, min_stock, track_serial, active)
  on public.products to authenticated;
grant delete on public.products to authenticated;

grant select (id, business_id, total, cost_complete, payment_method, note, sold_at, voided, voided_by, voided_at,
              void_reason, created_by, created_at, updated_by, updated_at)
  on public.sales to authenticated;
grant select (id, business_id, sale_id, product_id, quantity, unit_price, line_total, serial)
  on public.sale_items to authenticated;

grant select, insert, update, delete on public.expenses to authenticated;
grant select on public.businesses, public.memberships, public.product_serials, public.purchases,
                public.purchase_items, public.audit_logs, public.daily_reports to authenticated;
grant update (name, currency, language, timezone, allow_negative_stock, report_time, report_channel, agent_settings, modules)
  on public.businesses to authenticated;
grant delete on public.businesses to authenticated;
grant select (id, business_id, product_id, change, reason, ref_id, note, created_by, created_at)
  on public.stock_movements to authenticated;
grant select, insert, update, delete on public.recipes, public.recipe_items to authenticated;
grant select (id, business_id, recipe_id, product_id, quantity, cost_complete, consumption, note, produced_at, created_by, created_at)
  on public.production_batches to authenticated;
grant select, insert, update, delete on public.profiles, public.ai_conversations, public.ai_messages to authenticated;
grant usage on all sequences in schema public to authenticated;
