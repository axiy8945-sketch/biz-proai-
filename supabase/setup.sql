-- BizPro AI — full database setup. Paste into Supabase → SQL Editor → Run (once, on a new project).

-- ===== supabase/migrations/0001_schema.sql =====
-- BizPro AI — core schema
-- Every business-owned row carries business_id. Access is enforced by RLS (0002)
-- and by SECURITY DEFINER functions that re-check membership and permissions.

create extension if not exists pgcrypto;

do $$ begin
  create type public.business_type as enum ('retail','grocery','smartphone','somsa','restaurant','bakery','custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_role as enum ('owner','employee');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- businesses
create table if not exists public.businesses (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(name) between 1 and 120),
  type                 public.business_type not null default 'retail',
  modules              text[] not null default '{}',
  currency             text not null default 'KGS' check (currency ~ '^[A-Z]{3}$'),
  language             text not null default 'ky' check (language in ('ky','uz','ru')),
  timezone             text not null default 'Asia/Bishkek',
  allow_negative_stock boolean not null default false,
  report_time          time not null default '21:00',
  report_channel       text not null default 'in_app' check (report_channel in ('in_app','telegram','none')),
  telegram_chat_id     text,
  telegram_link_code   text unique,
  agent_settings       jsonb not null default '{}'::jsonb,
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_by           uuid,
  updated_at           timestamptz not null default now()
);

create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null default 'employee',
  full_name   text not null default '' check (char_length(full_name) <= 120),
  phone       text check (char_length(phone) <= 40),
  permissions jsonb not null default
    '{"add_expenses":false,"view_finance":false,"delete_records":false,"manage_inventory":false,"record_production":false,"edit_prices":false}'::jsonb,
  active      boolean not null default true,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  unique (business_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);

create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  full_name          text not null default '',
  active_business_id uuid references public.businesses(id) on delete set null,
  language           text check (language in ('ky','uz','ru')),
  theme              text not null default 'dark' check (theme in ('dark','light','system')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------- inventory
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 160),
  kind         text not null default 'product' check (kind in ('product','ingredient','finished','device','accessory')),
  category     text check (char_length(category) <= 80),
  sku          text check (char_length(sku) <= 80),
  unit         text not null default 'pcs' check (unit in ('pcs','kg','g','l','ml','pack')),
  sale_price   numeric(14,2) not null default 0 check (sale_price >= 0),
  cost_price   numeric(14,4) not null default 0 check (cost_price >= 0),  -- weighted average cost
  stock        numeric(14,3) not null default 0,
  min_stock    numeric(14,3) not null default 0 check (min_stock >= 0),
  track_serial boolean not null default false,                            -- IMEI / serial numbers
  active       boolean not null default true,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid,
  updated_at   timestamptz not null default now()
);
create index if not exists products_business_idx on public.products(business_id, active);

create table if not exists public.product_serials (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  serial       text not null check (char_length(serial) between 4 and 40),
  status       text not null default 'in_stock' check (status in ('in_stock','sold')),
  sale_item_id uuid,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (business_id, serial)
);

create table if not exists public.stock_movements (
  id          bigserial primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  change      numeric(14,3) not null,
  reason      text not null check (reason in ('sale','sale_void','purchase','production_in','production_out','adjustment')),
  ref_id      uuid,
  unit_cost   numeric(14,4),
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists stock_movements_idx on public.stock_movements(business_id, product_id, created_at desc);

-- ---------------------------------------------------------------- sales
create table if not exists public.sales (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  total             numeric(14,2) not null default 0 check (total >= 0),
  cogs              numeric(14,2) not null default 0 check (cogs >= 0),
  cost_complete     boolean not null default true,     -- false if any item had unknown cost
  payment_method    text not null default 'cash' check (payment_method in ('cash','card','transfer','credit')),
  note              text check (char_length(note) <= 500),
  sold_at           timestamptz not null default now(),
  client_request_id uuid,
  voided            boolean not null default false,
  voided_by         uuid,
  voided_at         timestamptz,
  void_reason       text,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_by        uuid,
  updated_at        timestamptz not null default now(),
  unique (business_id, client_request_id)
);
create index if not exists sales_business_time_idx on public.sales(business_id, sold_at desc) where not voided;

create table if not exists public.sale_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id     uuid not null references public.sales(id) on delete cascade,
  product_id  uuid not null references public.products(id),
  quantity    numeric(14,3) not null check (quantity > 0),
  unit_price  numeric(14,2) not null check (unit_price >= 0),
  unit_cost   numeric(14,4) not null default 0,
  cost_known  boolean not null default true,
  line_total  numeric(14,2) not null,
  serial      text
);
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);
create index if not exists sale_items_product_idx on public.sale_items(business_id, product_id);

-- ---------------------------------------------------------------- expenses
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category    text not null check (category in ('rent','salary','utilities','supplies','transport','marketing','taxes','repair','other')),
  amount      numeric(14,2) not null check (amount > 0),
  note        text check (char_length(note) <= 500),
  spent_on    date not null default current_date,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
create index if not exists expenses_business_idx on public.expenses(business_id, spent_on desc);

-- ---------------------------------------------------------------- purchases
create table if not exists public.purchases (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  supplier          text check (char_length(supplier) <= 120),
  total             numeric(14,2) not null default 0,
  note              text check (char_length(note) <= 500),
  purchased_at      timestamptz not null default now(),
  client_request_id uuid,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  unique (business_id, client_request_id)
);

