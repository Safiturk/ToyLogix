import { supabase } from "./supabase";
import {
  movementQueryOptions,
  movementQuantity,
  validateStockBalance,
  type MovementFilters,
  type MovementType,
  type StockMovement,
} from "./stock-rules";

export { MOVEMENT_PAGE_SIZE } from "./stock-rules";

export async function listStockMovements(
  filters: MovementFilters,
  signal?: AbortSignal,
) {
  const { start, end, equals, first, last } = movementQueryOptions(filters);
  let query = supabase.from("stock_movements").select("*", { count: "exact" });
  for (const [column, value] of equals) query = query.eq(column, value);
  if (start) query = query.gte("created_at", start);
  if (end) query = query.lt("created_at", end);
  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(first, last);
  if (signal) query = query.abortSignal(signal);
  const { data, count, error } = await query;
  if (error) throw error;
  return { movements: (data ?? []) as StockMovement[], count: count ?? 0 };
}

export async function recordStockMovement(input: {
  productId: number;
  type: Exclude<MovementType, "reversal">;
  amount: number;
  currentStock: number;
  reason: string;
  notes?: string;
}) {
  const quantity = movementQuantity(input.type, input.amount, input.reason);
  validateStockBalance(input.currentStock, quantity);
  const { data, error } = await supabase.rpc("record_stock_movement", {
    p_product_id: input.productId,
    p_movement_type: input.type,
    p_quantity: quantity,
    p_reason: input.reason.trim(),
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw error;
  return data as StockMovement;
}

export async function reverseStockMovement(
  movement: StockMovement,
  currentStock: number,
  reason: string,
) {
  if (!reason.trim()) throw new Error("Motivul stornării este obligatoriu.");
  if (movement.movement_type === "reversal" || movement.reversed_at)
    throw new Error("Această mișcare nu poate fi stornată.");
  validateStockBalance(currentStock, -movement.quantity);
  const { data, error } = await supabase.rpc("record_stock_movement", {
    p_product_id: movement.product_id,
    p_movement_type: "reversal",
    p_quantity: null,
    p_reason: reason.trim(),
    p_reversal_of: movement.id,
  });
  if (error) throw error;
  return data as StockMovement;
}

export async function archiveProduct(id: number, archived: boolean) {
  const { data, error } = await supabase
    .from("produse")
    .update({ is_archived: archived })
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}
