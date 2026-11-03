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
