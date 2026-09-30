-- Apply after reconciling legacy invalid values; never silently change prices.
-- Table checks protect both direct Data API writes and product-edit RPC calls.
begin;
alter table public.produse
  add constraint product_retail_nonnegative_finite
    check (pret_retail >= 0 and pret_retail < 'Infinity'::numeric),
  add constraint product_wholesale_nonnegative_finite
    check (pret_engros >= 0 and pret_engros < 'Infinity'::numeric),
  add constraint product_pack_positive
    check (bucati_per_cutie >= 1),
  add constraint product_opening_stock_nonnegative
    check (opening_stock >= 0);

-- These optional legacy columns are absent from some installations.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='produse' and column_name='greutate_gramaj') then
    alter table public.produse add constraint product_weight_nonnegative
      check (greutate_gramaj >= 0);
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='produse' and column_name='volum_dm3') then
    alter table public.produse add constraint product_volume_nonnegative_finite
      check (volum_dm3 >= 0 and volum_dm3 < 'Infinity'::numeric);
  end if;
end $$;
commit;
