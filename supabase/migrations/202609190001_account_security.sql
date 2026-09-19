-- Run in Supabase SQL Editor BEFORE publishing the corresponding application.
-- Review existing admin roles first; existing roles are preserved, never inferred.
begin;
alter table public.utilizatori add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists utilizatori_auth_user_unique on public.utilizatori(auth_user_id);
-- Ambiguous legacy emails must be reconciled before migration, never guessed.
do $$ begin
  if exists(select lower(trim(email)) from public.utilizatori group by lower(trim(email)) having count(*)>1) then
    raise exception 'Duplicate legacy emails: reconcile before migration';
  end if;
end $$;
update public.utilizatori p set auth_user_id=u.id from auth.users u
where lower(trim(p.email))=lower(u.email) and p.auth_user_id is null and u.email_confirmed_at is not null;
-- Refuse a rollout that would leave the project without a verified administrator.
do $$ begin
  if not exists(select 1 from public.utilizatori p join auth.users u on u.id=p.auth_user_id
    where p.rol='admin' and p.status='approved' and u.email_confirmed_at is not null) then
    raise exception 'No verified approved administrator: migration aborted';
  end if;
end $$;

create table if not exists public.billing_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  legal_name text not null default '', tax_number text not null default '', trade_register text not null default '',
  billing_email text not null default '', country text not null default '', region text not null default '',
  city text not null default '', postal_code text not null default '', address_line1 text not null default '',
  address_line2 text not null default '', delivery_address text not null default '', vat_registered boolean not null default false,
  updated_at timestamptz not null default now()
);

create or replace function public.toylogix_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.utilizatori p join auth.users u on u.id=p.auth_user_id
    where u.id=auth.uid() and u.email_confirmed_at is not null and p.rol='admin' and p.status='approved');
$$;
create or replace function public.toylogix_is_approved() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.utilizatori p join auth.users u on u.id=p.auth_user_id
    where u.id=auth.uid() and u.email_confirmed_at is not null and p.status='approved');
$$;
revoke all on function public.toylogix_is_admin(), public.toylogix_is_approved() from public;
grant execute on function public.toylogix_is_admin(), public.toylogix_is_approved() to authenticated;

-- Protect privileged columns even when a customer crafts an UPDATE manually.
create or replace function public.toylogix_protect_profile() returns trigger
language plpgsql set search_path='' as $$ begin
  if current_user in ('anon','authenticated') then
    if new.id is distinct from old.id or new.auth_user_id is distinct from old.auth_user_id
       or new.email is distinct from old.email or new.parola is distinct from old.parola then
      raise exception 'Identity fields cannot be edited' using errcode='42501';
    end if;
    if (new.rol is distinct from old.rol or new.status is distinct from old.status) and not public.toylogix_is_admin() then
      raise exception 'Only administrators can change access' using errcode='42501';
    end if;
    if old.auth_user_id=auth.uid() and (new.rol is distinct from old.rol or new.status is distinct from old.status) then
      raise exception 'Cannot change your own access' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists toylogix_protect_profile on public.utilizatori;
create trigger toylogix_protect_profile before update on public.utilizatori for each row execute function public.toylogix_protect_profile();

-- Create profile atomically with signup, including when email confirmation is on.
create or replace function public.toylogix_create_profile() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if exists(select 1 from public.utilizatori where auth_user_id=new.id) then return new; end if;
  if exists(select 1 from public.utilizatori where lower(trim(email))=lower(new.email)) then
    -- Link a legacy profile only AFTER verified ownership of its email.
    if new.email_confirmed_at is not null then
      update public.utilizatori set auth_user_id=new.id where lower(trim(email))=lower(new.email) and auth_user_id is null;
    end if;
  else
    insert into public.utilizatori(auth_user_id,nume_complet,email,telefon,nume_firma,parola,status,rol)
    values(new.id,left(coalesce(new.raw_user_meta_data->>'nume_complet',''),200),new.email,
      left(coalesce(new.raw_user_meta_data->>'telefon',''),30),left(coalesce(new.raw_user_meta_data->>'nume_firma',''),200),
      gen_random_uuid()::text,'pending','user');
  end if;
  return new;
end $$;
revoke all on function public.toylogix_create_profile() from public;
drop trigger if exists toylogix_create_profile on auth.users;
create trigger toylogix_create_profile after insert or update of email_confirmed_at on auth.users
  for each row execute function public.toylogix_create_profile();

-- Reconcile confirmed Auth accounts lacking legacy profiles, without granting admin.
insert into public.utilizatori(auth_user_id,nume_complet,email,telefon,nume_firma,parola,status,rol)
select u.id,left(coalesce(u.raw_user_meta_data->>'nume_complet',''),200),u.email,
left(coalesce(u.raw_user_meta_data->>'telefon',''),30),left(coalesce(u.raw_user_meta_data->>'nume_firma',''),200),
gen_random_uuid()::text,'pending','user' from auth.users u
where u.email_confirmed_at is not null and not exists(select 1 from public.utilizatori p where p.auth_user_id=u.id or lower(trim(p.email))=lower(u.email));