create table if not exists public.purchase_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id  uuid not null references public.products(id),
  quantity    numeric(14,3) not null check (quantity > 0),
  unit_cost   numeric(14,4) not null check (unit_cost >= 0),
  line_total  numeric(14,2) not null
);

-- ---------------------------------------------------------------- production
create table if not exists public.recipes (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,  -- finished good
  name        text not null check (char_length(name) between 1 and 160),
  yield_qty   numeric(14,3) not null default 1 check (yield_qty > 0),         -- units produced by one recipe batch
  notes       text check (char_length(notes) <= 1000),
  active      boolean not null default true,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create table if not exists public.recipe_items (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  recipe_id     uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.products(id),
  quantity      numeric(14,4) not null check (quantity > 0),               -- per one recipe batch
  unique (recipe_id, ingredient_id)
);

create table if not exists public.production_batches (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  recipe_id         uuid not null references public.recipes(id),
  product_id        uuid not null references public.products(id),
  quantity          numeric(14,3) not null check (quantity > 0),
  material_cost     numeric(14,2) not null default 0,
  cost_complete     boolean not null default true,
  consumption       jsonb not null default '[]'::jsonb,
  note              text check (char_length(note) <= 500),
  produced_at       timestamptz not null default now(),
  client_request_id uuid not null,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  unique (business_id, client_request_id)   -- prevents duplicate stock deductions
);

-- ---------------------------------------------------------------- audit + AI
create table if not exists public.audit_logs (
  id          bigserial primary key,
  business_id uuid references public.businesses(id) on delete cascade,
  actor_id    uuid,
  table_name  text not null,
  record_id   text,
  action      text not null,
  changes     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_business_idx on public.audit_logs(business_id, created_at desc);

create table if not exists public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         text not null check (char_length(content) <= 8000),
  agents          text[] not null default '{}',
  data            jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists ai_messages_conv_idx on public.ai_messages(conversation_id, created_at);

create table if not exists public.daily_reports (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  report_date  date not null,
  data         jsonb not null,
  text_ky      text, text_uz text, text_ru text,
  delivered_via text,
  delivered_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (business_id, report_date)
);

-- ===== supabase/migrations/0002_security.sql =====
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

-- ===== supabase/migrations/0003_operations.sql =====
-- BizPro AI — transactional operations. Each function re-checks permissions,
-- locks the rows it changes and is idempotent where a double-tap on a phone
-- could otherwise duplicate stock movements.

create or replace function public.app_default_modules(t public.business_type) returns text[]
language sql immutable as $$
  select case t
    when 'retail'     then array['sales','expenses','inventory','purchases','employees','reports','stock_alerts']
    when 'grocery'    then array['sales','expenses','inventory','purchases','employees','reports','stock_alerts']
    when 'smartphone' then array['sales','expenses','inventory','purchases','serials','employees','reports','stock_alerts']
    when 'somsa'      then array['sales','expenses','inventory','purchases','production','recipes','employees','reports','stock_alerts']
    when 'restaurant' then array['sales','expenses','inventory','purchases','production','recipes','employees','reports','stock_alerts']
    when 'bakery'     then array['sales','expenses','inventory','purchases','production','recipes','employees','reports','stock_alerts']
    else array['sales','expenses','inventory','purchases','employees','reports','stock_alerts']
  end
$$;

-- ---------------------------------------------------------------- business + team
create or replace function public.create_business(
  p_name text, p_type public.business_type, p_currency text default 'KGS',
  p_language text default 'ky', p_owner_name text default '', p_modules text[] default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare b uuid; uid uuid := auth.uid();
begin
  perform app_require(uid is not null, 'not_authenticated');
  perform app_require(char_length(trim(coalesce(p_name,''))) between 1 and 120, 'invalid_name');
  perform app_require((select count(*) from memberships where user_id = uid and role = 'owner') < 20, 'too_many_businesses');
  insert into businesses(name, type, currency, language, modules, created_by)
  values (trim(p_name), p_type, upper(coalesce(p_currency,'KGS')), coalesce(p_language,'ky'),
          coalesce(case when p_type = 'custom' then p_modules end, app_default_modules(p_type)), uid)
  returning id into b;
  insert into memberships(business_id, user_id, role, full_name, permissions)
  values (b, uid, 'owner', trim(coalesce(p_owner_name,'')),
          '{"add_expenses":true,"view_finance":true,"delete_records":true,"manage_inventory":true,"record_production":true,"edit_prices":true}');
  insert into profiles(id, full_name, active_business_id, language)
  values (uid, trim(coalesce(p_owner_name,'')), b, coalesce(p_language,'ky'))
  on conflict (id) do update set active_business_id = excluded.active_business_id, updated_at = now();
  return b;
end $$;

-- Called by the server after it created the employee's auth account with the service key.
create or replace function public.add_member(
  p_business uuid, p_user uuid, p_full_name text, p_phone text default null, p_permissions jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  perform app_require(app_is_owner(p_business), 'forbidden');
  perform app_require(char_length(trim(coalesce(p_full_name,''))) between 1 and 120, 'invalid_name');
  insert into memberships(business_id, user_id, role, full_name, phone, permissions)
  values (p_business, p_user, 'employee', trim(p_full_name), p_phone, app_clean_perms(p_permissions))
  on conflict (business_id, user_id) do update set active = true, full_name = excluded.full_name,
     phone = excluded.phone, permissions = excluded.permissions
  returning id into m;
  insert into profiles(id, full_name, active_business_id) values (p_user, trim(p_full_name), p_business)
  on conflict (id) do nothing;
  return m;
end $$;

create or replace function public.app_clean_perms(p jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'add_expenses',      coalesce((p->>'add_expenses')::boolean, false),
    'view_finance',      coalesce((p->>'view_finance')::boolean, false),
    'delete_records',    coalesce((p->>'delete_records')::boolean, false),
    'manage_inventory',  coalesce((p->>'manage_inventory')::boolean, false),
    'record_production', coalesce((p->>'record_production')::boolean, false),
    'edit_prices',       coalesce((p->>'edit_prices')::boolean, false))
$$;

create or replace function public.update_member(
  p_member uuid, p_permissions jsonb default null, p_active boolean default null,
  p_full_name text default null, p_phone text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare m memberships%rowtype;
begin
  select * into m from memberships where id = p_member for update;
  perform app_require(found and app_is_owner(m.business_id), 'forbidden');
  perform app_require(m.role <> 'owner' or (p_active is null and p_permissions is null), 'cannot_change_owner');
  update memberships set
    permissions = coalesce(app_clean_perms(p_permissions), permissions),
    active      = coalesce(p_active, active),
    full_name   = coalesce(nullif(trim(p_full_name),''), full_name),
    phone       = coalesce(p_phone, phone)
  where id = p_member;
end $$;

create or replace function public.set_active_business(p_business uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app_require(app_is_member(p_business), 'forbidden');
  insert into profiles(id, active_business_id) values (auth.uid(), p_business)
  on conflict (id) do update set active_business_id = excluded.active_business_id, updated_at = now();
end $$;

-- ---------------------------------------------------------------- products with cost
-- Cost price is only returned to users who may see finance.
create or replace function public.list_products(p_business uuid, p_include_inactive boolean default false)
returns table (id uuid, name text, kind text, category text, sku text, unit text, sale_price numeric,
               cost_price numeric, stock numeric, min_stock numeric, track_serial boolean, active boolean,
               serials_in_stock bigint)
language plpgsql stable security definer set search_path = public as $$
declare fin boolean := app_has_perm(p_business, 'view_finance');
begin
  perform app_require(app_is_member(p_business), 'forbidden');
  return query
    select p.id, p.name, p.kind, p.category, p.sku, p.unit, p.sale_price,
           case when fin then p.cost_price end, p.stock, p.min_stock, p.track_serial, p.active,
           (select count(*) from product_serials s where s.product_id = p.id and s.status = 'in_stock')
      from products p
     where p.business_id = p_business and (p_include_inactive or p.active)
     order by p.name;
end $$;

create or replace function public.create_product(
  p_business uuid, p_name text, p_kind text, p_unit text, p_sale_price numeric, p_cost_price numeric,
  p_stock numeric, p_min_stock numeric, p_category text default null, p_sku text default null,
  p_track_serial boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  perform app_require(app_has_perm(p_business, 'manage_inventory'), 'forbidden');
  perform app_require(coalesce(p_stock,0) >= 0 and coalesce(p_cost_price,0) >= 0 and coalesce(p_sale_price,0) >= 0, 'invalid_amount');
  perform app_require(not p_track_serial or coalesce(p_stock,0) = 0, 'serial_stock_via_purchase');
  insert into products(business_id, name, kind, unit, sale_price, cost_price, stock, min_stock, category, sku, track_serial)
  values (p_business, trim(p_name), coalesce(p_kind,'product'), coalesce(p_unit,'pcs'), coalesce(p_sale_price,0),
          coalesce(p_cost_price,0), coalesce(p_stock,0), coalesce(p_min_stock,0), nullif(trim(p_category),''),
          nullif(trim(p_sku),''), coalesce(p_track_serial,false))
  returning id into pid;
  if coalesce(p_stock,0) > 0 then
    insert into stock_movements(business_id, product_id, change, reason, unit_cost, note)
    values (p_business, pid, p_stock, 'adjustment', p_cost_price, 'opening_stock');
  end if;
  return pid;
end $$;

create or replace function public.adjust_stock(p_product uuid, p_new_stock numeric, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare p products%rowtype;
begin
  select * into p from products where id = p_product for update;
  perform app_require(found and app_has_perm(p.business_id, 'manage_inventory'), 'forbidden');
  perform app_require(p_new_stock >= 0, 'invalid_amount');
  perform app_require(not p.track_serial, 'serial_stock_via_purchase');
  if p_new_stock <> p.stock then
    update products set stock = p_new_stock where id = p_product;
    insert into stock_movements(business_id, product_id, change, reason, unit_cost, note)
    values (p.business_id, p_product, p_new_stock - p.stock, 'adjustment', p.cost_price, left(p_note, 300));
  end if;
end $$;

-- ---------------------------------------------------------------- sales
-- items: [{"product_id": uuid, "quantity": n, "unit_price": n (optional), "serial": text (optional)}]
create or replace function public.record_sale(
  p_business uuid, p_items jsonb, p_payment_method text default 'cash', p_note text default null,
  p_client_request_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s uuid; it jsonb; p products%rowtype; q numeric; price numeric; cost_known boolean;
  v_total numeric := 0; v_cogs numeric := 0; complete boolean := true; biz businesses%rowtype;
  can_price boolean := app_has_perm(p_business, 'edit_prices'); si uuid; ser text;
begin
  perform app_require(app_is_member(p_business), 'forbidden');
  perform app_require(jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) between 1 and 100, 'invalid_items');
  perform app_require(p_payment_method in ('cash','card','transfer','credit'), 'invalid_payment');
  if p_client_request_id is not null then
    select id into s from sales where business_id = p_business and client_request_id = p_client_request_id;
    if found then return s; end if;   -- duplicate submit: return the existing sale
  end if;
  select * into biz from businesses where id = p_business;
  insert into sales(business_id, payment_method, note, client_request_id)
  values (p_business, p_payment_method, left(p_note, 500), p_client_request_id) returning id into s;

  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'quantity')::numeric;
    perform app_require(q is not null and q > 0 and q < 1000000, 'invalid_quantity');
    select * into p from products where id = (it->>'product_id')::uuid and business_id = p_business and active for update;
    perform app_require(found, 'product_not_found');
    perform app_require(p.kind <> 'ingredient', 'ingredient_not_sellable');
    price := coalesce((it->>'unit_price')::numeric, p.sale_price);
    perform app_require(price >= 0, 'invalid_amount');
    perform app_require(price = p.sale_price or can_price, 'price_change_forbidden');
    perform app_require(p.stock >= q or biz.allow_negative_stock, 'insufficient_stock:' || p.name);
    cost_known := p.cost_price > 0;
    if not cost_known then complete := false; end if;
    ser := null;
    if p.track_serial then
      perform app_require(q = 1, 'serial_quantity_must_be_1');
      ser := trim(it->>'serial');
      perform app_require(ser is not null and ser <> '', 'serial_required');
    end if;
    insert into sale_items(business_id, sale_id, product_id, quantity, unit_price, unit_cost, cost_known, line_total, serial)
    values (p_business, s, p.id, q, price, p.cost_price, cost_known, round(q * price, 2), ser)
    returning id into si;
    if ser is not null then
      update product_serials set status = 'sold', sale_item_id = si
       where business_id = p_business and product_id = p.id and serial = ser and status = 'in_stock';
      perform app_require(found, 'serial_not_in_stock:' || ser);
    end if;
    update products set stock = stock - q where id = p.id;
    insert into stock_movements(business_id, product_id, change, reason, ref_id, unit_cost)
    values (p_business, p.id, -q, 'sale', s, p.cost_price);
    v_total := v_total + round(q * price, 2);
    v_cogs  := v_cogs + round(q * p.cost_price, 2);
  end loop;

  update sales set total = v_total, cogs = v_cogs, cost_complete = complete
   where id = s;
  return s;
end $$;


create or replace function public.void_sale(p_sale uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare sl sales%rowtype; it sale_items%rowtype;
begin
  select * into sl from sales where id = p_sale for update;
  perform app_require(found and app_has_perm(sl.business_id, 'delete_records'), 'forbidden');
  perform app_require(not sl.voided, 'already_voided');
  perform app_require(char_length(trim(coalesce(p_reason,''))) >= 2, 'reason_required');
  for it in select * from sale_items where sale_id = p_sale loop
    update products set stock = stock + it.quantity where id = it.product_id;
    insert into stock_movements(business_id, product_id, change, reason, ref_id, unit_cost)
    values (sl.business_id, it.product_id, it.quantity, 'sale_void', p_sale, it.unit_cost);
    if it.serial is not null then
      update product_serials set status = 'in_stock', sale_item_id = null where sale_item_id = it.id;
    end if;
  end loop;
  update sales set voided = true, voided_by = auth.uid(), voided_at = now(), void_reason = left(trim(p_reason), 300)
   where id = p_sale;
end $$;

-- ---------------------------------------------------------------- purchases
-- items: [{"product_id": uuid, "quantity": n, "unit_cost": n, "serials": [text]}]
create or replace function public.record_purchase(
  p_business uuid, p_items jsonb, p_supplier text default null, p_note text default null,
  p_client_request_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare pu uuid; it jsonb; p products%rowtype; q numeric; c numeric; v_total numeric := 0; base numeric; ser jsonb;
begin
  perform app_require(app_has_perm(p_business, 'manage_inventory'), 'forbidden');
  perform app_require(jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) between 1 and 100, 'invalid_items');
  if p_client_request_id is not null then
    select id into pu from purchases where business_id = p_business and client_request_id = p_client_request_id;
    if found then return pu; end if;
  end if;
  insert into purchases(business_id, supplier, note, client_request_id)
  values (p_business, nullif(trim(p_supplier),''), left(p_note,500), p_client_request_id) returning id into pu;
  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'quantity')::numeric; c := (it->>'unit_cost')::numeric;
    perform app_require(q > 0 and q < 1000000 and c >= 0, 'invalid_amount');
    select * into p from products where id = (it->>'product_id')::uuid and business_id = p_business for update;
    perform app_require(found, 'product_not_found');
    if p.track_serial then
      perform app_require(jsonb_typeof(it->'serials') = 'array' and jsonb_array_length(it->'serials') = q, 'serials_must_match_quantity');
      for ser in select * from jsonb_array_elements(it->'serials') loop
        insert into product_serials(business_id, product_id, serial) values (p_business, p.id, trim(ser #>> '{}'));
      end loop;
    end if;
    base := greatest(p.stock, 0);
    update products set
      cost_price = case when base + q > 0 then round((base * p.cost_price + q * c) / (base + q), 4) else c end,
      stock = stock + q
     where id = p.id;
    insert into purchase_items(business_id, purchase_id, product_id, quantity, unit_cost, line_total)
    values (p_business, pu, p.id, q, c, round(q * c, 2));
    insert into stock_movements(business_id, product_id, change, reason, ref_id, unit_cost)
    values (p_business, p.id, q, 'purchase', pu, c);
    v_total := v_total + round(q * c, 2);
  end loop;
  update purchases set total = v_total where id = pu;
  return pu;
end $$;

-- ---------------------------------------------------------------- production
create or replace function public.save_recipe(
  p_business uuid, p_recipe uuid, p_product uuid, p_name text, p_yield numeric, p_items jsonb, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid := p_recipe; it jsonb;
begin
  perform app_require(app_has_perm(p_business, 'manage_inventory'), 'forbidden');
  perform app_require(p_yield > 0, 'invalid_amount');
  perform app_require(exists(select 1 from products where id = p_product and business_id = p_business), 'product_not_found');
  perform app_require(jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) between 1 and 60, 'invalid_items');
  if r is null then
    insert into recipes(business_id, product_id, name, yield_qty, notes)
    values (p_business, p_product, trim(p_name), p_yield, p_notes) returning id into r;
  else
    update recipes set product_id = p_product, name = trim(p_name), yield_qty = p_yield, notes = p_notes
     where id = r and business_id = p_business;
    perform app_require(found, 'recipe_not_found');
    delete from recipe_items where recipe_id = r;
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    perform app_require(exists(select 1 from products where id = (it->>'ingredient_id')::uuid and business_id = p_business
                               and id <> p_product), 'ingredient_not_found');
    perform app_require((it->>'quantity')::numeric > 0, 'invalid_amount');
    insert into recipe_items(business_id, recipe_id, ingredient_id, quantity)
    values (p_business, r, (it->>'ingredient_id')::uuid, (it->>'quantity')::numeric);
  end loop;
  return r;
end $$;

-- Produces p_quantity units of the recipe's product. Ingredients are deducted
-- proportionally (quantity / yield). The client_request_id is mandatory and
-- unique, so a retried request never deducts stock twice.
create or replace function public.record_production(
  p_business uuid, p_recipe uuid, p_quantity numeric, p_client_request_id uuid, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r recipes%rowtype; ri record; factor numeric; need numeric; cost numeric := 0; complete boolean := true;
  pb uuid; biz businesses%rowtype; fin products%rowtype; base numeric; cons jsonb := '[]'::jsonb;
begin
  perform app_require(app_has_perm(p_business, 'record_production'), 'forbidden');
  perform app_require(p_client_request_id is not null, 'request_id_required');
  perform app_require(p_quantity > 0 and p_quantity < 1000000, 'invalid_quantity');
  select id into pb from production_batches where business_id = p_business and client_request_id = p_client_request_id;
  if found then return pb; end if;
  select * into r from recipes where id = p_recipe and business_id = p_business and active;
  perform app_require(found, 'recipe_not_found');
  select * into biz from businesses where id = p_business;
  factor := p_quantity / r.yield_qty;

  for ri in
    select i.ingredient_id, i.quantity, p.name, p.stock, p.cost_price, p.unit
      from recipe_items i join products p on p.id = i.ingredient_id
     where i.recipe_id = r.id
     order by p.id
     for update of p
  loop
    need := round(ri.quantity * factor, 3);
    perform app_require(ri.stock >= need or biz.allow_negative_stock, 'insufficient_stock:' || ri.name);
    if ri.cost_price = 0 then complete := false; end if;
    update products set stock = stock - need where id = ri.ingredient_id;
    cost := cost + round(need * ri.cost_price, 2);
    cons := cons || jsonb_build_object('ingredient_id', ri.ingredient_id, 'name', ri.name, 'quantity', need,
                                       'unit', ri.unit, 'unit_cost', ri.cost_price);
  end loop;
  perform app_require(jsonb_array_length(cons) > 0, 'recipe_has_no_ingredients');

  insert into production_batches(business_id, recipe_id, product_id, quantity, material_cost, cost_complete,
                                 consumption, note, client_request_id)
  values (p_business, r.id, r.product_id, p_quantity, cost, complete, cons, left(p_note,500), p_client_request_id)
  returning id into pb;

  insert into stock_movements(business_id, product_id, change, reason, ref_id, unit_cost)
  select p_business, (c->>'ingredient_id')::uuid, -(c->>'quantity')::numeric, 'production_out', pb, (c->>'unit_cost')::numeric
    from jsonb_array_elements(cons) c;

  select * into fin from products where id = r.product_id for update;
  base := greatest(fin.stock, 0);
  update products set
    cost_price = case when complete then round((base * fin.cost_price + cost) / (base + p_quantity), 4) else fin.cost_price end,
    stock = stock + p_quantity
   where id = r.product_id;
  insert into stock_movements(business_id, product_id, change, reason, ref_id, unit_cost)
  values (p_business, r.product_id, p_quantity, 'production_in', pb, round(cost / p_quantity, 4));
  return pb;
end $$;

-- ---------------------------------------------------------------- Telegram link
create or replace function public.create_telegram_link_code(p_business uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  perform app_require(app_is_owner(p_business), 'forbidden');
  code := upper(encode(gen_random_bytes(5), 'hex'));
  update businesses set telegram_link_code = code where id = p_business;
  return code;
end $$;

-- ---------------------------------------------------------------- function grants
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- ===== supabase/migrations/0004_analytics.sql =====
-- BizPro AI — deterministic analytics. These are the ONLY numbers the AI agents
-- and the UI use. Periods are inclusive local dates in the business timezone.
-- Voided sales are always excluded.

create or replace function public.app_bounds(p_business uuid, p_from date, p_to date, out t0 timestamptz, out t1 timestamptz)
language sql stable security definer set search_path = public as $$
  select (p_from::timestamp at time zone b.timezone), ((p_to + 1)::timestamp at time zone b.timezone)
    from businesses b where b.id = p_business
$$;

create or replace function public.app_today(p_business uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone timezone)::date from businesses where id = p_business
$$;

-- Sales visible to the caller: all for finance viewers, otherwise their own.
create or replace function public.app_sales_scope(p_business uuid, p_from date, p_to date)
returns setof public.sales
language plpgsql stable security definer set search_path = public as $$
declare t0 timestamptz; t1 timestamptz; fin boolean := app_has_perm(p_business, 'view_finance');
begin
  perform app_require(app_is_member(p_business), 'forbidden');
  perform app_require(p_from <= p_to and p_to - p_from <= 400, 'invalid_period');
  select b.t0, b.t1 into t0, t1 from app_bounds(p_business, p_from, p_to) b;
  return query select s.* from sales s
    where s.business_id = p_business and not s.voided and s.sold_at >= t0 and s.sold_at < t1
      and (fin or s.created_by = auth.uid());
end $$;

-- ---------------------------------------------------------------- finance
create or replace function public.fn_finance_summary(p_business uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; rev numeric; cg numeric; ex numeric; cnt int; incomplete int; items numeric;
begin
  perform app_require(app_has_perm(p_business, 'view_finance'), 'finance_forbidden');
  select coalesce(sum(total),0), coalesce(sum(cogs),0), count(*), count(*) filter (where not cost_complete)
    into rev, cg, cnt, incomplete from app_sales_scope(p_business, p_from, p_to);
  select coalesce(sum(i.quantity),0) into items
    from sale_items i join app_sales_scope(p_business, p_from, p_to) s on s.id = i.sale_id;
  select coalesce(sum(amount),0) into ex from expenses
   where business_id = p_business and spent_on between p_from and p_to;
  r := jsonb_build_object(
    'from', p_from, 'to', p_to,
    'revenue', rev, 'cogs', cg, 'gross_profit', rev - cg, 'expenses', ex, 'net_profit', rev - cg - ex,
    'gross_margin_pct', case when rev > 0 then round((rev - cg) / rev * 100, 1) end,
    'sales_count', cnt, 'items_sold', items,
    'avg_ticket', case when cnt > 0 then round(rev / cnt, 2) end,
    'sales_with_unknown_cost', incomplete,
    'expense_count', (select count(*) from expenses where business_id = p_business and spent_on between p_from and p_to),
    'by_payment', (select coalesce(jsonb_object_agg(payment_method, amt), '{}'::jsonb) from
                    (select payment_method, sum(total) amt from app_sales_scope(p_business, p_from, p_to) group by 1) x));
  return r;
end $$;

create or replace function public.fn_sales_overview(p_business uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fin boolean := app_has_perm(p_business, 'view_finance');
begin
  return (
    select jsonb_build_object(
      'from', p_from, 'to', p_to, 'scope', case when fin then 'business' else 'own' end,
      'revenue', coalesce(sum(s.total),0), 'sales_count', count(*),
      'avg_ticket', case when count(*) > 0 then round(sum(s.total)/count(*), 2) end,
      'items_sold', coalesce((select sum(i.quantity) from sale_items i
                               join app_sales_scope(p_business, p_from, p_to) z on z.id = i.sale_id), 0),
      'by_payment', coalesce((select jsonb_object_agg(payment_method, amt) from
                     (select payment_method, sum(total) amt from app_sales_scope(p_business, p_from, p_to) group by 1) x), '{}'::jsonb))
    from app_sales_scope(p_business, p_from, p_to) s);
end $$;

create or replace function public.fn_sales_series(p_business uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fin boolean := app_has_perm(p_business, 'view_finance'); tz text;
begin
  select timezone into tz from businesses where id = p_business;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'date', d::date, 'revenue', coalesce(x.rev,0), 'sales_count', coalesce(x.cnt,0),
             'gross_profit', case when fin then coalesce(x.rev,0) - coalesce(x.cg,0) end) order by d), '[]'::jsonb)
      from generate_series(p_from, p_to, interval '1 day') d
      left join (select (s.sold_at at time zone tz)::date as d_day, sum(s.total) rev, sum(s.cogs) cg, count(*) cnt
                   from app_sales_scope(p_business, p_from, p_to) s group by 1) x on x.d_day = d::date);
end $$;

create or replace function public.fn_top_products(p_business uuid, p_from date, p_to date, p_limit int default 10) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fin boolean := app_has_perm(p_business, 'view_finance');
begin
  return (
    select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.revenue desc), '[]'::jsonb) from (
      select p.id product_id, p.name, p.unit, sum(i.quantity) quantity, sum(i.line_total) revenue,
             case when fin then sum(i.line_total) - sum(round(i.quantity * i.unit_cost, 2)) end gross_profit,
             bool_and(i.cost_known) cost_known
        from sale_items i
        join app_sales_scope(p_business, p_from, p_to) s on s.id = i.sale_id
        join products p on p.id = i.product_id
       group by p.id, p.name, p.unit
       order by sum(i.line_total) desc
       limit least(greatest(p_limit,1), 50)) t);
end $$;

create or replace function public.fn_employee_sales(p_business uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fin boolean := app_has_perm(p_business, 'view_finance');
begin
  return (
    select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.revenue desc), '[]'::jsonb) from (
      select m.user_id, coalesce(nullif(m.full_name,''), '—') full_name, m.role,
             count(s.id) sales_count, coalesce(sum(s.total),0) revenue,
             case when count(s.id) > 0 then round(sum(s.total)/count(s.id),2) end avg_ticket
        from memberships m
        left join app_sales_scope(p_business, p_from, p_to) s on s.created_by = m.user_id
       where m.business_id = p_business and m.active and (fin or m.user_id = auth.uid())
       group by m.user_id, m.full_name, m.role) t);
end $$;

create or replace function public.fn_expense_breakdown(p_business uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fin boolean := app_has_perm(p_business, 'view_finance');
begin
  perform app_require(app_is_member(p_business), 'forbidden');
  return jsonb_build_object(
    'scope', case when fin then 'business' else 'own' end,
    'total', (select coalesce(sum(amount),0) from expenses where business_id = p_business
               and spent_on between p_from and p_to and (fin or created_by = auth.uid())),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'amount', amt, 'count', n) order by amt desc), '[]'::jsonb)
                      from (select category, sum(amount) amt, count(*) n from expenses
                             where business_id = p_business and spent_on between p_from and p_to
                               and (fin or created_by = auth.uid()) group by category) x));
end $$;

-- ---------------------------------------------------------------- inventory
create or replace function public.fn_inventory_status(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fin boolean := app_has_perm(p_business, 'view_finance'); today date;
begin
  perform app_require(app_is_member(p_business), 'forbidden');
  today := app_today(p_business);
  return (
    with velocity as (
      select i.product_id, sum(i.quantity) / 14.0 per_day
        from sale_items i join app_sales_scope(p_business, today - 13, today) s on s.id = i.sale_id
       group by i.product_id
      union all
      select (c->>'ingredient_id')::uuid, sum((c->>'quantity')::numeric) / 14.0
        from production_batches b, jsonb_array_elements(b.consumption) c
       where b.business_id = p_business and b.produced_at >= now() - interval '14 days'
       group by 1
    ), v as (select product_id, sum(per_day) per_day from velocity group by 1),
    prods as (
      select p.*, coalesce(v.per_day, 0) per_day,
             case when coalesce(v.per_day,0) > 0 then round(greatest(p.stock,0) / v.per_day, 1) end days_left
        from products p left join v on v.product_id = p.id
       where p.business_id = p_business and p.active)
    select jsonb_build_object(
      'product_count', (select count(*) from prods),
      'out_of_stock', (select count(*) from prods where stock <= 0),
      'low_stock', (select coalesce(jsonb_agg(jsonb_build_object(
          'product_id', id, 'name', name, 'kind', kind, 'unit', unit, 'stock', stock, 'min_stock', min_stock,
          'avg_daily_use', round(per_day, 3), 'days_left', days_left,
          'suggested_reorder', greatest(ceil(greatest(min_stock * 2, per_day * 14) - greatest(stock,0)), 0))
          order by days_left nulls last, stock), '[]'::jsonb)
        from prods where stock <= min_stock or (days_left is not null and days_left < 3)),
      'without_min_stock', (select count(*) from prods where min_stock = 0),
      'without_cost', (select count(*) from prods where cost_price = 0 and kind <> 'finished'),
      'inventory_value', case when fin then (select round(sum(greatest(stock,0) * cost_price), 2) from prods) end,
      'retail_value', (select round(sum(greatest(stock,0) * sale_price), 2) from prods where kind <> 'ingredient')));
end $$;

create or replace function public.fn_product_lookup(p_business uuid, p_query text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fin boolean := app_has_perm(p_business, 'view_finance');
begin
  perform app_require(app_is_member(p_business), 'forbidden');
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'product_id', id, 'name', name, 'kind', kind, 'unit', unit, 'stock', stock, 'min_stock', min_stock,
            'sale_price', sale_price, 'cost_price', case when fin then cost_price end)), '[]'::jsonb)
            from (select * from products where business_id = p_business and active
                    and name ilike '%' || replace(replace(left(p_query, 60), '%', ''), '_', '') || '%'
                  order by name limit 10) x);
end $$;

-- ---------------------------------------------------------------- production
create or replace function public.fn_production_summary(p_business uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fin boolean := app_has_perm(p_business, 'view_finance'); t0 timestamptz; t1 timestamptz;
begin
  perform app_require(app_has_perm(p_business, 'record_production') or fin, 'forbidden');
  select b.t0, b.t1 into t0, t1 from app_bounds(p_business, p_from, p_to) b;
  return jsonb_build_object(
    'batches', (select count(*) from production_batches where business_id = p_business and produced_at >= t0 and produced_at < t1),
    'by_product', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'quantity', q, 'batches', n,
                       'material_cost', case when fin then mc end, 'unit_cost', case when fin and q > 0 then round(mc/q,2) end,
                       'cost_complete', cc) order by q desc), '[]'::jsonb)
                     from (select p.name, sum(b.quantity) q, count(*) n, sum(b.material_cost) mc, bool_and(b.cost_complete) cc
                             from production_batches b join products p on p.id = b.product_id
                            where b.business_id = p_business and b.produced_at >= t0 and b.produced_at < t1
                            group by p.name) x),
    'consumption', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'unit', unit, 'quantity', q,
                        'cost', case when fin then cost end) order by q desc), '[]'::jsonb)
                      from (select c->>'name' name, c->>'unit' unit, sum((c->>'quantity')::numeric) q,
                                   round(sum((c->>'quantity')::numeric * (c->>'unit_cost')::numeric), 2) cost
                              from production_batches b, jsonb_array_elements(b.consumption) c
                             where b.business_id = p_business and b.produced_at >= t0 and b.produced_at < t1
                             group by 1, 2) y),
    'material_cost', case when fin then (select coalesce(sum(material_cost),0) from production_batches
                       where business_id = p_business and produced_at >= t0 and produced_at < t1) end);
