-- Compatible with both the current catalog and the optional stock migration.
create view public.inventory_products with (security_invoker=true) as
select id,cod_bara,nume_produs,categorie,brand,varsta_recomandata,material,
pret_retail,pret_engros,bucati_per_cutie,stoc_actual,stoc_critic,
coalesce((to_jsonb(p)->>'is_archived')::boolean,false) as is_archived,
coalesce((to_jsonb(p)->>'opening_stock')::integer,0) as opening_stock,
stoc_critic as critical_stock_level, (stoc_actual<=stoc_critic) as stock_is_critical
from public.produse p;
revoke all on public.inventory_products from public, anon;
grant select on public.inventory_products to authenticated;

create function public.admin_inventory_stats() returns jsonb
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

create function public.catalog_facets(p_category text default null)
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
create index if not exists products_category_page on public.produse(categorie,id desc);
create index if not exists products_brand_page on public.produse(brand,id desc);
create index if not exists products_price_page on public.produse(pret_engros,id desc);
create index if not exists products_name_page on public.produse(nume_produs,id desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy product_images_read on storage.objects for select to anon,authenticated using(bucket_id='product-images');
create policy product_images_admin_insert on storage.objects for insert to authenticated
with check(bucket_id='product-images' and public.toylogix_is_admin() and name ~ '^products/[a-f0-9-]+\.(webp|png|jpg)$');
create policy product_images_admin_delete on storage.objects for delete to authenticated
using(bucket_id='product-images' and public.toylogix_is_admin());
