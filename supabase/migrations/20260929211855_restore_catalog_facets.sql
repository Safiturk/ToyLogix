-- Restore the catalog RPC independently of the storage/inventory migration.
-- SECURITY INVOKER preserves the existing product row-level access policies.
create or replace function public.catalog_facets(p_category text default null)
returns table(field text,value text,product_count bigint)
language sql stable security invoker set search_path='' as $$
  select v.field,v.value,count(*) from public.produse p
  cross join lateral (values ('categorie',p.categorie::text),('brand',p.brand::text),
    ('material',p.material::text),('varsta_recomandata',p.varsta_recomandata::text)) v(field,value)
  where not coalesce((to_jsonb(p)->>'is_archived')::boolean,false)
    and (p_category is null or p.categorie=p_category) and nullif(btrim(v.value),'') is not null
  group by v.field,v.value;
$$;
revoke all on function public.catalog_facets(text) from public,anon;
grant execute on function public.catalog_facets(text) to authenticated;

notify pgrst, 'reload schema';
