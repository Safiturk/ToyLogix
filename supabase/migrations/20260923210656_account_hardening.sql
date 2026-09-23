-- Apply after account_security and stock_management, together with the new UI.
-- Existing production sessions require MFA before administrator operations.
begin;
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated,service_role;

alter table public.utilizatori add column is_active boolean not null default true;
-- Profiles are owned by Auth; removing just a profile never cascades to Auth.
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.utilizatori'::regclass
    and contype='f' and confrelid='auth.users'::regclass loop
    execute format('alter table public.utilizatori drop constraint %I',c.conname);
  end loop;
end $$;
alter table public.utilizatori add constraint utilizatori_auth_owner_fk
foreign key(auth_user_id) references auth.users(id) on delete cascade;

create table private.deleted_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  deleted_at timestamptz not null default clock_timestamp()
);
alter table private.deleted_profiles enable row level security;

-- UUIDs deliberately are historical identifiers, not cascading Auth FKs.
-- This preserves attribution even after an Auth account is permanently removed.
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  target_user_id uuid,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index audit_logs_target_date on public.audit_logs(target_user_id,created_at desc);
create index audit_logs_date on public.audit_logs(created_at desc,id desc);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from public,anon,authenticated;
revoke all on sequence public.audit_logs_id_seq from public,anon,authenticated;
grant select on public.audit_logs to authenticated;

create function private.session_valid() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=auth.uid() and s.id::text=auth.jwt()->>'session_id'
    and u.email_confirmed_at is not null and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=now())
    and (s.not_after is null or s.not_after>now())
  );
$$;
create function private.mfa_verified() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and auth.jwt()->>'aal'='aal2' and exists(
    select 1 from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
    where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id'
      and s.aal='aal2' and f.status='verified'
  );
$$;
create function private.account_enabled() returns boolean
language sql stable security definer set search_path='' as $$
  select private.session_valid() and exists(select 1 from public.utilizatori p
    where p.auth_user_id=auth.uid() and p.is_active and p.status in ('approved','pending'));
$$;
create function private.account_access() returns boolean
language sql stable security definer set search_path='' as $$
  select private.account_enabled() and exists(select 1 from public.utilizatori p
    where p.auth_user_id=auth.uid() and (p.rol<>'admin' or private.mfa_verified()));
$$;
create function private.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select private.account_enabled() and private.mfa_verified() and exists(
    select 1 from public.utilizatori p where p.auth_user_id=auth.uid() and p.rol='admin' and p.status='approved');
$$;
create function private.is_approved() returns boolean
language sql stable security definer set search_path='' as $$
  select private.account_access() and exists(select 1 from public.utilizatori p
    where p.auth_user_id=auth.uid() and p.status='approved');
$$;
create or replace function public.toylogix_is_admin() returns boolean
language sql stable security invoker set search_path='' as $$ select private.is_admin(); $$;
create or replace function public.toylogix_is_approved() returns boolean
language sql stable security invoker set search_path='' as $$ select private.is_approved(); $$;

create function private.audit_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare k text;
begin
  if tg_op='DELETE' then
    insert into public.audit_logs(actor_id,target_user_id,action,old_value)
    values(auth.uid(),old.auth_user_id,'profile_deleted',jsonb_build_object('profile_id',old.id,'rol',old.rol,'status',old.status));
    return old;
  end if;
  foreach k in array array['rol','status','is_active'] loop
    if to_jsonb(old)->k is distinct from to_jsonb(new)->k then
      insert into public.audit_logs(actor_id,target_user_id,action,old_value,new_value)
      values(auth.uid(),new.auth_user_id,case k when 'rol' then 'role_changed' when 'status' then 'approval_changed' else 'access_changed' end,
        jsonb_build_object(k,to_jsonb(old)->k),jsonb_build_object(k,to_jsonb(new)->k));
    end if;
  end loop;
  return new;
end $$;
create trigger audit_profile_changes after update or delete on public.utilizatori
for each row execute function private.audit_profile();

