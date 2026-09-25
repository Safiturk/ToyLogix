import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogField, CatalogFilters, ProductCard } from "./catalog.ts";

export const CARD_COLUMNS =
  "id,nume_produs,categorie,brand,varsta_recomandata,pret_retail,pret_engros,bucati_per_cutie,stoc_actual,imagini";
export const INVENTORY_COLUMNS = `${CARD_COLUMNS},cod_bara,material,stoc_critic,is_archived`;
export const DETAIL_COLUMNS = `${INVENTORY_COLUMNS},gen,descriere`;
const archiveSupport = new WeakMap<SupabaseClient, boolean>();

export async function hasArchiveColumn(
  client: SupabaseClient,
  signal?: AbortSignal,
) {
  const cached = archiveSupport.get(client);
  if (cached !== undefined) return cached;
  let query = client.from("produse").select("is_archived").limit(0);
  if (signal) query = query.abortSignal(signal);
  const { error } = await query;
  if (
    error &&
    !(error.code === "42703" && error.message.includes("is_archived"))
  )
    throw error;
  archiveSupport.set(client, !error);
  return !error;
}

export interface ProductPageFilters extends Partial<CatalogFilters> {
  category?: string;
  sort?: string;
  page: number;
  pageSize: number;
  archive?: "active" | "archived" | "all";
}

// Quote PostgREST grammar separately from SQL LIKE wildcards.
export function searchPattern(value: string) {
  return JSON.stringify(`%${value.trim().replace(/[\\%_*]/g, "\\$&")}%`);
}

export function productPageQuery(
  client: SupabaseClient,
  filters: ProductPageFilters,
  inventory = false,
  archiveAvailable = true,
) {
  const columns = inventory
    ? archiveAvailable
      ? INVENTORY_COLUMNS
      : INVENTORY_COLUMNS.replace(",is_archived", "")
    : CARD_COLUMNS;
  let query = client.from("produse").select(columns, { count: "exact" });
  if (archiveAvailable && filters.archive !== "all")
    query = query.eq("is_archived", filters.archive === "archived");
  if (!archiveAvailable && filters.archive === "archived")
    query = query.eq("id", -1);
  if (filters.category !== undefined)
    query = query.eq("categorie", filters.category);
  if (filters.query?.trim()) {
    const pattern = searchPattern(filters.query);
    query = query.or(
      `nume_produs.ilike.${pattern},brand.ilike.${pattern},cod_bara.ilike.${pattern}`,
    );
  }
  for (const [field, values] of [
    ["brand", filters.brands],
    ["material", filters.materials],
  ] as const) {
    if (values?.length === 1) query = query.eq(field, values[0]);
    else if (values?.length) query = query.in(field, values);
  }
  if (filters.age) query = query.eq("varsta_recomandata", filters.age);
  if (filters.stockOnly) query = query.gt("stoc_actual", 0);
  for (const [value, operator] of [
    [filters.minPrice, "gte"],
    [filters.maxPrice, "lte"],
  ] as const) {
    if (value?.trim() && Number.isFinite(Number(value)))
      query = query[operator]("pret_engros", Number(value));
  }
  if (filters.sort === "price-up" || filters.sort === "price-down") {
    query = query.order("pret_engros", {
      ascending: filters.sort === "price-up",
      nullsFirst: false,
    });
  } else if (filters.sort === "name")
    query = query.order("nume_produs", { ascending: true, nullsFirst: false });
  // Unique tie-breaker keeps equal-price/name rows stable between pages.
  query = query.order("id", { ascending: false });
  const size = Math.max(1, Math.min(100, Math.trunc(filters.pageSize) || 12));
  const from = (Math.max(1, Math.trunc(filters.page) || 1) - 1) * size;
  return query.range(from, from + size - 1);
}

async function loadLegacyFacet(client: SupabaseClient, field: CatalogField, signal: AbortSignal, category?: string) {
  const archiveAvailable = await hasArchiveColumn(client, signal);
  const values = new Set<string>();
  for (let offset = 0; ; ) {
    let query = client.from("produse").select(`id,${field}`).order("id");
    if (archiveAvailable) query = query.eq("is_archived", false);
    if (category !== undefined) query = query.eq("categorie", category);
    const { data, error } = await query.range(offset, offset + 499).abortSignal(signal)
      .overrideTypes<Record<string, unknown>[], { merge: false }>();
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Invalid facet response");
    if (!data.length) return [...values].sort((a, b) => a.localeCompare(b, "ro"));
    for (const row of data) {
      const value = row[field];
      if (typeof value === "string" && value.trim()) values.add(value);
    }
    offset += data.length;
  }
}

export async function loadFacet(client: SupabaseClient, field: CatalogField, signal: AbortSignal, category?: string) {
  const values: string[] = [];
  for (let offset = 0; ; ) {
    const { data, error } = await client.rpc("catalog_facets", { p_category: category ?? null })
      .eq("field", field).order("value").range(offset, offset + 499).abortSignal(signal)
      .overrideTypes<{ value: string }[], { merge: false }>();
    // Older deployments have the product table but not the facet RPC yet.
    if (error?.code === "PGRST202" && error.message.includes("catalog_facets"))
      return loadLegacyFacet(client, field, signal, category);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Invalid facet response");
    if (!data.length) return values;
    values.push(...data.map((row) => row.value));
    offset += data.length;
  }
}

export async function loadFavoriteProducts(
  client: SupabaseClient,
  ids: number[],
  signal: AbortSignal,
) {
  if (!ids.length) return [];
  const archiveAvailable = await hasArchiveColumn(client, signal);
  const products: ProductCard[] = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    let query = client.from("produse").select(CARD_COLUMNS);
    if (archiveAvailable) query = query.eq("is_archived", false);
    const { data, error } = await query
      .in("id", ids.slice(offset, offset + 50))
      .order("id", { ascending: false })
      .range(0, 49)
      .abortSignal(signal)
      .overrideTypes<ProductCard[], { merge: false }>();
    if (error) throw error;
    products.push(...(data ?? []));
  }
  return products;
}
