-- Credentials are encrypted by Vault and readable only by the hosted worker.
-- Worker schema usage is granted in the follow-up access migration.
create or replace function private.order_mail_config()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'apiKey',(select decrypted_secret from vault.decrypted_secrets where name='toylogix_order_resend_key'),
  'from','comenzi@toylogix.eu',
  'to','romehmetsafi@gmail.com',
  'siteUrl','https://toylogix.eu'
 );
$$;
revoke all on function private.order_mail_config() from public,anon,authenticated;
grant execute on function private.order_mail_config() to service_role;
create or replace function public.order_mail_config()
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.order_mail_config();
$$;
revoke all on function public.order_mail_config() from public,anon,authenticated;
grant execute on function public.order_mail_config() to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
-- Set the named project URL and anon JWT in Vault at deployment. Neither is a
-- privileged key. If absent the job simply waits until deployment is finished.
select cron.schedule('toylogix-order-emails','*/5 * * * *',$job$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='toylogix_order_project_url')||'/functions/v1/order-notifications',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='toylogix_order_anon_key')),
  body:='{"action":"process"}'::jsonb,
  timeout_milliseconds:=60000
 ) where exists(select 1 from vault.secrets where name='toylogix_order_resend_key')
   and exists(select 1 from vault.secrets where name='toylogix_order_project_url')
   and exists(select 1 from vault.secrets where name='toylogix_order_anon_key');
$job$);
