-- Run after the migration using SQL Editor as postgres.
-- Fixtures and all data writes are rolled back. No emails or passwords are created.
begin;
select set_config('toylogix.test_a',gen_random_uuid()::text,true),set_config('toylogix.test_b',gen_random_uuid()::text,true);
select set_config('toylogix.owner',(select auth_user_id::text from public.utilizatori where rol='admin' and status='approved' limit 1),true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values(current_setting('toylogix.test_a')::uuid,'security-a-'||current_setting('toylogix.test_a')||'@example.invalid',now(),'{"nume_complet":"Test A","telefon":"0000000000","rol":"admin","status":"approved"}'),
(current_setting('toylogix.test_b')::uuid,'security-b-'||current_setting('toylogix.test_b')||'@example.invalid',now(),'{"nume_complet":"Test B","telefon":"0000000000"}');
do $$ begin
 if (select count(*) from public.utilizatori where auth_user_id in(current_setting('toylogix.test_a')::uuid,current_setting('toylogix.test_b')::uuid) and rol='user' and status='pending')<>2 then raise exception 'FAIL signup role injection'; end if;
 if has_table_privilege('authenticated','public.produse','TRUNCATE') or has_table_privilege('authenticated','public.billing_profiles','TRUNCATE') or has_table_privilege('authenticated','public.utilizatori','TRUNCATE') then raise exception 'FAIL truncate privileges'; end if;
 if has_column_privilege('anon','public.utilizatori','email','SELECT') or has_column_privilege('authenticated','public.utilizatori','parola','SELECT') then raise exception 'FAIL sensitive column grants'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('toylogix.test_a'),true);
set local role authenticated;
do $$ declare n integer; begin
 if public.toylogix_is_admin() or public.toylogix_is_approved() then raise exception 'FAIL pending access'; end if;
 if (select count(id) from public.utilizatori)<>1 then raise exception 'FAIL customer isolation'; end if;
 begin update public.utilizatori set rol='admin' where auth_user_id=auth.uid(); raise exception 'FAIL role escalation allowed'; exception when insufficient_privilege then null; end;
 begin update public.utilizatori set status='approved' where auth_user_id=auth.uid(); raise exception 'FAIL self approval allowed'; exception when insufficient_privilege then null; end;
 update public.utilizatori set nume_complet='unauthorized' where auth_user_id=current_setting('toylogix.test_b')::uuid;
 get diagnostics n=row_count; if n<>0 then raise exception 'FAIL cross customer update'; end if;
 perform public.save_my_account('{"nume_complet":"Updated Test A","telefon":"0000000001","nume_firma":"Test","tax_number":"TEST-ONLY","address_line1":"Test address","vat_registered":true,"rol":"admin"}');
 if (select count(*) from public.billing_profiles where tax_number='TEST-ONLY')<>1 or public.toylogix_is_admin() then raise exception 'FAIL own billing save'; end if;
 begin insert into public.billing_profiles(user_id) values(current_setting('toylogix.test_b')::uuid); raise exception 'FAIL cross billing insert'; exception when insufficient_privilege then null; end;
 begin
  perform public.save_my_account('{"nume_complet":"Must roll back","telefon":"0000000002","vat_registered":"invalid boolean"}');
  raise exception 'FAIL invalid billing accepted';
 exception when invalid_text_representation then null; end;
 if (select nume_complet from public.utilizatori where auth_user_id=auth.uid())<>'Updated Test A' then raise exception 'FAIL save atomicity'; end if;
end $$;
reset role;
update public.utilizatori set status='approved' where auth_user_id=current_setting('toylogix.test_a')::uuid;
set local role authenticated;
do $$ begin
 if not public.toylogix_is_approved() or public.toylogix_is_admin() then raise exception 'FAIL approved customer'; end if;
 perform id from public.produse;
 begin insert into public.produse(cod_bara,nume_produs,pret_retail,pret_engros) values('security-test-'||gen_random_uuid(),'Test',1,1); raise exception 'FAIL product write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('toylogix.owner'),true);
set local role authenticated;
do $$ begin
 if not public.toylogix_is_admin() then raise exception 'FAIL owner access'; end if;
 if (select count(id) from public.utilizatori where auth_user_id in(current_setting('toylogix.test_a')::uuid,current_setting('toylogix.test_b')::uuid))<>2 then raise exception 'FAIL admin customer read'; end if;
 if (select count(*) from public.billing_profiles where user_id=current_setting('toylogix.test_a')::uuid)<>1 then raise exception 'FAIL admin billing read'; end if;
 update public.utilizatori set rol='admin' where auth_user_id=current_setting('toylogix.test_a')::uuid;
 if not found then raise exception 'FAIL admin role grant'; end if;
 begin update public.utilizatori set rol='user' where auth_user_id=auth.uid(); raise exception 'FAIL self demotion allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('toylogix.test_a'),true);
set local role authenticated;
do $$ begin if not public.toylogix_is_admin() then raise exception 'FAIL granted admin'; end if; end $$;
reset role;
update public.utilizatori set rol='user' where auth_user_id=current_setting('toylogix.test_a')::uuid;
set local role authenticated;
do $$ begin if public.toylogix_is_admin() then raise exception 'FAIL role revocation'; end if; end $$;
reset role;
set local role anon;
do $$ begin
 begin perform email from public.utilizatori; raise exception 'FAIL anonymous customer read'; exception when insufficient_privilege then null; end;
 begin perform user_id from public.billing_profiles; raise exception 'FAIL anonymous billing read'; exception when insufficient_privilege then null; end;
 begin perform id from public.produse; raise exception 'FAIL anonymous products read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALL_SECURITY_TESTS_PASSED' result;
rollback;
