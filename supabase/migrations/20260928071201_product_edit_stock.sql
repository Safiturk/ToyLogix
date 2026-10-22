-- Metadata and an optional absolute stock adjustment commit together.
create function public.update_product_with_stock(
  p_product_id bigint, p_metadata jsonb,
  p_stock integer default null, p_expected_stock integer default null
) returns public.produse
language plpgsql security invoker set search_path='' as $$
declare
  product public.produse;
  edited public.produse;
  allowed jsonb;
begin
  if not public.toylogix_is_admin() then
    raise exception 'STOCK_ADMIN_REQUIRED' using errcode='42501';
  end if;
  select * into product from public.produse where id=p_product_id for update;
  if not found then raise exception 'STOCK_PRODUCT_MISSING'; end if;
  if p_stock is not null then
    if p_stock < 0 then raise exception 'STOCK_INVALID_QUANTITY'; end if;
    if p_expected_stock is null then raise exception 'STOCK_CHANGED'; end if;
    if p_stock <> product.stoc_actual then
      if product.stoc_actual <> p_expected_stock then raise exception 'STOCK_CHANGED'; end if;
      perform public.record_stock_movement(p_product_id,'count_adjustment',
        p_stock-product.stoc_actual,'Ajustare manuala din editare produs');
    end if;
  end if;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into allowed
  from jsonb_each(p_metadata) where key = any(array[
    'cod_bara','nume_produs','categorie','brand','varsta_recomandata','gen',
    'material','pret_retail','pret_engros','bucati_per_cutie','stoc_critic','imagini','descriere']);
  edited := jsonb_populate_record(product,allowed);
  update public.produse set
    cod_bara=edited.cod_bara,nume_produs=edited.nume_produs,categorie=edited.categorie,
    brand=edited.brand,varsta_recomandata=edited.varsta_recomandata,gen=edited.gen,
    material=edited.material,pret_retail=edited.pret_retail,pret_engros=edited.pret_engros,
    bucati_per_cutie=edited.bucati_per_cutie,stoc_critic=edited.stoc_critic,
    imagini=edited.imagini,descriere=edited.descriere
  where id=p_product_id returning * into product;
  return product;
end $$;
revoke all on function public.update_product_with_stock(bigint,jsonb,integer,integer) from public,anon;
grant execute on function public.update_product_with_stock(bigint,jsonb,integer,integer) to authenticated;