create function private.immutable_audit() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'AUDIT_IMMUTABLE' using errcode='42501'; end $$;
create trigger audit_no_edit before update or delete on public.audit_logs for each row execute function private.immutable_audit();
create trigger audit_no_truncate before truncate on public.audit_logs for each statement execute function private.immutable_audit();

create or replace function public.toylogix_protect_profile() returns trigger
language plpgsql set search_path='' as $$ begin
  if current_user in ('anon','authenticated') then
    if new.id is distinct from old.id or new.auth_user_id is distinct from old.auth_user_id
      or new.email is distinct from old.email or new.parola is distinct from old.parola then
      raise exception 'Identity fields cannot be edited' using errcode='42501';
    end if;
    if new.rol is distinct from old.rol or new.status is distinct from old.status or new.is_active is distinct from old.is_active then
      if not private.is_admin() or old.auth_user_id=auth.uid() then
        raise exception 'Cannot change this account access' using errcode='42501';
      end if;
      if new.rol not in ('admin','user') or new.status not in ('approved','pending','rejected') then
        raise exception 'Invalid account role/status';
      end if;
    end if;
  end if;
  return new;
end $$;

-- Replace ALL prior policies: permissive policies would otherwise OR together.
do $$ declare p record; begin
  for p in select tablename,policyname from pg_policies where schemaname='public'
    and tablename in ('utilizatori','billing_profiles') loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;
alter table public.utilizatori enable row level security;
alter table public.billing_profiles enable row level security;
revoke delete on public.utilizatori from public,anon,authenticated;
grant select(is_active),update(is_active) on public.utilizatori to authenticated;
create policy account_read on public.utilizatori for select to authenticated
using((auth_user_id=(select auth.uid()) and (select private.account_enabled())) or (select private.is_admin()));
create policy account_update on public.utilizatori for update to authenticated
using((auth_user_id=(select auth.uid()) and (select private.account_access())) or (select private.is_admin()))
with check((auth_user_id=(select auth.uid()) and (select private.account_access())) or (select private.is_admin()));
create policy billing_read on public.billing_profiles for select to authenticated
using((user_id=(select auth.uid()) and (select private.account_access())) or (select private.is_admin()));
create policy billing_insert on public.billing_profiles for insert to authenticated
with check(user_id=(select auth.uid()) and (select private.account_access()));
create policy billing_update on public.billing_profiles for update to authenticated
using(user_id=(select auth.uid()) and (select private.account_access()))
with check(user_id=(select auth.uid()) and (select private.account_access()));
create policy audit_admin_read on public.audit_logs for select to authenticated using((select private.is_admin()));

