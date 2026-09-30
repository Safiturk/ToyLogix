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

export async function loadInventoryDashboard(client: SupabaseClient, signal: AbortSignal, page: number) {
  const [totals, critical] = await Promise.all([
    client.rpc("admin_inventory_stats").abortSignal(signal),
    client.from("inventory_products").select(SUMMARY_COLUMNS, { count: "exact" })
      .eq("is_archived", false).eq("stock_is_critical", true)
      .order("id", { ascending: false }).range((page - 1) * 12, page * 12 - 1)
      .abortSignal(signal).overrideTypes<InventorySummary[], { merge: false }>(),
  ]);
  // Support deployments that have products but not the optional dashboard migration.
  // Permission, network and query errors must still be reported to the administrator.
  for (const [error, code, name] of [
    [totals.error, "PGRST202", "admin_inventory_stats"],
    [critical.error, "PGRST205", "inventory_products"],
  ] as const) {
    if (error && !(error.code === code && error.message.includes(name))) throw error;
  }
  if (!totals.error && !critical.error) {
    if (!totals.data || !Array.isArray(critical.data)) throw new Error("Invalid inventory response");
    return { stats: totals.data as InventoryStats, critical: critical.data, criticalCount: critical.count ?? 0 };
  }
  const products = await loadInventorySummary(client, signal);
  const stats: InventoryStats = { products: products.length, stock: 0, retail: 0, wholesale: 0, critical: 0 };
  const lowStock: InventorySummary[] = [];
  for (const product of products) {
    stats.stock += Number(product.stoc_actual) || 0;
    stats.retail += (Number(product.stoc_actual) || 0) * (Number(product.pret_retail) || 0);
    stats.wholesale += (Number(product.stoc_actual) || 0) * (Number(product.pret_engros) || 0);
    if (product.stoc_actual != null && product.stoc_critic != null && product.stoc_actual <= product.stoc_critic) lowStock.push(product);
  }
  stats.critical = lowStock.length;
  lowStock.sort((a, b) => b.id! - a.id!);
  return { stats, critical: lowStock.slice((page - 1) * 12, page * 12), criticalCount: lowStock.length };
}
