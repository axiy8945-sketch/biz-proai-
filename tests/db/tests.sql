-- BizPro AI — database test suite (calculations, isolation, permissions, idempotency).
-- Runs as superuser but switches to the `authenticated` role with a JWT `sub`
-- so RLS and permission checks behave exactly as in Supabase.
\set ON_ERROR_STOP 1

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.eq(actual anyelement, expected anyelement, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % — expected %, got %', msg, expected, actual;
  end if;
  raise notice 'ok  %', msg;
end $$;

-- expects the statement to raise an error whose message contains `needle`
create or replace function pg_temp.fails(stmt text, needle text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if position(needle in sqlerrm) > 0 then raise notice 'ok  % (%)', msg, sqlerrm; return; end if;
    raise exception 'FAIL: % — wrong error: %', msg, sqlerrm;
  end;
  raise exception 'FAIL: % — statement succeeded', msg;
end $$;

set client_min_messages = notice;

insert into auth.users(id, email) values
 ('a0000000-0000-0000-0000-00000000000a', 'owner-a@test'),
 ('b0000000-0000-0000-0000-00000000000b', 'owner-b@test'),
 ('e0000000-0000-0000-0000-00000000000e', 'emp-1@test'),
 ('e0000000-0000-0000-0000-00000000000f', 'emp-2@test');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

-- ============================================================ businesses
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
insert into ids values ('shop', create_business('Ala-Too Market', 'retail', 'KGS', 'ky', 'Азамат'));
insert into ids values ('bakery', create_business('Nan Bakery', 'bakery', 'KGS', 'ru', 'Азамат'));
insert into ids values ('phones', create_business('Mobi Shop', 'smartphone', 'KGS', 'uz', 'Азамат'));
reset role;
select pg_temp.eq((select modules @> array['production','recipes'] from businesses where id = (select v from ids where k='bakery')), true, 'bakery gets production modules');
select pg_temp.eq((select 'production' = any(modules) from businesses where id = (select v from ids where k='shop')), false, 'retail has no production module');

select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
insert into ids values ('other', create_business('Other Shop', 'grocery', 'KGS', 'uz', 'Bekzod'));
reset role;

-- ============================================================ products, purchase, avg cost
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
insert into ids values ('cola', create_product((select v from ids where k='shop'), 'Coca-Cola 1L', 'product', 'pcs', 100, 60, 10, 5));
insert into ids values ('bread', create_product((select v from ids where k='shop'), 'Bread', 'product', 'pcs', 30, 0, 50, 10));
select record_purchase((select v from ids where k='shop'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cola'), 'quantity', 10, 'unit_cost', 70)),
  'Supplier 1', null, gen_random_uuid());
select pg_temp.eq((select cost_price from list_products((select v from ids where k='shop')) where id = (select v from ids where k='cola')), 65.0000, 'weighted average cost (10@60 + 10@70)');
select pg_temp.eq((select stock from products where id = (select v from ids where k='cola')), 20.000, 'purchase adds stock');

-- ============================================================ sale + idempotency
insert into ids values ('req1', gen_random_uuid());
insert into ids values ('sale1', record_sale((select v from ids where k='shop'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cola'), 'quantity', 3),
                    jsonb_build_object('product_id', (select v from ids where k='bread'), 'quantity', 2)),
  'cash', null, (select v from ids where k='req1')));
select pg_temp.eq(record_sale((select v from ids where k='shop'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cola'), 'quantity', 3)),
  'cash', null, (select v from ids where k='req1')), (select v from ids where k='sale1'), 'duplicate submit returns same sale');
select pg_temp.eq((select stock from products where id = (select v from ids where k='cola')), 17.000, 'stock deducted exactly once');
reset role;
select pg_temp.eq((select total from sales where id = (select v from ids where k='sale1')), 360.00, 'sale total 3*100 + 2*30');
select pg_temp.eq((select cogs from sales where id = (select v from ids where k='sale1')), 195.00, 'COGS 3*65 (bread cost unknown)');
select pg_temp.eq((select cost_complete from sales where id = (select v from ids where k='sale1')), false, 'sale flagged as incomplete cost');

select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select record_sale((select v from ids where k='shop'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cola'), 'quantity', 999)), 'cash', null, null)$$,
  'insufficient_stock', 'cannot oversell');

insert into expenses(business_id, category, amount, note) values ((select v from ids where k='shop'), 'rent', 100, 'test');

select pg_temp.eq((fn_finance_summary((select v from ids where k='shop'), app_today((select v from ids where k='shop')), app_today((select v from ids where k='shop')))->>'net_profit')::numeric,
  65.00, 'net profit = 360 - 195 - 100');
select pg_temp.eq((fn_finance_summary((select v from ids where k='shop'), app_today((select v from ids where k='shop')), app_today((select v from ids where k='shop')))->>'sales_with_unknown_cost')::int,
  1, 'finance summary reports incomplete cost');
select pg_temp.eq((fn_top_products((select v from ids where k='shop'), current_date - 1, current_date + 1, 5)->0->>'name'), 'Coca-Cola 1L', 'top product by revenue');

-- ============================================================ isolation between businesses
reset role;
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select pg_temp.eq((select count(*) from products where business_id = (select v from ids where k='shop')), 0::bigint, 'other owner sees no products');
select pg_temp.eq((select count(*) from sales), 0::bigint, 'other owner sees no sales');
select pg_temp.eq((select count(*) from businesses), 1::bigint, 'other owner sees only own business');
select pg_temp.fails($$select fn_finance_summary((select v from ids where k='shop'), current_date, current_date)$$, 'finance_forbidden', 'cross-business finance blocked');
select pg_temp.fails($$select record_sale((select v from ids where k='shop'), '[{"product_id":"00000000-0000-0000-0000-000000000000","quantity":1}]', 'cash', null, null)$$, 'forbidden', 'cross-business sale blocked');
select pg_temp.fails($$select fn_inventory_status((select v from ids where k='shop'))$$, 'forbidden', 'cross-business inventory blocked');
with u as (update businesses set name = 'hack' where id = (select v from ids where k='shop') returning 1)
select pg_temp.eq(count(*), 0::bigint, 'cross-business update affects nothing') from u;
reset role;

-- ============================================================ employees + permissions
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
insert into ids values ('m1', add_member((select v from ids where k='shop'), 'e0000000-0000-0000-0000-00000000000e', 'Айгүл', '+996700000001', '{}'));
insert into ids values ('m2', add_member((select v from ids where k='shop'), 'e0000000-0000-0000-0000-00000000000f', 'Нурлан', null, '{"add_expenses":true}'));
reset role;

select pg_temp.as_user('e0000000-0000-0000-0000-00000000000e');
insert into ids values ('sale_e', record_sale((select v from ids where k='shop'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cola'), 'quantity', 1)), 'card', null, gen_random_uuid()));
select pg_temp.eq((select count(*) from sales), 1::bigint, 'employee sees only own sales');
select pg_temp.fails($$select fn_finance_summary((select v from ids where k='shop'), current_date, current_date)$$, 'finance_forbidden', 'employee cannot read finance');
select pg_temp.fails($$select cost_price from products limit 1$$, 'permission denied', 'employee cannot read cost column');
select pg_temp.eq((select count(*) from list_products((select v from ids where k='shop')) where cost_price is not null), 0::bigint, 'list_products hides cost from employee');
select pg_temp.fails($$select cogs from sales limit 1$$, 'permission denied', 'employee cannot read COGS');
select pg_temp.fails($$select record_sale((select v from ids where k='shop'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cola'), 'quantity', 1, 'unit_price', 1)), 'cash', null, null)$$,
  'price_change_forbidden', 'employee cannot change price');
select pg_temp.fails($$select void_sale((select v from ids where k='sale_e'), 'mistake')$$, 'forbidden', 'employee cannot void sale');
select pg_temp.fails($$insert into expenses(business_id, category, amount) values ((select v from ids where k='shop'), 'other', 10)$$, 'row-level security', 'employee without permission cannot add expense');
select pg_temp.eq((select count(*) from memberships), 1::bigint, 'employee sees only own membership');
select pg_temp.eq((select count(*) from audit_logs), 0::bigint, 'employee cannot read audit log');
select pg_temp.eq((fn_sales_overview((select v from ids where k='shop'), current_date - 1, current_date + 1)->>'scope'), 'own', 'employee sales overview scoped to own');
select pg_temp.eq(jsonb_array_length(fn_employee_sales((select v from ids where k='shop'), current_date - 1, current_date + 1)), 1, 'employee sees only own performance');
with d as (delete from products where id = (select v from ids where k='cola') returning 1)
select pg_temp.eq(count(*), 0::bigint, 'employee delete affects nothing') from d;
reset role;
select pg_temp.eq((select count(*) from products where id = (select v from ids where k='cola')), 1::bigint, 'product still exists after employee delete attempt');

select pg_temp.as_user('e0000000-0000-0000-0000-00000000000f');
insert into expenses(business_id, category, amount) values ((select v from ids where k='shop'), 'transport', 40);
select pg_temp.eq((select count(*) from expenses), 1::bigint, 'employee with permission adds and sees own expense only');
reset role;
select pg_temp.eq((select created_by from expenses where amount = 40), 'e0000000-0000-0000-0000-00000000000f'::uuid, 'created_by recorded from session, not client');

-- owner sees the whole team and activity
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select pg_temp.eq((select count(*) from memberships where business_id = (select v from ids where k='shop')), 3::bigint, 'owner sees whole team');
select pg_temp.eq(jsonb_array_length(fn_employee_sales((select v from ids where k='shop'), current_date - 1, current_date + 1)), 3, 'owner sees all employee sales');
select pg_temp.eq((select (x->>'created')::int > 0 from jsonb_array_elements(fn_employee_activity((select v from ids where k='shop'), current_date - 1, current_date + 1)) x
                    where x->>'full_name' = 'Айгүл'), true, 'activity tracked per employee');

-- void
select void_sale((select v from ids where k='sale_e'), 'customer returned');
select pg_temp.eq((select stock from products where id = (select v from ids where k='cola')), 17.000, 'void restores stock');
select pg_temp.eq((fn_sales_overview((select v from ids where k='shop'), current_date - 1, current_date + 1)->>'sales_count')::int, 1, 'voided sale excluded from reports');

-- update permissions, deactivate
select update_member((select v from ids where k='m1'), '{"view_finance":true}', null);
reset role;
select pg_temp.as_user('e0000000-0000-0000-0000-00000000000e');
select pg_temp.eq((fn_finance_summary((select v from ids where k='shop'), current_date - 1, current_date + 1) ? 'net_profit'), true, 'granted finance permission works');
reset role;
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select update_member((select v from ids where k='m1'), null, false);
reset role;
select pg_temp.as_user('e0000000-0000-0000-0000-00000000000e');
select pg_temp.eq((select count(*) from products), 0::bigint, 'deactivated employee loses access');
reset role;

-- audit
select pg_temp.eq((select count(*) > 0 from audit_logs where table_name = 'sales' and actor_id = 'e0000000-0000-0000-0000-00000000000e'), true, 'audit log records employee actions');
select pg_temp.eq((select changes ? 'voided' from audit_logs where table_name = 'sales' and action = 'update' order by id desc limit 1), true, 'audit log stores changed fields');

-- ============================================================ production (bakery)
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
insert into ids values ('flour', create_product((select v from ids where k='bakery'), 'Flour', 'ingredient', 'kg', 0, 50, 20, 5));
insert into ids values ('butter', create_product((select v from ids where k='bakery'), 'Butter', 'ingredient', 'kg', 0, 600, 2, 1));
insert into ids values ('bun', create_product((select v from ids where k='bakery'), 'Bun', 'finished', 'pcs', 25, 0, 0, 10));
insert into ids values ('recipe', save_recipe((select v from ids where k='bakery'), null, (select v from ids where k='bun'), 'Bun x50', 50,
  jsonb_build_array(jsonb_build_object('ingredient_id', (select v from ids where k='flour'), 'quantity', 5),
                    jsonb_build_object('ingredient_id', (select v from ids where k='butter'), 'quantity', 0.5))));
insert into ids values ('preq', gen_random_uuid());
select record_production((select v from ids where k='bakery'), (select v from ids where k='recipe'), 100, (select v from ids where k='preq'));
select record_production((select v from ids where k='bakery'), (select v from ids where k='recipe'), 100, (select v from ids where k='preq'));
reset role;
select pg_temp.eq((select stock from products where id = (select v from ids where k='flour')), 10.000, 'flour 20 - 10 (deducted once despite retry)');
select pg_temp.eq((select stock from products where id = (select v from ids where k='butter')), 1.000, 'butter 2 - 1');
select pg_temp.eq((select stock from products where id = (select v from ids where k='bun')), 100.000, 'buns produced');
select pg_temp.eq((select material_cost from production_batches limit 1), 1100.00, 'material cost 10*50 + 1*600');
select pg_temp.eq((select cost_price from products where id = (select v from ids where k='bun')), 11.0000, 'bun unit cost 1100/100');
select pg_temp.eq((select count(*) from production_batches), 1::bigint, 'one batch for duplicate request');

select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select record_production((select v from ids where k='bakery'), (select v from ids where k='recipe'), 200, gen_random_uuid())$$,
  'insufficient_stock', 'production blocked when ingredients missing');
select record_sale((select v from ids where k='bakery'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bun'), 'quantity', 40)), 'cash', null, gen_random_uuid());
select pg_temp.eq((fn_finance_summary((select v from ids where k='bakery'), current_date - 1, current_date + 1)->>'gross_profit')::numeric, 560.00, 'bakery gross profit 40*(25-11)');
select pg_temp.eq((fn_production_summary((select v from ids where k='bakery'), current_date - 1, current_date + 1)->'consumption'->0->>'name'), 'Flour', 'production consumption reported');
select pg_temp.eq((select count(*) from jsonb_array_elements(fn_inventory_status((select v from ids where k='bakery'))->'low_stock') x where x->>'name' = 'Butter'), 1::bigint, 'butter flagged low stock');
select pg_temp.fails($$select record_sale((select v from ids where k='bakery'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='flour'), 'quantity', 1)), 'cash', null, null)$$,
  'ingredient_not_sellable', 'ingredients cannot be sold');

-- ============================================================ serials (smartphones)
insert into ids values ('iphone', create_product((select v from ids where k='phones'), 'iPhone 15 128GB', 'device', 'pcs', 80000, 0, 0, 1, 'Phones', null, true));
select record_purchase((select v from ids where k='phones'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='iphone'), 'quantity', 2, 'unit_cost', 70000,
                    'serials', jsonb_build_array('356789012345671', '356789012345672'))), 'Distributor', null, gen_random_uuid());
select record_sale((select v from ids where k='phones'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='iphone'), 'quantity', 1, 'serial', '356789012345671')), 'cash', null, gen_random_uuid());
select pg_temp.fails($$select record_sale((select v from ids where k='phones'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='iphone'), 'quantity', 1, 'serial', '356789012345671')), 'cash', null, gen_random_uuid())$$,
  'serial_not_in_stock', 'same IMEI cannot be sold twice');
select pg_temp.fails($$select record_sale((select v from ids where k='phones'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='iphone'), 'quantity', 1)), 'cash', null, gen_random_uuid())$$,
  'serial_required', 'IMEI required for tracked device');
select pg_temp.eq((select serials_in_stock from list_products((select v from ids where k='phones')) where name like 'iPhone%'), 1::bigint, 'one IMEI left in stock');
reset role;

-- ============================================================ daily report bundle
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select pg_temp.eq((fn_daily_report((select v from ids where k='shop'), app_today((select v from ids where k='shop')))->'finance'->>'revenue')::numeric, 360.00, 'daily report revenue');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select pg_temp.eq((fn_daily_report((select v from ids where k='shop'), app_today((select v from ids where k='shop')))->'business'->>'name'), 'Ala-Too Market', 'cron (service role) can build report');

\echo ALL DATABASE TESTS PASSED
