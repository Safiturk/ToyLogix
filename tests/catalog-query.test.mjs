import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  CARD_COLUMNS,
  productPageQuery,
  loadFacet,
  loadFavoriteProducts,
  hasArchiveColumn,
} from "../lib/catalog-query.ts";

function fixture(respond = () => ({ data: [], total: 0 })) {
  const requests = [];
  const client = createClient("https://catalog.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const request = {
          url: new URL(url),
          headers: new Headers(init.headers),
        };
        requests.push(request);
        const { data, total = 0, status = 200 } = respond(request);
        return new Response(JSON.stringify(data), {
          status,
          headers: {
            "Content-Type": "application/json",
            "Content-Range": `0-0/${total}`,
          },
        });
      },
    },
  });
  return { client, requests };
}

test("page query sends filters, exact count and only card fields to PostgREST", async () => {
  const { client, requests } = fixture(() => ({
    data: [{ id: 4 }],
    total: 73,
  }));
  const result = await productPageQuery(client, {
    page: 3,
    pageSize: 12,
    category: "Puzzle",
    brands: ["Lego"],
    materials: ["Lemn", "Plastic"],
    age: "3-6 ani",
    minPrice: "0",
    maxPrice: "125.50",
    stockOnly: true,
    sort: "price-up",
    query: "tren",
  });
  const params = requests[0].url.searchParams;
  assert.equal(params.get("select"), CARD_COLUMNS);
  assert.equal(params.get("offset"), "24");
  assert.equal(params.get("limit"), "12");
  assert.equal(params.get("categorie"), "eq.Puzzle");
  assert.equal(params.get("brand"), "eq.Lego");
  assert.equal(params.get("material"), "in.(Lemn,Plastic)");
  assert.deepEqual(params.getAll("pret_engros"), ["gte.0", "lte.125.5"]);
  assert.equal(params.get("stoc_actual"), "gt.0");
  assert.equal(params.get("varsta_recomandata"), "eq.3-6 ani");
  assert.equal(params.get("is_archived"), "eq.false");
  assert.equal(params.get("order"), "pret_engros.asc.nullslast,id.desc");
  assert.equal(
    params.get("or"),
    '(nume_produs.ilike."%tren%",brand.ilike."%tren%",cod_bara.ilike."%tren%")',
  );
  assert.match(requests[0].headers.get("Prefer"), /count=exact/);
  assert.equal(result.count, 73);
  assert.deepEqual(result.data, [{ id: 4 }]);
});

test("equal-price and name sorting always has a unique tie-breaker; ranges do not overlap", async () => {
  const { client, requests } = fixture();
  for (const sort of ["price-down", "name", "new"]) {
    await productPageQuery(client, { page: 1, pageSize: 24, sort });
    await productPageQuery(client, { page: 2, pageSize: 24, sort });
  }
  assert.deepEqual(
    requests.map(({ url }) => url.searchParams.get("offset")),
    ["0", "24", "0", "24", "0", "24"],
  );
  assert.deepEqual(
    requests.map(({ url }) => url.searchParams.get("order")),
    [
      "pret_engros.desc.nullslast,id.desc",
      "pret_engros.desc.nullslast,id.desc",
      "nume_produs.asc.nullslast,id.desc",
      "nume_produs.asc.nullslast,id.desc",
      "id.desc",
      "id.desc",
    ],
  );
});

