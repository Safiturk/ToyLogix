-- Restore the admin dashboard independently of optional MFA/storage rollouts.
-- Requires account_security and stock_management. Never fabricates audit history.
begin;
create schema if not exists private;
revoke all on schema private from public,anon;

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  target_user_id uuid,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists audit_logs_target_date on public.audit_logs(target_user_id,created_at desc);
create index if not exists audit_logs_date on public.audit_logs(created_at desc,id desc);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from public,anon,authenticated;
revoke all on sequence public.audit_logs_id_seq from public,anon,authenticated;
grant select on public.audit_logs to authenticated;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='audit_admin_read') then
    create policy audit_admin_read on public.audit_logs for select to authenticated
      using((select public.toylogix_is_admin()));
  end if;
end $$;

-- The trigger needs elevated INSERT rights: clients must never write audit rows.
-- Kept outside exposed schemas and not executable directly by API roles.
create or replace function private.audit_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare k text;
begin
  if auth.uid() is null and current_setting('role',true)='authenticated' then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
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
revoke all on function private.audit_profile() from public,anon,authenticated,service_role;
drop trigger if exists audit_profile_changes on public.utilizatori;
create trigger audit_profile_changes after update or delete on public.utilizatori
for each row execute function private.audit_profile();

create or replace function private.immutable_audit() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'AUDIT_IMMUTABLE' using errcode='42501'; end $$;
revoke all on function private.immutable_audit() from public,anon,authenticated,service_role;
drop trigger if exists audit_no_edit on public.audit_logs;
drop trigger if exists audit_no_truncate on public.audit_logs;
create trigger audit_no_edit before update or delete on public.audit_logs for each row execute function private.immutable_audit();
create trigger audit_no_truncate before truncate on public.audit_logs for each statement execute function private.immutable_audit();

create or replace view public.inventory_products with (security_invoker=true) as
select id,cod_bara,nume_produs,categorie,brand,varsta_recomandata,material,
pret_retail,pret_engros,bucati_per_cutie,stoc_actual,stoc_critic,
coalesce((to_jsonb(p)->>'is_archived')::boolean,false) as is_archived,
coalesce((to_jsonb(p)->>'opening_stock')::integer,0) as opening_stock,
stoc_critic as critical_stock_level,(stoc_actual<=stoc_critic) as stock_is_critical
from public.produse p;
revoke all on public.inventory_products from public,anon;
grant select on public.inventory_products to authenticated;

create or replace function public.admin_inventory_stats() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.toylogix_is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  return (select jsonb_build_object('products',count(*),'stock',coalesce(sum(stoc_actual),0),
    'retail',coalesce(sum(stoc_actual*pret_retail),0),'wholesale',coalesce(sum(stoc_actual*pret_engros),0),
    'critical',count(*) filter(where stock_is_critical))
    from public.inventory_products where not is_archived);
end;
$$;
revoke all on function public.admin_inventory_stats() from public,anon;
grant execute on function public.admin_inventory_stats() to authenticated;
notify pgrst, 'reload schema';
commit;
