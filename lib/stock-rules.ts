export const movementLabels = {
  stock_in: "Intrare",
  stock_out: "Ieșire",
  return: "Retur",
  count_adjustment: "Corecție inventar",
  reversal: "Stornare",
} as const;

export type MovementType = keyof typeof movementLabels;
export type StockMovement = {
  product_name?: string;
  actor_name?: string;
  id: string;
  product_id: number;
  movement_type: MovementType;
  quantity: number;
  created_at: string;
  created_by: string;
  reason: string;
  reversal_of: string | null;
  notes: string | null;
  reversed_at: string | null;
};

export type MovementFilters = {
  productId?: number;
  from?: string;
  to?: string;
  userId?: string;
  type?: MovementType;
  page?: number;
};

// Date filters use the administrator's local calendar, with an exclusive end.
export function movementDateBounds(from?: string, to?: string) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error("Data nu este validă.");
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    )
      throw new Error("Data nu este validă.");
    return date;
  };
  const start = from ? parse(from) : undefined;
  const end = to ? parse(to) : undefined;
  if (start && end && start > end)
    throw new Error("Intervalul de date nu este valid.");
  if (end) end.setDate(end.getDate() + 1);
  return { start: start?.toISOString(), end: end?.toISOString() };
}

export function movementQuantity(
  type: Exclude<MovementType, "reversal">,
  amount: number,
  reason: string,
) {
  if (!reason.trim()) throw new Error("Motivul este obligatoriu.");
  if (
    !Number.isSafeInteger(amount) ||
    amount === 0 ||
    Math.abs(amount) > 2147483647
  )
    throw new Error(
      "Cantitatea trebuie să fie un număr întreg, diferit de zero.",
    );
  if (!Object.hasOwn(movementLabels, type) || (type as string) === "reversal")
    throw new Error("Tipul operațiunii nu este valid.");
  if (type !== "count_adjustment" && amount < 0)
    throw new Error("Introduceți o cantitate pozitivă.");
  return type === "stock_out" ? -amount : amount;
}

export function validateStockBalance(stock: number, delta: number) {
  if (!Number.isSafeInteger(delta) || delta === 0)
    throw new Error("Cantitatea nu este validă.");
  if (!Number.isSafeInteger(stock) || stock < 0 || stock + delta < 0)
    throw new Error("Stoc insuficient. Stocul nu poate deveni negativ.");
  if (stock + delta > 2147483647)
    throw new Error("Stocul depășește limita permisă.");
}

export function movementQueryOptions(filters: MovementFilters) {
  const { start, end } = movementDateBounds(filters.from, filters.to);
  const page = filters.page ?? 0;
  if (!Number.isInteger(page) || page < 0)
    throw new Error("Pagina nu este validă.");
  if (
    filters.productId !== undefined &&
    (!Number.isSafeInteger(filters.productId) || filters.productId <= 0)
  )
    throw new Error("Produsul nu este valid.");
  if (
    filters.userId &&
    !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(filters.userId)
  )
    throw new Error("Selectați un utilizator sau introduceți ID-ul complet.");
  if (filters.type && !Object.hasOwn(movementLabels, filters.type))
    throw new Error("Tipul operațiunii nu este valid.");
  const equals: [string, string | number][] = [];
  if (filters.productId !== undefined)
    equals.push(["product_id", filters.productId]);
  if (filters.userId) equals.push(["created_by", filters.userId]);
  if (filters.type) equals.push(["movement_type", filters.type]);
  return {
    equals,
    start,
    end,
    first: page * MOVEMENT_PAGE_SIZE,
    last: (page + 1) * MOVEMENT_PAGE_SIZE - 1,
  };
}

export const MOVEMENT_PAGE_SIZE = 50;

export function stockError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  const messages: Record<string, string> = {
    STOCK_INSUFFICIENT:
      "Stoc insuficient. Reîncărcați produsul și verificați cantitatea.",
    STOCK_LIMIT_EXCEEDED: "Stocul depășește limita permisă.",
    STOCK_PRODUCT_ARCHIVED:
      "Produsul este arhivat. Reactivați-l înainte de modificarea stocului.",
    STOCK_ALREADY_REVERSED: "Această mișcare a fost deja stornată.",
    STOCK_INVALID_REVERSAL: "Mișcarea selectată nu poate fi stornată.",
    STOCK_REASON_REQUIRED: "Motivul este obligatoriu.",
    STOCK_INVALID_QUANTITY: "Cantitatea nu este validă.",
    STOCK_PRODUCT_MISSING: "Produsul nu mai este disponibil.",
    STOCK_ADMIN_REQUIRED: "Doar administratorii aprobați pot modifica stocul.",
  };
  return (
    Object.entries(messages).find(([code]) => message.includes(code))?.[1] ??
    (error instanceof Error
      ? error.message
      : "Operațiunea nu a fost confirmată. Reîncărcați istoricul înainte de a încerca din nou.")
  );
}

// Explicit metadata allowlist: stale product forms must never overwrite stock.
export function productMetadata(product: Record<string, unknown>) {
  return Object.fromEntries(
    [
      "cod_bara",
      "nume_produs",
      "categorie",
      "brand",
      "varsta_recomandata",
      "gen",
      "material",
      "pret_retail",
      "pret_engros",
      "bucati_per_cutie",
      "stoc_critic",
      "imagini",
      "descriere",
    ]
      .filter((key) => key in product)
      .map((key) => [key, product[key]]),
  );
}
