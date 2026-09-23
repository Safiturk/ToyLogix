import test from "node:test";
import assert from "node:assert/strict";
import {
  movementQuantity,
  movementDateBounds,
  movementQueryOptions,
  productMetadata,
  validateStockBalance,
  stockError,
} from "../lib/stock-rules.ts";

test("movement directions and integer/reason validation", () => {
  for (const type of ["stock_in", "return", "count_adjustment"])
    assert.equal(movementQuantity(type, 3, "Delivery"), 3);
  assert.equal(movementQuantity("stock_out", 3, "Sale"), -3);
  assert.equal(movementQuantity("count_adjustment", -3, "Count"), -3);
  for (const quantity of [0, 0.5, NaN, Infinity, 2147483648])
    assert.throws(() => movementQuantity("stock_in", quantity, "Delivery"));
  for (const type of ["stock_in", "stock_out", "return"])
    assert.throws(() => movementQuantity(type, -1, "Reason"));
  for (const type of ["reversal", "unknown", "toString"])
    assert.throws(() => movementQuantity(type, 1, "Reason"));
  assert.throws(() => movementQuantity("stock_in", 1, " \t "));
});

test("nonnegative balances include zero, reject shortages and overflow", () => {
  assert.doesNotThrow(() => validateStockBalance(3, -3));
  assert.doesNotThrow(() => validateStockBalance(0, 1));
  assert.throws(() => validateStockBalance(2, -3), /negativ/);
  assert.throws(() => validateStockBalance(2147483647, 1));
});

test("date range includes the entire last local calendar day", () => {
  const bounds = movementDateBounds("2026-09-01", "2026-09-23");
  assert.equal(bounds.start, new Date(2026, 8, 1).toISOString());
  assert.equal(bounds.end, new Date(2026, 8, 24).toISOString());
  assert.deepEqual(movementDateBounds(), { start: undefined, end: undefined });
  for (const [from, to] of [
    ["2026-02-30", ""],
    ["bad", ""],
    ["2026-09-24", "2026-09-23"],
  ])
    assert.throws(() => movementDateBounds(from, to));
});

test("metadata saves cannot replay a stale stock, baseline, archive state or identity", () => {
  assert.deepEqual(
    productMetadata({
      id: 7,
      stoc_actual: 50,
      opening_stock: 5,
      is_archived: true,
      archived_at: "now",
      critical_stock_level: 5,
      nume_produs: "Toy",
      stoc_critic: 8,
    }),
    { nume_produs: "Toy", stoc_critic: 8 },
  );
});

test("database errors explain shortages and duplicate reversals", () => {
  assert.match(
    stockError({ message: "STOCK_INSUFFICIENT" }),
    /Stoc insuficient/,
  );
  assert.match(
    stockError({ message: "STOCK_ALREADY_REVERSED" }),
    /deja stornată/,
  );
  assert.match(stockError({ message: "network failed" }), /istoricul/);
});

test("API query combines product, user, type, date and stable pagination", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const query = movementQueryOptions({
    productId: 5,
    userId,
    type: "return",
    from: "2026-09-23",
    to: "2026-09-23",
    page: 2,
  });
  assert.deepEqual(query.equals, [
    ["product_id", 5],
    ["created_by", userId],
    ["movement_type", "return"],
  ]);
  assert.equal(query.first, 100);
  assert.equal(query.last, 149);
  assert.equal(query.start, new Date(2026, 8, 23).toISOString());
  assert.equal(query.end, new Date(2026, 8, 24).toISOString());
  assert.deepEqual(movementQueryOptions({}).equals, []);
  for (const filters of [
    { page: -1 },
    { page: 0.5 },
    { productId: 0 },
    { userId: "partial" },
    { type: "invalid" },
  ])
    assert.throws(() => movementQueryOptions(filters));
});
