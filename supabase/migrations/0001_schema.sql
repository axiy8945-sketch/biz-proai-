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
