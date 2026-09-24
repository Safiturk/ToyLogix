-- Independently deployable on the September 19 schema. Auth deletion must
-- remove its profile atomically, rather than leave an unlinked legacy account.
-- No existing user is deleted by this migration. Retention FKs remain intact.
begin;
do $$
declare fk record;
begin
  for fk in
    select conname from pg_constraint
    where conrelid='public.utilizatori'::regclass and contype='f'
      and confrelid='auth.users'::regclass
      and conkey=array[(select attnum from pg_attribute
        where attrelid='public.utilizatori'::regclass and attname='auth_user_id')]
  loop
    execute format('alter table public.utilizatori drop constraint %I',fk.conname);
  end loop;
end $$;
alter table public.utilizatori add constraint utilizatori_auth_owner_fk
  foreign key(auth_user_id) references auth.users(id) on delete cascade;
commit;