end $$;

-- ---------------------------------------------------------------- employee activity (owner only)
create or replace function public.fn_employee_activity(p_business uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t0 timestamptz; t1 timestamptz;
begin
  perform app_require(app_is_owner(p_business), 'owner_only');
  select b.t0, b.t1 into t0, t1 from app_bounds(p_business, p_from, p_to) b;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'user_id', m.user_id, 'full_name', m.full_name, 'role', m.role, 'active', m.active,
            'created', coalesce(a.created,0), 'updated', coalesce(a.updated,0), 'deleted', coalesce(a.deleted,0),
            'last_activity', a.last_at) order by coalesce(a.created,0) desc), '[]'::jsonb)
            from memberships m
            left join (select actor_id,
                              count(*) filter (where action='insert') created,
                              count(*) filter (where action='update') updated,
                              count(*) filter (where action='delete') deleted,
                              max(created_at) last_at
                         from audit_logs where business_id = p_business and created_at >= t0 and created_at < t1
                        group by actor_id) a on a.actor_id = m.user_id
           where m.business_id = p_business);
end $$;

-- ---------------------------------------------------------------- data quality
-- Lets agents say exactly which records are missing instead of guessing.
create or replace function public.fn_data_quality(p_business uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tz text;
begin
  perform app_require(app_is_member(p_business), 'forbidden');
  select timezone into tz from businesses where id = p_business;
  return jsonb_build_object(
    'days_in_period', p_to - p_from + 1,
    'days_with_sales', (select count(distinct (sold_at at time zone tz)::date) from app_sales_scope(p_business, p_from, p_to)),
    'sales_with_unknown_cost', (select count(*) from app_sales_scope(p_business, p_from, p_to) where not cost_complete),
    'products_without_cost', (select count(*) from products where business_id = p_business and active and cost_price = 0 and kind <> 'finished'),
    'products_without_min_stock', (select count(*) from products where business_id = p_business and active and min_stock = 0),
    'expense_records', (select count(*) from expenses where business_id = p_business and spent_on between p_from and p_to),
    'has_products', exists(select 1 from products where business_id = p_business),
    'first_sale_date', (select min((sold_at at time zone tz)::date) from sales where business_id = p_business and not voided));
end $$;

-- ---------------------------------------------------------------- daily report bundle
create or replace function public.fn_daily_report(p_business uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app_require(app_has_perm(p_business, 'view_finance'), 'finance_forbidden');
  return jsonb_build_object(
    'business', (select jsonb_build_object('id', id, 'name', name, 'type', type, 'currency', currency, 'language', language)
                   from businesses where id = p_business),
    'date', p_date,
    'finance', fn_finance_summary(p_business, p_date, p_date),
    'previous_day', fn_finance_summary(p_business, p_date - 1, p_date - 1),
    'same_day_last_week', fn_finance_summary(p_business, p_date - 7, p_date - 7),
    'top_products', fn_top_products(p_business, p_date, p_date, 5),
    'employees', fn_employee_sales(p_business, p_date, p_date),
    'inventory', fn_inventory_status(p_business),
    'production', case when (select 'production' = any(modules) from businesses where id = p_business)
                       then fn_production_summary(p_business, p_date, p_date) end,
    'data_quality', fn_data_quality(p_business, p_date, p_date));
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
-- BizPro AI — per-business Telegram bot (token entered by the owner in Settings).
-- Only the server (service role) can read or write this table: no RLS policies for users.
create table if not exists public.telegram_bots (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  token       text not null,
  secret      text not null unique,
  username    text,
  updated_at  timestamptz not null default now()
);
alter table public.telegram_bots enable row level security;
revoke all on public.telegram_bots from anon, authenticated;