create function private.deactivate_account(p_target_id bigint,p_disabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_MFA_REQUIRED' using errcode='42501'; end if;
  if p_disabled is null then raise exception 'Disabled value required'; end if;
  perform 1 from public.utilizatori where id=p_target_id and auth_user_id is distinct from auth.uid() for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND_OR_SELF'; end if;
  update public.utilizatori set is_active=not p_disabled where id=p_target_id;
end $$;
create function public.deactivate_account(p_target_id bigint,p_disabled boolean) returns void
language sql security invoker set search_path='' as $$ select private.deactivate_account(p_target_id,p_disabled); $$;

create function private.delete_profile(p_target_id bigint) returns void
language plpgsql security definer set search_path='' as $$
declare target public.utilizatori%rowtype;
begin
  if not private.is_admin() then raise exception 'ADMIN_MFA_REQUIRED' using errcode='42501'; end if;
  select * into target from public.utilizatori where id=p_target_id for update;
  if not found or target.auth_user_id=auth.uid() then raise exception 'ACCOUNT_NOT_FOUND_OR_SELF'; end if;
  if target.auth_user_id is not null then
    insert into private.deleted_profiles(user_id) values(target.auth_user_id) on conflict do nothing;
  end if;
  delete from public.utilizatori where id=p_target_id;
  -- Auth, billing and stock audit remain. No profile => no application access.
end $$;
create function public.delete_profile(p_target_id bigint) returns void
language sql security invoker set search_path='' as $$ select private.delete_profile(p_target_id); $$;

create function private.prepare_account_deletion(p_target_id bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.utilizatori%rowtype;
begin
  if not private.is_admin() then raise exception 'ADMIN_MFA_REQUIRED' using errcode='42501'; end if;
  select * into target from public.utilizatori where id=p_target_id for update;
  if not found or target.auth_user_id is null or target.auth_user_id=auth.uid() then raise exception 'ACCOUNT_NOT_FOUND_OR_SELF'; end if;
  if exists(select 1 from public.stock_movements where created_by=target.auth_user_id) then
    raise exception 'ACCOUNT_HAS_RETAINED_HISTORY';
  end if;
  update public.utilizatori set is_active=false where id=p_target_id;
  insert into public.audit_logs(actor_id,target_user_id,action,old_value,new_value)
  values(auth.uid(),target.auth_user_id,'account_delete_requested',jsonb_build_object('is_active',target.is_active),'{"is_active":false}');
  return target.auth_user_id;
end $$;
create function public.prepare_account_deletion(p_target_id bigint) returns uuid
language sql security invoker set search_path='' as $$ select private.prepare_account_deletion(p_target_id); $$;

-- Do not silently recreate a deliberately deleted profile on an Auth update.
create or replace function public.toylogix_create_profile() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if exists(select 1 from private.deleted_profiles where user_id=new.id) then return new; end if;
  if exists(select 1 from public.utilizatori where auth_user_id=new.id) then return new; end if;
  if exists(select 1 from public.utilizatori where lower(trim(email))=lower(new.email)) then
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

create table private.auth_rate_limits (
  key_hash text primary key check(length(key_hash)=64),
  window_started_at timestamptz not null,
  attempts integer not null
);
alter table private.auth_rate_limits enable row level security;
create index auth_rate_limits_expiry on private.auth_rate_limits(window_started_at);
create function private.consume_rate_limit(p_key text,p_limit integer,p_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entry private.auth_rate_limits%rowtype; moment timestamptz:=clock_timestamp();
begin
  if p_limit<1 or p_limit>10000 or p_seconds<1 or p_seconds>86400 then raise exception 'Invalid rate configuration'; end if;
  -- Bounded cleanup; no valid window exceeds one day. Skip concurrent locks.
  delete from private.auth_rate_limits where key_hash in (
    select key_hash from private.auth_rate_limits
    where window_started_at < moment - interval '2 days'
    order by window_started_at limit 100 for update skip locked
  );
  insert into private.auth_rate_limits(key_hash,window_started_at,attempts) values(p_key,moment,1)
  on conflict(key_hash) do update set
    attempts=case when auth_rate_limits.window_started_at+make_interval(secs=>p_seconds)<=moment then 1 else least(auth_rate_limits.attempts+1,p_limit+1) end,
    window_started_at=case when auth_rate_limits.window_started_at+make_interval(secs=>p_seconds)<=moment then moment else auth_rate_limits.window_started_at end
  returning * into entry;
  return jsonb_build_object('allowed',entry.attempts<=p_limit,'retryAfter',greatest(1,ceil(extract(epoch from entry.window_started_at+make_interval(secs=>p_seconds)-moment))::integer));
end $$;
create function public.consume_auth_rate_limit(p_key text,p_limit integer,p_seconds integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.consume_rate_limit(p_key,p_limit,p_seconds); $$;

create table private.mfa_recovery_codes (
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash bytea not null,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,code_hash)
);
alter table private.mfa_recovery_codes enable row level security;
create function private.rotate_recovery_codes() returns text[]
language plpgsql security definer set search_path='' as $$
declare codes text[]:='{}'; code text; i integer;
begin
  if not private.is_admin() then raise exception 'ADMIN_MFA_REQUIRED' using errcode='42501'; end if;
  perform 1 from public.utilizatori where auth_user_id=auth.uid() for update;
  delete from private.mfa_recovery_codes where user_id=auth.uid();
  for i in 1..10 loop
    code:=replace(gen_random_uuid()::text,'-','');
    insert into private.mfa_recovery_codes(user_id,code_hash) values(auth.uid(),sha256(convert_to(code,'UTF8')));
    codes:=array_append(codes,code);
  end loop;
  insert into public.audit_logs(actor_id,target_user_id,action,new_value)
    values(auth.uid(),auth.uid(),'recovery_codes_rotated','{"count":10}');
  return codes;
end $$;
create function public.rotate_recovery_codes() returns text[]
language sql security invoker set search_path='' as $$ select private.rotate_recovery_codes(); $$;

create function private.consume_recovery_code(p_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare budget jsonb;
begin
  if not private.account_enabled() or not exists(select 1 from public.utilizatori where auth_user_id=auth.uid() and rol='admin' and status='approved') then
    raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501';
  end if;
  budget:=private.consume_rate_limit(encode(sha256(convert_to('mfa:'||auth.uid()::text,'UTF8')),'hex'),5,600);
  if not (budget->>'allowed')::boolean then return false; end if;
  update private.mfa_recovery_codes set consumed_at=clock_timestamp()
    where user_id=auth.uid() and code_hash=sha256(convert_to(lower(btrim(p_code)),'UTF8')) and consumed_at is null;
  if not found then return false; end if;
  insert into public.audit_logs(actor_id,target_user_id,action) values(auth.uid(),auth.uid(),'mfa_recovery_used');
  return true;
end $$;
create function public.consume_recovery_code(p_code text) returns boolean
language sql security invoker set search_path='' as $$ select private.consume_recovery_code(p_code); $$;

-- Optional invoices: only support the verified Auth-owner convention; never guess.
do $$ declare p record; begin
  if to_regclass('public.invoices') is not null then
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='user_id' and data_type='uuid') then
      raise exception 'Review invoices ownership before applying account_hardening';
    end if;
    alter table public.invoices enable row level security;
    for p in select policyname from pg_policies where schemaname='public' and tablename='invoices' loop
      execute format('drop policy %I on public.invoices',p.policyname);
    end loop;
    revoke all on public.invoices from public,anon,authenticated;
    grant select on public.invoices to authenticated;
    execute 'create policy invoice_read on public.invoices for select to authenticated using ((user_id=(select auth.uid()) and (select private.account_access())) or (select private.is_admin()))';
    create index if not exists invoices_user_id_security_idx on public.invoices(user_id);
    -- Existing invoice FKs must retain financial history when Auth is deleted.
    for p in select conname from pg_constraint where conrelid='public.invoices'::regclass and contype='f' and confrelid='auth.users'::regclass loop
      execute format('alter table public.invoices drop constraint %I',p.conname);
    end loop;
    alter table public.invoices add constraint invoice_auth_owner_fk foreign key(user_id) references auth.users(id) on delete restrict;
  end if;
end $$;

revoke all on all tables in schema private from public,anon,authenticated,service_role;
revoke execute on all functions in schema private from public,anon,authenticated,service_role;
grant execute on function private.session_valid(),private.mfa_verified(),private.account_enabled(),private.account_access(),private.is_admin(),private.is_approved(),
  private.deactivate_account(bigint,boolean),private.delete_profile(bigint),private.prepare_account_deletion(bigint),private.rotate_recovery_codes(),private.consume_recovery_code(text) to authenticated;
grant execute on function private.consume_rate_limit(text,integer,integer) to service_role;
revoke all on function public.toylogix_create_profile(),public.toylogix_protect_profile(),public.toylogix_is_admin(),public.toylogix_is_approved(),
  public.deactivate_account(bigint,boolean),public.delete_profile(bigint),public.prepare_account_deletion(bigint),public.rotate_recovery_codes(),public.consume_recovery_code(text),
  public.consume_auth_rate_limit(text,integer,integer) from public,anon,authenticated;
revoke execute on function public.save_my_account(jsonb) from public,anon;
grant execute on function public.toylogix_is_admin(),public.toylogix_is_approved(),public.deactivate_account(bigint,boolean),public.delete_profile(bigint),
  public.prepare_account_deletion(bigint),public.rotate_recovery_codes(),public.consume_recovery_code(text) to authenticated;
grant execute on function public.consume_auth_rate_limit(text,integer,integer) to service_role;
commit;