-- Replace existing policies on these tables: permissive policies otherwise OR together.
do $$ declare p record; begin
  for p in select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('utilizatori','produse','billing_profiles') loop
    execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;
alter table public.utilizatori enable row level security;
alter table public.produse enable row level security;
alter table public.billing_profiles enable row level security;
-- TRUNCATE bypasses RLS: remove broad default grants before granting CRUD.
revoke all on public.utilizatori,public.billing_profiles,public.produse from public,anon,authenticated;
-- Clear column-level legacy grants as well as table-level privileges.
do $$ declare t text; cols text; begin
  foreach t in array array['utilizatori','produse','billing_profiles'] loop
    select string_agg(quote_ident(attname),',') into cols from pg_attribute
      where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped;
    execute format('revoke all (%s) on public.%I from public, anon, authenticated',cols,t);
  end loop;
end $$;
revoke all on sequence public.utilizatori_id_seq, public.produse_id_seq from public,anon,authenticated;
grant usage on sequence public.produse_id_seq to authenticated;
grant select(id,auth_user_id,nume_complet,email,telefon,nume_firma,rol,status),
  update(nume_complet,telefon,nume_firma,rol,status),delete on public.utilizatori to authenticated;
grant select,insert,update,delete on public.produse to authenticated;
grant select,insert,update on public.billing_profiles to authenticated;
create policy account_read on public.utilizatori for select to authenticated using(auth_user_id=auth.uid() or public.toylogix_is_admin());
create policy account_update on public.utilizatori for update to authenticated using(auth_user_id=auth.uid() or public.toylogix_is_admin()) with check(auth_user_id=auth.uid() or public.toylogix_is_admin());
create policy account_delete on public.utilizatori for delete to authenticated using(public.toylogix_is_admin() and auth_user_id is distinct from auth.uid());
create policy billing_read on public.billing_profiles for select to authenticated using(user_id=auth.uid() or public.toylogix_is_admin());
create policy billing_insert on public.billing_profiles for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.utilizatori where auth_user_id=auth.uid()));
create policy billing_update on public.billing_profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy product_read on public.produse for select to authenticated using(public.toylogix_is_approved());
create policy product_insert on public.produse for insert to authenticated with check(public.toylogix_is_admin());
create policy product_update on public.produse for update to authenticated using(public.toylogix_is_admin()) with check(public.toylogix_is_admin());
create policy product_delete on public.produse for delete to authenticated using(public.toylogix_is_admin());

-- Atomic own-profile save. Caller cannot supply an owner ID, role or status.
create or replace function public.save_my_account(details jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare k text; v text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  for k,v in select key,value from jsonb_each_text(details) loop
    if length(v)>500 then raise exception 'Field too long'; end if;
  end loop;
  if length(trim(coalesce(details->>'nume_complet','')))=0 or length(trim(coalesce(details->>'telefon','')))=0 then raise exception 'Name and phone required'; end if;
  update public.utilizatori set nume_complet=trim(details->>'nume_complet'),telefon=trim(details->>'telefon'),nume_firma=trim(details->>'nume_firma') where auth_user_id=auth.uid();
  if not found then raise exception 'Profile missing'; end if;
  insert into public.billing_profiles(user_id,legal_name,tax_number,trade_register,billing_email,country,region,city,postal_code,address_line1,address_line2,delivery_address,vat_registered)
  values(auth.uid(),coalesce(details->>'legal_name',''),coalesce(details->>'tax_number',''),coalesce(details->>'trade_register',''),coalesce(details->>'billing_email',''),coalesce(details->>'country',''),coalesce(details->>'region',''),coalesce(details->>'city',''),coalesce(details->>'postal_code',''),coalesce(details->>'address_line1',''),coalesce(details->>'address_line2',''),coalesce(details->>'delivery_address',''),coalesce((details->>'vat_registered')::boolean,false))
  on conflict(user_id) do update set legal_name=excluded.legal_name,tax_number=excluded.tax_number,trade_register=excluded.trade_register,billing_email=excluded.billing_email,country=excluded.country,region=excluded.region,city=excluded.city,postal_code=excluded.postal_code,address_line1=excluded.address_line1,address_line2=excluded.address_line2,delivery_address=excluded.delivery_address,vat_registered=excluded.vat_registered,updated_at=now();
end $$;
revoke all on function public.save_my_account(jsonb) from public;
grant execute on function public.save_my_account(jsonb) to authenticated;
commit;
