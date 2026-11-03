# BizPro AI

**Your Business. Your AI Team.**

A multi-business management platform for shops, grocery stores, phone shops, somsa shops / restaurants and bakeries — built mobile-first, so an owner can run the whole business from Safari or Chrome on a phone. It is a responsive website: no native app, no install, no PWA.

Interface and AI answers in **Kyrgyz, Uzbek (Latin) and Russian**.

---

## 1. Architecture

| Layer | Choice |
|---|---|
| Web app | Next.js 15 (App Router, Server Components, Server Actions), TypeScript, React 19 |
| Auth & DB | Supabase Auth + PostgreSQL with Row Level Security |
| Calculations | Deterministic SQL functions (`supabase/migrations/0004_analytics.sql`) — the only source of numbers for UI, reports and AI |
| AI | Central Coordinator + 6 specialist agents (`src/lib/ai`), server-side Anthropic API (optional) |
| Styling | Hand-written mobile-first design system (`src/app/globals.css`), dark + light themes, inline SVG icons and charts |
| Jobs | Vercel Cron → `/api/cron/daily-report` (hourly; each business gets its report at its own local time) |
| Messaging | Telegram bot link + daily report delivery |

> **Why no Tailwind?** The preferred stack listed Tailwind. This build environment had no access to the npm registry, so the styling was written as a compact CSS design system instead. That kept the UI testable here — every screen was rendered and checked in Chrome at phone widths. The CSS uses design tokens (`--blue`, `--surface`, …), so moving to Tailwind later is mechanical.

### Data isolation & security
- Every business table has `business_id`; **RLS is enabled on every table**.
- Writes that touch stock or money go through `SECURITY DEFINER` functions that re-check membership and permissions (`record_sale`, `void_sale`, `record_purchase`, `record_production`, `adjust_stock`, `create_product`, …).
- Cost columns (`products.cost_price`, `sales.cogs`, `sale_items.unit_cost`) are **hidden by column grants**. They are exposed only through functions that check the `view_finance` permission.
- `created_by` is taken from the session (never from the client); `updated_by/updated_at` are set by triggers; an **audit log** records every insert/update/delete with the changed fields.
- Idempotency keys on sales, purchases and production mean a double tap or a retried request **never deducts stock twice**.
- The service-role key is used only in server code (`src/lib/supabase/admin.ts`): employee account creation, the cron job and the Telegram webhook. It is never sent to the browser.
- AI agents **cannot run SQL**. They can only call 11 whitelisted, parameterised analytics functions, under the signed-in user's own session, so RLS and role rules apply to the AI too.

### Roles
- **Owner**: everything — finance, employees, settings, AI agent configuration, audit log.
- **Employee**: records sales; sees only their own sales and performance. Everything else is granted per person by the owner: add expenses, view finance, void/delete records, manage inventory, record production, change prices at checkout.

---

## 2. The AI team

```
Owner question (ky / uz / ru)
        │
        ▼
 CENTRAL COORDINATOR ── plans: which agents, which period (LLM tool-call, validated; deterministic router as fallback)
        │
        ├── Sales agent       revenue, counts, trends vs previous period, best day, top products
        ├── Finance agent     revenue − COGS − expenses = net profit, margin, expense breakdown
        ├── Inventory agent   low stock, days left (14-day usage), restock quantities, product lookup
        ├── Employee agent    sales per employee, activity log (owner only)
        ├── Production agent  batches, material consumption, production cost
        └── Business analyst  runs last: compares periods, explains changes, rule-based recommendations
        │
        ▼
 COMPOSE — the LLM writes the answer using ONLY the agents' reports.
           A number guard checks every figure in the answer against the reports;
           if any number isn't there, the deterministic answer is used instead.
```

Each agent returns a structured report: raw DB figures, display facts, sentences in the user's language, and explicit **warnings about missing data** (sales without cost price, no expenses recorded, days without sales, products without minimum stock, too little history to compare).

**Without an `ANTHROPIC_API_KEY`**, the coordinator still works. It routes with the multilingual keyword router and answers with exact templated sentences. With a key, answers become conversational, but the numbers stay the same.

---

## 3. Setup (≈10 minutes)

### 3.1 Supabase
1. Create a project at supabase.com.
2. In **SQL Editor**, run the migrations **in order**:
   `supabase/migrations/0001_schema.sql` → `0002_security.sql` → `0003_operations.sql` → `0004_analytics.sql`
   (or run `supabase db push` with the Supabase CLI).
3. **Authentication → URL configuration**: set the Site URL to your domain and add `https://YOUR-DOMAIN/auth/callback` to the redirect URLs.
4. Copy the URL, the anon key and the service-role key from **Project Settings → API**.

### 3.2 Run locally
```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                   # http://localhost:3000 — open it on your phone via your LAN IP
```

