import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryProduct } from "../app/admin/models.ts";
import { hasArchiveColumn } from "./catalog-query.ts";

export type InventorySummary = Omit<
  InventoryProduct,
  "gen" | "imagini" | "descriere"
>;
const SUMMARY_COLUMNS =
  "id,cod_bara,nume_produs,categorie,brand,varsta_recomandata,material,pret_retail,pret_engros,bucati_per_cutie,stoc_actual,stoc_critic,critical_stock_level,is_archived,opening_stock";

// Dashboard totals, stock selectors and exports need the complete inventory,
// but never its large images/descriptions. Fetch bounded batches beyond API caps.
export async function loadInventorySummary(
  client: SupabaseClient,
  signal?: AbortSignal,
) {
  const archiveAvailable = await hasArchiveColumn(client, signal);
  const columns = archiveAvailable
    ? SUMMARY_COLUMNS
    : SUMMARY_COLUMNS.replace(
        ",critical_stock_level,is_archived,opening_stock",
        "",
      );
  const products: InventorySummary[] = [];
  let after = 0;
  for (;;) {
    let query = client
      .from("produse")
      .select(columns)
      .gt("id", after)
      .order("id")
      .range(0, 499);
    if (archiveAvailable) query = query.eq("is_archived", false);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.overrideTypes<
      InventorySummary[],
      { merge: false }
    >();
    if (error) throw error;
    if (!data?.length) return products;
    products.push(...data);
    after = data[data.length - 1].id!;
  }
}

export const INVENTORY_SUMMARY_COLUMNS = SUMMARY_COLUMNS;
export interface InventoryStats { products: number; stock: number; retail: number; wholesale: number; critical: number }
export async function loadInventoryStats(client: SupabaseClient, signal: AbortSignal) {
  const { data, error } = await client.rpc("admin_inventory_stats").abortSignal(signal);
  if (error) throw error;
  return data as InventoryStats;
}
