-- Only verified new registrations are sent; existing users are not backfilled.
create table public.registration_notifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.registration_notifications enable row level security;
revoke all on public.registration_notifications from public, anon, authenticated;
grant select, update on public.registration_notifications to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create function private.queue_registration_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.auth_user_id is not null then
    insert into public.registration_notifications(user_id) values(new.auth_user_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.queue_registration_notification() from public, anon, authenticated;
create trigger registration_notification after insert on public.utilizatori
for each row execute function private.queue_registration_notification();

create function public.claim_registration_notifications()
returns table(user_id uuid, email text, name text, phone text, company text)
language sql security definer set search_path = '' as $$
  with candidates as (
    select n.user_id from public.registration_notifications n
    join auth.users u on u.id=n.user_id
    where n.sent_at is null and n.attempts<10 and n.next_attempt_at<=now()
      and u.email_confirmed_at is not null
    order by n.created_at for update of n skip locked limit 3
  ), claimed as (
    update public.registration_notifications n set attempts=n.attempts+1,
      next_attempt_at=now()+make_interval(secs => least(3600, (300*power(2,n.attempts))::integer))
    from candidates c where c.user_id=n.user_id returning n.user_id
  ) select c.user_id, u.email::text, p.nume_complet::text, p.telefon::text, p.nume_firma::text
    from claimed c join auth.users u on u.id=c.user_id join public.utilizatori p on p.auth_user_id=c.user_id;
$$;
revoke all on function public.claim_registration_notifications() from public, anon, authenticated;
grant execute on function public.claim_registration_notifications() to service_role;
create index registration_notifications_pending on public.registration_notifications(next_attempt_at)
where sent_at is null and attempts<10;
