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
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  update businesses set telegram_link_code = code where id = p_business;
  return code;
end $$;

-- ---------------------------------------------------------------- function grants
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