test("search quotes punctuation and escapes LIKE metacharacters without adding filter clauses", async () => {
  const { client, requests } = fixture();
  await productPageQuery(client, {
    page: 1,
    pageSize: 12,
    query: 'a,b).id.eq.1"_%\\',
  });
  const expression = requests[0].url.searchParams.get("or");
  assert.match(expression, /\\"/);
  assert.match(expression, /\\\\_/);
  assert.match(expression, /\\\\%/);
  assert.equal(requests[0].url.searchParams.get("id"), null);
});

test("legacy archive fallback is restricted to the missing column error and cached", async () => {
  const { client, requests } = fixture(() => ({
    status: 400,
    data: {
      code: "42703",
      message: "column produse.is_archived does not exist",
    },
  }));
  assert.equal(await hasArchiveColumn(client), false);
  assert.equal(await hasArchiveColumn(client), false);
  assert.equal(requests.length, 1);
  const denied = fixture(() => ({
    status: 403,
    data: { code: "42501", message: "permission denied" },
  }));
  await assert.rejects(hasArchiveColumn(denied.client), { code: "42501" });
});

test("admin archive filters and legacy schema keep pagination on the server", async () => {
  const { client, requests } = fixture();
  await productPageQuery(
    client,
    { page: 2, pageSize: 24, archive: "archived" },
    true,
  );
  await productPageQuery(
    client,
    { page: 1, pageSize: 24, archive: "all" },
    true,
  );
  await productPageQuery(
    client,
    { page: 1, pageSize: 24, archive: "archived" },
    true,
    false,
  );
  assert.equal(requests[0].url.searchParams.get("is_archived"), "eq.true");
  assert.equal(requests[1].url.searchParams.get("is_archived"), null);
  assert.equal(requests[2].url.searchParams.get("id"), "eq.-1");
  assert.ok(
    !requests[2].url.searchParams.get("select").includes("is_archived"),
  );
});

test("facet options use server grouping and page beyond response caps", async () => {
  const { client, requests } = fixture(({ url }) => {
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return { data: offset === 0 ? [{ value: "A" }] : offset === 1 ? [{ value: "B" }] : [] };
  });
  assert.deepEqual(await loadFacet(client, "brand", new AbortController().signal, "Puzzle"), ["A", "B"]);
  assert.equal(requests.length,3);
  for (const request of requests) {
    assert.equal(request.url.pathname,"/rest/v1/rpc/catalog_facets");
    assert.equal(request.url.searchParams.get("field"),"eq.brand");
    assert.equal(request.url.searchParams.get("limit"),"500");
  }
});

test("favorites query all saved IDs in bounded batches independently of catalog page", async () => {
  const { client, requests } = fixture(({ url }) => ({
    data: url.searchParams.has("id") ? [{ id: requests.length }] : [],
  }));
  const ids = Array.from({ length: 105 }, (_, index) => index + 1);
  assert.equal(
    (await loadFavoriteProducts(client, ids, new AbortController().signal))
      .length,
    3,
  );
  assert.equal(requests.length, 4);
  assert.match(
    requests.at(-1).url.searchParams.get("id"),
    /101,102,103,104,105/,
  );
  assert.equal(requests.at(-1).url.searchParams.get("limit"), "50");
});

test("missing facet RPC falls back to paged metadata on legacy schemas", async () => {
  const { client, requests } = fixture(({ url }) => {
    if (url.pathname.endsWith("/rpc/catalog_facets"))
      return { status: 404, data: { code: "PGRST202", message: "Could not find public.catalog_facets(p_category)" } };
    if (url.searchParams.get("select") === "is_archived")
      return { status: 400, data: { code: "42703", message: "column produse.is_archived does not exist" } };
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return { data: offset === 0 ? [{ id: 1, brand: "Z" }, { id: 2, brand: "A" }] : offset === 2 ? [{ id: 3, brand: "A" }, { id: 4, brand: " " }] : [] };
  });
  assert.deepEqual(await loadFacet(client, "brand", new AbortController().signal, "Puzzle"), ["A", "Z"]);
  for (const { url } of requests.slice(2)) {
    assert.equal(url.searchParams.get("select"), "id,brand");
    assert.equal(url.searchParams.get("categorie"), "eq.Puzzle");
    assert.equal(url.searchParams.get("is_archived"), null);
    assert.equal(url.searchParams.get("order"), "id.asc");
  }
});

test("legacy facet fallback excludes archived products when supported", async () => {
  const { client, requests } = fixture(({ url }) => url.pathname.endsWith("/rpc/catalog_facets")
    ? { status: 404, data: { code: "PGRST202", message: "Missing catalog_facets" } }
    : { data: [] });
  await loadFacet(client, "categorie", new AbortController().signal);
  assert.equal(requests.at(-1).url.searchParams.get("is_archived"), "eq.false");
});

test("facet permission and network errors never trigger a legacy fallback", async () => {
  for (const code of ["42501", "PGRST301", "57014"]) {
    const { client, requests } = fixture(() => ({ status: 403, data: { code, message: "catalog_facets failed" } }));
    await assert.rejects(loadFacet(client, "brand", new AbortController().signal), { code });
    assert.equal(requests.length, 1);
  }
});
