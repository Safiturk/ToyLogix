-- Requires 202609190001_account_security.sql. Does not fabricate legacy history.
begin;

-- Fail instead of silently repairing ambiguous legacy balances.
do $$ begin
  if exists(select 1 from public.produse where stoc_actual is null or stoc_actual < 0
    or stoc_actual <> trunc(stoc_actual) or stoc_actual > 2147483647
    or stoc_critic is null or stoc_critic < 0 or stoc_critic <> trunc(stoc_critic)) then
    raise exception 'Reconcile invalid legacy stock/threshold values before migration';
  end if;
end $$;

alter table public.produse
  alter column stoc_actual set default 0,
  alter column stoc_actual set not null,
  alter column stoc_critic set not null,
  add column opening_stock integer not null default 0,
  add column is_archived boolean not null default false,
  add column archived_at timestamptz,
  add column critical_stock_level integer generated always as (stoc_critic) stored,
  add constraint stock_nonnegative check (stoc_actual >= 0 and stoc_actual = trunc(stoc_actual) and stoc_actual <= 2147483647),
  add constraint critical_stock_nonnegative check (stoc_critic >= 0 and stoc_critic = trunc(stoc_critic)),
  add constraint archive_timestamp_consistent check (is_archived = (archived_at is not null));
update public.produse set opening_stock = stoc_actual;

create type public.stock_movement_type as enum ('stock_in','stock_out','return','count_adjustment','reversal');
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null references public.produse(id) on delete restrict,
  movement_type public.stock_movement_type not null,
  quantity integer not null check (quantity <> 0 and quantity > -2147483648),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (reason ~ '[^[:space:]]'),
  reversal_of uuid unique references public.stock_movements(id) on delete restrict,
  notes text,
  reversed_at timestamptz,
  constraint movement_direction check (
    (movement_type in ('stock_in','return') and quantity > 0 and reversal_of is null) or
    (movement_type = 'stock_out' and quantity < 0 and reversal_of is null) or
    (movement_type = 'count_adjustment' and reversal_of is null) or
    (movement_type = 'reversal' and reversal_of is not null)
  ),
  check (id is distinct from reversal_of)
);
create index stock_movements_product_date on public.stock_movements(product_id,created_at desc,id);
create index stock_movements_user_date on public.stock_movements(created_by,created_at desc,id);
create index stock_movements_type_date on public.stock_movements(movement_type,created_at desc,id);
create index stock_movements_date on public.stock_movements(created_at desc,id);

-- All inserts, including privileged imports, pass through the same lock and effect.
create function public.toylogix_apply_stock_movement() returns trigger
language plpgsql security definer set search_path='' as $$
declare product public.produse%rowtype; original public.stock_movements%rowtype;
begin
  if auth.uid() is null or not public.toylogix_is_admin() then
    raise exception 'STOCK_ADMIN_REQUIRED' using errcode='42501';
  end if;
  select * into product from public.produse where id=new.product_id for update;
  if not found then raise exception 'STOCK_PRODUCT_MISSING'; end if;
  if product.is_archived then raise exception 'STOCK_PRODUCT_ARCHIVED'; end if;
  new.created_by := auth.uid();
  new.created_at := clock_timestamp();
  new.reversed_at := null;
  new.reason := btrim(new.reason);
  if new.reason is null or new.reason !~ '[^[:space:]]' then raise exception 'STOCK_REASON_REQUIRED'; end if;
  if new.movement_type = 'reversal' then
    select * into original from public.stock_movements where id=new.reversal_of for update;
    if not found or original.product_id <> new.product_id or original.movement_type='reversal' then
      raise exception 'STOCK_INVALID_REVERSAL';
    end if;
    if original.reversed_at is not null then raise exception 'STOCK_ALREADY_REVERSED'; end if;
    new.quantity := -original.quantity;
  end if;
  if new.quantity is null or new.quantity=0 then raise exception 'STOCK_INVALID_QUANTITY'; end if;
  if product.stoc_actual::bigint + new.quantity::bigint < 0 then
    raise exception 'STOCK_INSUFFICIENT';
  end if;
  if product.stoc_actual::bigint + new.quantity::bigint > 2147483647 then
    raise exception 'STOCK_LIMIT_EXCEEDED';
  end if;
  -- Constraint errors on the movement also roll this update back.
  update public.produse set stoc_actual=stoc_actual + new.quantity where id=new.product_id;
  if new.movement_type='reversal' then
    update public.stock_movements set reversed_at=new.created_at where id=new.reversal_of;
  end if;
  return new;
