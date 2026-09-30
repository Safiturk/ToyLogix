begin;
update public.b2b_payment_settings set iban='RO49 BTRL 0000 1234 5678 9001',beneficiary=case when beneficiary='ToyLogix (date demonstrative)' then 'ToyLogix' else beneficiary end,bank=case when bank='Cont demonstrativ' then 'Banca Transilvania' else bank end where id;
-- Replace the old demonstration details only on open, unpaid orders.
update public.b2b_orders set bank_iban='RO49 BTRL 0000 1234 5678 9001',bank_beneficiary=case when bank_beneficiary='ToyLogix (date demonstrative)' then 'ToyLogix' else bank_beneficiary end,bank_name=case when bank_name='Cont demonstrativ' then 'Banca Transilvania' else bank_name end where bank_iban='RO1111111111111' and status in ('pending_review','awaiting_payment','payment_under_review');
create table public.b2b_notification_reads(user_id uuid primary key references auth.users(id) on delete cascade,seen_at timestamptz not null default now());
alter table public.b2b_notification_reads enable row level security;
revoke all on public.b2b_notification_reads from public,anon,authenticated;
grant select,insert,update on public.b2b_notification_reads to authenticated;
create policy notification_reads_select on public.b2b_notification_reads for select to authenticated using(user_id=auth.uid() and public.toylogix_is_approved());
create policy notification_reads_insert on public.b2b_notification_reads for insert to authenticated with check(user_id=auth.uid() and public.toylogix_is_approved());
create policy notification_reads_update on public.b2b_notification_reads for update to authenticated using(user_id=auth.uid() and public.toylogix_is_approved()) with check(user_id=auth.uid() and public.toylogix_is_approved());
create function public.order_inbox() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'unread',(select count(*) from public.b2b_order_events e where e.created_at>coalesce((select seen_at from public.b2b_notification_reads where user_id=auth.uid()),'epoch'::timestamptz)),
 'counts',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from (select status,count(*) n from public.b2b_orders group by status) c),
 'notifications',(select coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb) from (select e.id,e.order_id,e.status,e.created_at,o.code,e.created_at>coalesce((select seen_at from public.b2b_notification_reads where user_id=auth.uid()),'epoch'::timestamptz) as unread from public.b2b_order_events e join public.b2b_orders o on o.id=e.order_id order by e.created_at desc,e.id desc limit 8) n),
 'latest',(select coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) from (select id,code,status,total_cents,customer_email,company,created_at from public.b2b_orders order by created_at desc,id desc limit 5) o)
 );
$$;
create function public.mark_order_notifications_read(p_until timestamptz) returns void language sql security invoker set search_path='' as $$
 insert into public.b2b_notification_reads(user_id,seen_at) values(auth.uid(),least(p_until,now())) on conflict(user_id) do update set seen_at=greatest(b2b_notification_reads.seen_at,excluded.seen_at);
$$;
revoke all on function public.order_inbox(),public.mark_order_notifications_read(timestamptz) from public,anon;
grant execute on function public.order_inbox(),public.mark_order_notifications_read(timestamptz) to authenticated;
create table public.b2b_order_status_notifications(event_id bigint primary key references public.b2b_order_events(id),order_id uuid not null references public.b2b_orders(id),status text not null,sent_at timestamptz,claimed_at timestamptz);
create index b2b_status_mail_pending on public.b2b_order_status_notifications(event_id) where sent_at is null;
alter table public.b2b_order_status_notifications enable row level security;
revoke all on public.b2b_order_status_notifications from public,anon,authenticated;
grant all on public.b2b_order_status_notifications to service_role;
create function toylogix_order_private.queue_order_status_email() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if new.status<>'pending_review' then insert into public.b2b_order_status_notifications(event_id,order_id,status) values(new.id,new.order_id,new.status); end if;
 return new;
 end;
$$;
revoke all on function toylogix_order_private.queue_order_status_email() from public,anon,authenticated;
create trigger b2b_order_status_email after insert on public.b2b_order_events for each row execute function toylogix_order_private.queue_order_status_email();
insert into public.b2b_order_status_notifications(event_id,order_id,status) select id,order_id,status from public.b2b_order_events where status<>'pending_review';
create function toylogix_order_private.order_email_state(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 begin
 if auth.uid() is null or not public.toylogix_is_approved() or not exists(select 1 from public.b2b_orders where id=p_id and (user_id=auth.uid() or public.toylogix_is_admin())) then raise exception 'ORDER_ACCESS_DENIED'; end if;
 return jsonb_build_object('sent_at',(select sent_at from public.b2b_order_notifications where order_id=p_id),'pending_updates',(select count(*) from public.b2b_order_status_notifications where order_id=p_id and sent_at is null));
 end;
$$;
revoke all on function toylogix_order_private.order_email_state(uuid) from public,anon;
grant execute on function toylogix_order_private.order_email_state(uuid) to authenticated;
create function public.order_email_state(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select toylogix_order_private.order_email_state(p_id); $$;
revoke all on function public.order_email_state(uuid) from public,anon;
grant execute on function public.order_email_state(uuid) to authenticated;
commit;
