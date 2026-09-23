-- Minimal Auth metadata used by the new authorization checks, without secrets.
create role service_role nologin bypassrls;
alter table auth.users add column banned_until timestamptz, add column deleted_at timestamptz;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}');
$$;
create table auth.mfa_factors (
  id uuid primary key, user_id uuid references auth.users(id) on delete cascade,
  status text, factor_type text
);
create table auth.sessions (
  id uuid primary key, user_id uuid references auth.users(id) on delete cascade,
  factor_id uuid references auth.mfa_factors(id) on delete set null,
  aal text default 'aal1', not_after timestamptz
);
insert into auth.mfa_factors values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','verified','totp');
insert into auth.sessions(id,user_id,factor_id,aal) values
('11111111-0000-4000-8000-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aal2'),
('22222222-0000-4000-8000-222222222222','22222222-2222-4222-8222-222222222222',null,'aal1');