### 3.3 Deploy (Vercel)
1. Import the repository in Vercel and add all variables from `.env.example`.
2. `vercel.json` already schedules the hourly report cron. Set `CRON_SECRET` to any long random string.
3. Open the site URL on your phone → **Register → choose business type → start selling**.

### 3.4 Telegram (optional)
1. Create a bot with @BotFather. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` and `TELEGRAM_WEBHOOK_SECRET` (any random string).
2. Register the webhook:
   ```bash
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d "url=https://YOUR-DOMAIN/api/telegram/webhook" -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
   ```
3. In the app: **Settings → Telegram → Connect**, then send the shown `/start CODE` to the bot.

### Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Auth + data under RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | for employees / cron / Telegram | Server-only admin tasks |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | optional | Conversational AI answers (default model `claude-sonnet-5-5`) |
| `CRON_SECRET` | for daily reports | Protects the cron endpoint |
| `TELEGRAM_*` | optional | Bot delivery |

---

## 4. Tests

Tests need a local PostgreSQL 16 (`PGHOST/PGPORT/PGUSER` set).

```bash
npm run test:db     # 61 checks: calculations, isolation, permissions, idempotency, IMEI, audit
# AI tests use a seeded database:
TEST_DB=bizpro_ai SKIP_TESTS=1 bash tests/db/run.sh && psql -d bizpro_ai -f tests/db/seed_ai.sql
npm run test:ai     # 38 checks: routing of the 7 spec questions, agent figures, permissions, number guard
```

`tests/render/` renders every screen with real database figures and screenshots it in Chrome at 320 / 390 / 412 px and 1280 px. It fails if anything scrolls horizontally.

Results in the build environment: **61/61 DB, 38/38 AI, 17 screens × 4 sizes with no horizontal overflow**.

---

## 5. Feature status

### Completed
- Registration and login (email/password), email confirmation callback, multi-business per user with a business switcher
- Business type selection (retail, grocery, smartphone, somsa, restaurant, bakery, custom). Only the modules for that type are shown.
- Mobile shell: bottom navigation with a central AI button, sticky top bar, bottom-sheet forms, desktop sidebar
- Dashboard: today's revenue vs yesterday, net profit, expenses, COGS, 7-day chart, top products, low stock, quick actions
- Sales: tap-to-sell point-of-sale (search, categories, cart, quantity stepper, payment method, optional price edit), IMEI picker for devices, sales list by period, void with reason (restores stock)
- Expenses: quick entry (big amount field, category chips), list, category breakdown, permission-aware delete
- Inventory: products and ingredients, weighted average cost, minimum stock, stock count adjustment, low-stock filter, inventory value
- Purchases: multi-line purchase with supplier, cost update, IMEI entry for tracked devices
- Production and recipes: recipe editor, record production with live ingredient preview, atomic deduction with no double counting, production cost per unit
- Employees: owner creates logins with a temporary password, per-person permissions, deactivate
- Reports: period selector, net/gross profit, margin, daily revenue chart, payment donut, top products, employee sales, expense categories, on-demand daily report and Telegram send
- AI chat: Coordinator + 6 agents, agent chips, key-figure cards, missing-data warnings, private chat history, rate limit (12 per minute)
- AI team page with each agent's responsibility; the owner can switch agents on or off
- Daily automated reports (hourly cron, respects each business's local time, stored once per day in all 3 languages), Telegram linking
- Audit log screen, dark/light/system theme, language switch (ky/uz/ru), security headers

### Pending / known limitations
- **Not yet built with `next build`.** The npm registry was blocked in the build environment, so the code was type-checked against local type stubs. Run `npm install && npm run build` once; any remaining type issues will be minor.
- Conversational LLM mode was tested with a mocked model. Check it with a real `ANTHROPIC_API_KEY`.
- Tested in Chrome mobile emulation, not on physical iPhone/Android devices. Do a quick pass on a real iPhone (Safari) and an Android phone.
- Uzbek and Kyrgyz texts should be reviewed by native speakers.
- Telegram is one-way (daily reports). Asking the AI from Telegram is prepared but not enabled.
- No edit screen for past purchases or expenses. Correct them via stock adjustment, or delete and re-enter.
- The sales list shows up to 300 sales per period. Pagination is not implemented.
- No customer debts module, no barcode scanning, no receipt printing.

---

## 6. Project map
```
supabase/migrations/   schema, RLS, operations, analytics (SQL)
src/lib/ai/            coordinator, router, guard, agents/*, LLM client
src/lib/actions/       server actions (validated mutations)
src/lib/reports/       daily report builder
src/app/(app)/         authenticated screens   src/app/api/  chat, cron, Telegram
src/components/        UI kit, charts, forms, views
tests/                 db (SQL), ai.test.ts, render (mobile screenshots)
```
