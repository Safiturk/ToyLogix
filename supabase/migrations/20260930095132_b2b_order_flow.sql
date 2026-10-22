begin;
create table public.b2b_payment_settings(id boolean primary key default true check(id), iban text not null, beneficiary text not null, bank text not null default '');
insert into public.b2b_payment_settings(iban,beneficiary,bank) values('RO1111111111111','ToyLogix (date demonstrative)','Cont demonstrativ');
alter table public.b2b_payment_settings enable row level security;
revoke all on public.b2b_payment_settings from public,anon,authenticated;
grant all on public.b2b_payment_settings to service_role;
create table public.b2b_order_counters(year integer primary key, value bigint not null);
create table public.b2b_orders(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 request_key uuid not null, code text not null unique,
 status text not null default 'pending_review' check(status in ('pending_review','awaiting_payment','payment_under_review','payment_confirmed','cancelled','rejected')),
 company jsonb not null, customer_email text not null, total_cents bigint not null check(total_cents between 0 and 9007199254740991),
 bank_iban text not null, bank_beneficiary text not null, bank_name text not null,
 receipt_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,request_key)
);
create index b2b_orders_customer on public.b2b_orders(user_id,created_at desc);
create table public.b2b_order_lines(
 order_id uuid references public.b2b_orders(id) on delete restrict, product_id bigint references public.produse(id) on delete restrict,
 product jsonb not null, boxes integer not null check(boxes between 1 and 100000), primary key(order_id,product_id)
);
create table public.b2b_order_events(
 id bigint generated always as identity primary key, order_id uuid not null references public.b2b_orders(id),
 actor uuid not null references auth.users(id), status text not null, created_at timestamptz not null default now()
);
create table public.b2b_order_notifications(
 order_id uuid primary key references public.b2b_orders(id), sent_at timestamptz, claimed_at timestamptz
);
alter table public.b2b_orders enable row level security;
alter table public.b2b_order_lines enable row level security;
alter table public.b2b_order_events enable row level security;
alter table public.b2b_order_counters enable row level security;
alter table public.b2b_order_notifications enable row level security;
revoke all on public.b2b_orders,public.b2b_order_lines,public.b2b_order_events,public.b2b_order_counters,public.b2b_order_notifications from public,anon,authenticated;
grant select on public.b2b_orders,public.b2b_order_lines,public.b2b_order_events to authenticated;
grant all on public.b2b_orders,public.b2b_order_lines,public.b2b_order_events,public.b2b_order_counters,public.b2b_order_notifications to service_role;
create policy order_read on public.b2b_orders for select to authenticated using(public.toylogix_is_approved() and (user_id=auth.uid() or public.toylogix_is_admin()));
create policy order_lines_read on public.b2b_order_lines for select to authenticated using(exists(select 1 from public.b2b_orders o where o.id=order_id));
create policy order_events_read on public.b2b_order_events for select to authenticated using(exists(select 1 from public.b2b_orders o where o.id=order_id));

create schema toylogix_order_private;
revoke all on schema toylogix_order_private from public,anon,authenticated;
grant usage on schema toylogix_order_private to authenticated;
create function toylogix_order_private.submit_b2b_order(p_key uuid,p_lines jsonb) returns public.b2b_orders
language plpgsql security definer set search_path='' as $$
declare result public.b2b_orders; item jsonb; product public.produse; profile public.utilizatori; billing public.billing_profiles;
 p_iban text; p_beneficiary text; p_bank text; total bigint:=0; yr integer:=extract(year from now() at time zone 'Europe/Bucharest'); seq bigint; qty integer;
begin
 if auth.uid() is null or not public.toylogix_is_approved() then raise exception 'ORDER_ACCESS_DENIED'; end if;
 -- Serialize retries for this customer's idempotency key.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select * into result from public.b2b_orders where user_id=auth.uid() and request_key=p_key;
 if found then return result; end if;
 if p_key is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'ORDER_INVALID_CART'; end if;
 select iban,beneficiary,bank into p_iban,p_beneficiary,p_bank from public.b2b_payment_settings where id=true;
 if coalesce(trim(p_iban),'')='' or coalesce(trim(p_beneficiary),'')='' then raise exception 'ORDER_BANK_NOT_CONFIGURED'; end if;
 if (select count(distinct x->>'product_id') from jsonb_array_elements(p_lines) x)<>jsonb_array_length(p_lines) then raise exception 'ORDER_DUPLICATE_PRODUCT'; end if;
 select * into profile from public.utilizatori where auth_user_id=auth.uid();
 select * into billing from public.billing_profiles where user_id=auth.uid();
 insert into public.b2b_order_counters values(yr,1) on conflict(year) do update set value=b2b_order_counters.value+1 returning value into seq;
 insert into public.b2b_orders(user_id,request_key,code,company,customer_email,total_cents,bank_iban,bank_beneficiary,bank_name)
 values(auth.uid(),p_key,'TLX-'||yr||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'),
 jsonb_build_object('account',jsonb_build_object('nume_firma',profile.nume_firma,'nume_complet',profile.nume_complet,'telefon',profile.telefon,'email',profile.email),'billing',coalesce(to_jsonb(billing)-'user_id','{}'::jsonb)),
 (select email from auth.users where id=auth.uid()),0,p_iban,p_beneficiary,coalesce(p_bank,'')) returning * into result;
 for item in select x from jsonb_array_elements(p_lines) x order by (x->>'product_id')::bigint loop
  select * into product from public.produse where id=(item->>'product_id')::bigint for share;
  qty:=(item->>'boxes')::integer;
  if not found or product.is_archived or qty is null or qty not between 1 and 100000 or qty>product.stoc_actual or product.pret_engros is null or product.pret_engros<0 or product.bucati_per_cutie is null or product.bucati_per_cutie<1 then raise exception 'ORDER_PRODUCT_UNAVAILABLE'; end if;
  if product.pret_engros is distinct from (item->>'price')::numeric or product.bucati_per_cutie is distinct from (item->>'pack')::integer then raise exception 'ORDER_CART_CHANGED'; end if;
  total:=total+round(product.pret_engros*100)::bigint*qty*product.bucati_per_cutie;
  insert into public.b2b_order_lines values(result.id,product.id,to_jsonb(product),qty);
 end loop;
 update public.b2b_orders set total_cents=total where id=result.id returning * into result;
 insert into public.b2b_order_events(order_id,actor,status) values(result.id,auth.uid(),result.status);
 insert into public.b2b_order_notifications(order_id) values(result.id);
 return result;
