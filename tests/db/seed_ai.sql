-- Test fixture for the AI agent tests (local test DB only — never used in production).
insert into auth.users(id, email) values
 ('a1000000-0000-0000-0000-000000000001', 'owner@ai.test'),
 ('a1000000-0000-0000-0000-000000000002', 'seller@ai.test'),
 ('a1000000-0000-0000-0000-000000000003', 'stranger@ai.test');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
set role authenticated;
select create_business('Test Somsa', 'somsa', 'KGS', 'ky', 'Owner');
reset role;
create or replace function public.test_biz() returns uuid language sql stable as $$ select id from businesses where name = 'Test Somsa' $$;
grant execute on function public.test_biz() to authenticated;

set role authenticated;
select add_member(test_biz(), 'a1000000-0000-0000-0000-000000000002', 'Seller One', null, '{}');
select create_product(test_biz(), 'Meat', 'ingredient', 'kg', 0, 600, 12, 5);
select create_product(test_biz(), 'Dough', 'ingredient', 'kg', 0, 60, 40, 10);
select create_product(test_biz(), 'Somsa', 'finished', 'pcs', 80, 0, 0, 20);
select create_product(test_biz(), 'Tea', 'product', 'pcs', 30, 5, 200, 20);
select create_product(test_biz(), 'Cola', 'product', 'pcs', 70, 45, 6, 10);
select save_recipe(test_biz(), null, (select id from products where name='Somsa'), 'Somsa x40', 40,
  jsonb_build_array(jsonb_build_object('ingredient_id', (select id from products where name='Meat'), 'quantity', 2),
                    jsonb_build_object('ingredient_id', (select id from products where name='Dough'), 'quantity', 4)));
select record_production(test_biz(), (select id from recipes limit 1), 160, gen_random_uuid());
reset role;

-- sales over the last 10 days (owner) and today (seller)
do $$
declare d int; s uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
  for d in 0..9 loop
    execute 'set role authenticated';
    s := record_sale(test_biz(),
      jsonb_build_array(jsonb_build_object('product_id', (select id from products where name='Somsa'), 'quantity', 10 + d),
                        jsonb_build_object('product_id', (select id from products where name='Tea'), 'quantity', 5)),
      'cash', null, gen_random_uuid());
    execute 'reset role';
    update sales set sold_at = now() - make_interval(days => d) where id = s;
  end loop;
end $$;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated"}', false);
set role authenticated;
select record_sale(test_biz(),
  jsonb_build_array(jsonb_build_object('product_id', (select id from products where name='Cola'), 'quantity', 2)), 'card', null, gen_random_uuid());
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
set role authenticated;
insert into expenses(business_id, category, amount, spent_on) values
  (test_biz(), 'rent', 3000, (now() at time zone 'Asia/Bishkek')::date),
  (test_biz(), 'salary', 1500, (now() at time zone 'Asia/Bishkek')::date - 2);
reset role;
