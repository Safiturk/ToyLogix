import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadInventoryDashboard } from "../lib/inventory-query.ts";

function fixture(respond) {
  const requests = [];
  const client = createClient("https://inventory.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url) => {
      const request = new URL(url);
      requests.push(request);
      const { data, status = 200, count = 0 } = respond(request);
      return new Response(JSON.stringify(data), { status, headers: {
        "Content-Type": "application/json", "Content-Range": `0-0/${count}`,
      } });
    } },
  });
  return { client, requests };
}

const signal = () => AbortSignal.timeout(5000);
const missing = (url) => url.pathname.includes("/rpc/")
  ? { status: 404, data: { code: "PGRST202", message: "Missing admin_inventory_stats" } }
  : { status: 404, data: { code: "PGRST205", message: "Missing inventory_products" } };

test("dashboard uses paginated server totals when available", async () => {
  const stats = { products: 40, stock: 100, retail: 300, wholesale: 200, critical: 14 };
  const { client, requests } = fixture((url) => url.pathname.includes("/rpc/")
    ? { data: stats } : { data: [{ id: 2 }, { id: 1 }], count: 14 });
  const result = await loadInventoryDashboard(client, signal(), 2);
  assert.deepEqual(result, { stats, critical: [{ id: 2 }, { id: 1 }], criticalCount: 14 });
  const params = requests[1].searchParams;
  assert.equal(params.get("offset"), "12");
  assert.equal(params.get("limit"), "12");
  assert.equal(params.get("is_archived"), "eq.false");
});

test("missing dashboard migration falls back to all active products beyond API caps", async () => {
  const products = Array.from({ length: 17 }, (_, i) => ({
    id: i + 1, stoc_actual: 2, stoc_critic: 2, pret_retail: 5.5, pret_engros: 3.25,
  }));
  const { client, requests } = fixture((url) => {
    if (!url.pathname.endsWith("/produse")) return missing(url);
    if (url.searchParams.get("select") === "is_archived") return { data: [] };
    assert.equal(url.searchParams.get("is_archived"), "eq.false");
    const after = Number(url.searchParams.get("id").slice(3));
    return { data: products.filter((row) => row.id > after).slice(0, 7) };
  });
  const result = await loadInventoryDashboard(client, signal(), 2);
  assert.deepEqual(result.stats, { products: 17, stock: 34, retail: 187, wholesale: 110.5, critical: 17 });
  assert.deepEqual(result.critical.map((row) => row.id), [5, 4, 3, 2, 1]);
  assert.equal(result.criticalCount, 17);
  assert.equal(requests.filter((url) => url.searchParams.has("id")).length, 4);
});

test("legacy products without archive columns still load; real empty inventory returns zero", async () => {
  const { client } = fixture((url) => {
    if (!url.pathname.endsWith("/produse")) return missing(url);
    if (url.searchParams.get("select") === "is_archived")
      return { status: 400, data: { code: "42703", message: "Missing is_archived" } };
    assert.equal(url.searchParams.get("is_archived"), null);
    assert.ok(!url.searchParams.get("select").includes("opening_stock"));
    return { data: [] };
  });
  assert.deepEqual((await loadInventoryDashboard(client, signal(), 1)).stats,
    { products: 0, stock: 0, retail: 0, wholesale: 0, critical: 0 });
});

test("permission and server errors are surfaced, never hidden by fallback", async () => {
  for (const code of ["42501", "57014", "PGRST301"]) {
    const { client, requests } = fixture((url) => url.pathname.includes("/rpc/")
      ? { status: 403, data: { code, message: "admin_inventory_stats failed" } }
      : missing(url));
    await assert.rejects(loadInventoryDashboard(client, signal(), 1), { code });
    assert.equal(requests.length, 2);
  }
});

test("failed fallback query does not fabricate zero totals", async () => {
  const { client } = fixture((url) => {
    if (!url.pathname.endsWith("/produse")) return missing(url);
    if (url.searchParams.get("select") === "is_archived") return { data: [] };
    return { status: 403, data: { code: "42501", message: "Permission denied" } };
  });
  await assert.rejects(loadInventoryDashboard(client, signal(), 1), { code: "42501" });
});