end $$;

create function toylogix_order_private.transition_b2b_order(p_id uuid,p_status text,p_receipt text default null) returns public.b2b_orders
language plpgsql security definer set search_path='' as $$
declare result public.b2b_orders; line public.b2b_order_lines; admin boolean:=public.toylogix_is_admin();
begin
 if auth.uid() is null or not public.toylogix_is_approved() then raise exception 'ORDER_ACCESS_DENIED'; end if;
 select * into result from public.b2b_orders where id=p_id for update;
 if not found or (not admin and result.user_id<>auth.uid()) then raise exception 'ORDER_ACCESS_DENIED'; end if;
 if p_receipt is not null then
  if p_status<>'payment_under_review' or result.status not in ('pending_review','awaiting_payment','payment_under_review') or result.user_id<>auth.uid() then raise exception 'ORDER_INVALID_TRANSITION'; end if;
  if not exists(select 1 from storage.objects where bucket_id='order-receipts' and name=p_receipt and split_part(name,'/',1)=auth.uid()::text and split_part(name,'/',2)=p_id::text) then raise exception 'ORDER_INVALID_RECEIPT'; end if;
 else
  if not admin then raise exception 'ORDER_ADMIN_REQUIRED'; end if;
  if result.status=p_status then return result; end if;
  if not ((result.status='pending_review' and p_status in ('awaiting_payment','rejected','cancelled')) or (result.status in ('awaiting_payment','payment_under_review') and p_status in ('payment_confirmed','rejected','cancelled'))) then raise exception 'ORDER_INVALID_TRANSITION'; end if;
 end if;
 if p_status='payment_confirmed' then
  for line in select * from public.b2b_order_lines where order_id=p_id order by product_id loop
   perform public.record_stock_movement(line.product_id,'stock_out',-line.boxes,'Plata confirmata: '||result.code,null,null);
  end loop;
 end if;
 update public.b2b_orders set status=p_status,receipt_url=coalesce(p_receipt,receipt_url),updated_at=now() where id=p_id returning * into result;
 insert into public.b2b_order_events(order_id,actor,status) values(p_id,auth.uid(),p_status);
 return result;
end $$;
revoke all on function toylogix_order_private.submit_b2b_order(uuid,jsonb),toylogix_order_private.transition_b2b_order(uuid,text,text) from public,anon,authenticated;
grant execute on function toylogix_order_private.submit_b2b_order(uuid,jsonb),toylogix_order_private.transition_b2b_order(uuid,text,text) to authenticated;
create function public.submit_b2b_order(p_key uuid,p_lines jsonb) returns public.b2b_orders
language sql security invoker set search_path='' as $$ select toylogix_order_private.submit_b2b_order(p_key,p_lines); $$;
create function public.transition_b2b_order(p_id uuid,p_status text,p_receipt text default null) returns public.b2b_orders
language sql security invoker set search_path='' as $$ select toylogix_order_private.transition_b2b_order(p_id,p_status,p_receipt); $$;
revoke all on function public.submit_b2b_order(uuid,jsonb),public.transition_b2b_order(uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_b2b_order(uuid,jsonb),public.transition_b2b_order(uuid,text,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('order-receipts','order-receipts',false,5242880,array['application/pdf','image/png','image/jpeg']);
create policy receipt_upload on storage.objects for insert to authenticated with check(bucket_id='order-receipts' and public.toylogix_is_approved() and exists(select 1 from public.b2b_orders o where o.user_id=auth.uid() and split_part(name,'/',1)=auth.uid()::text and split_part(name,'/',2)=o.id::text and o.status in ('pending_review','awaiting_payment','payment_under_review')));
create policy receipt_read on storage.objects for select to authenticated using(bucket_id='order-receipts' and public.toylogix_is_approved() and (public.toylogix_is_admin() or split_part(name,'/',1)=auth.uid()::text));
commit;