end $$;
create trigger apply_stock_movement before insert on public.stock_movements
for each row execute function public.toylogix_apply_stock_movement();

create function public.toylogix_protect_stock() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.stoc_actual is distinct from 0 or new.opening_stock is distinct from 0 then
      raise exception 'STOCK_USE_MOVEMENT' using errcode='42501';
    end if;
  else
    if new.id is distinct from old.id or new.opening_stock is distinct from old.opening_stock then
      raise exception 'STOCK_IMMUTABLE_BASELINE' using errcode='42501';
    end if;
    if new.stoc_actual is distinct from old.stoc_actual and not (
      pg_trigger_depth()=2 and current_user=pg_get_userbyid(
        (select proowner from pg_proc where oid='public.toylogix_apply_stock_movement()'::regprocedure))
    ) then raise exception 'STOCK_USE_MOVEMENT' using errcode='42501'; end if;
  end if;
  if new.is_archived then
    if tg_op='INSERT' then new.archived_at:=clock_timestamp();
    elsif not old.is_archived then new.archived_at:=clock_timestamp();
    else new.archived_at:=old.archived_at; end if;
  else new.archived_at:=null; end if;
  return new;
end $$;
create trigger protect_product_stock before insert or update on public.produse
for each row execute function public.toylogix_protect_stock();

create function public.toylogix_immutable_movement() returns trigger
language plpgsql set search_path='' as $$ begin
  if tg_op='UPDATE' then
    if pg_trigger_depth()=2 and current_user=pg_get_userbyid(
      (select proowner from pg_proc where oid='public.toylogix_apply_stock_movement()'::regprocedure))
      and old.reversed_at is null and new.reversed_at is not null
      and (to_jsonb(new)-'reversed_at')=(to_jsonb(old)-'reversed_at') then return new; end if;
  end if;
  raise exception 'STOCK_HISTORY_IMMUTABLE' using errcode='42501';
end $$;
create trigger immutable_stock_movement before update or delete on public.stock_movements
for each row execute function public.toylogix_immutable_movement();
create trigger immutable_stock_history_truncate before truncate on public.stock_movements
for each statement execute function public.toylogix_immutable_movement();

create function public.record_stock_movement(
  p_product_id bigint, p_movement_type public.stock_movement_type,
  p_quantity integer, p_reason text, p_notes text default null, p_reversal_of uuid default null
) returns public.stock_movements
language plpgsql security definer set search_path='' as $$
declare result public.stock_movements;
begin
  if not public.toylogix_is_admin() then raise exception 'STOCK_ADMIN_REQUIRED' using errcode='42501'; end if;
  insert into public.stock_movements(product_id,movement_type,quantity,reason,notes,reversal_of,created_by)
  values(p_product_id,p_movement_type,p_quantity,p_reason,p_notes,p_reversal_of,auth.uid())
  returning * into result;
  return result;
end $$;

alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from public,anon,authenticated;
grant select on public.stock_movements to authenticated;
create policy stock_history_admin on public.stock_movements for select to authenticated
using(public.toylogix_is_admin());
revoke all on function public.toylogix_apply_stock_movement(),public.toylogix_protect_stock(),public.toylogix_immutable_movement(),
  public.record_stock_movement(bigint,public.stock_movement_type,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.record_stock_movement(bigint,public.stock_movement_type,integer,text,text,uuid) to authenticated;

-- Retain metadata writes, but remove delete and protected column privileges.
revoke insert,update,delete on public.produse from authenticated;
do $$ declare cols text; begin
  select string_agg(quote_ident(attname),',') into cols from pg_attribute
    where attrelid='public.produse'::regclass and attnum>0 and not attisdropped;
  execute format('revoke insert (%s), update (%s), references (%s) on public.produse from public,anon,authenticated',cols,cols,cols);
end $$;
grant insert(cod_bara,nume_produs,categorie,brand,varsta_recomandata,gen,material,pret_retail,pret_engros,bucati_per_cutie,stoc_critic,imagini,descriere),
  update(cod_bara,nume_produs,categorie,brand,varsta_recomandata,gen,material,pret_retail,pret_engros,bucati_per_cutie,stoc_critic,imagini,descriere,is_archived)
on public.produse to authenticated;
drop policy product_delete on public.produse;
drop policy product_read on public.produse;
create policy product_read on public.produse for select to authenticated
using(public.toylogix_is_admin() or (public.toylogix_is_approved() and not is_archived));
commit;
