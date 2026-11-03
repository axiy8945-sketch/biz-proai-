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
