import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCatalogText,
  catalogOptions,
  matchesCatalogFilters,
  compareProducts,
  productImages,
  formatPrice,
} from "../lib/catalog.ts";
import { parseFavoriteIds } from "../lib/favorites.ts";
import { createProductDraft } from "../app/admin/models.ts";

const product = {
  ...createProductDraft(),
  id: 1,
  nume_produs: "Mașină de curse",
  brand: " Șotron ",
  material: "Lemn",
  varsta_recomandata: "3-6 ani",
  pret_engros: 25,
  stoc_actual: 2,
  cod_bara: "00594123",
};
const filters = {
  query: "",
  brands: [],
  materials: [],
  age: "",
  stockOnly: false,
  minPrice: "",
  maxPrice: "",
};

test("Romanian search ignores case, accents and surrounding spaces", () => {
  assert.equal(normalizeCatalogText(" ȘȚÂÎĂ "), "staia");
  assert.equal(normalizeCatalogText(null), "");
  for (const query of ["masina", "SOTRON", "00594"])
    assert.equal(matchesCatalogFilters(product, { ...filters, query }), true);
  assert.equal(
    matchesCatalogFilters(product, { ...filters, query: "missing" }),
    false,
  );
});

test("facets deduplicate normalized values and retain the last display spelling", () => {
  assert.deepEqual(
    catalogOptions(
      [
        product,
        { ...product, brand: "sotron" },
        { ...product, brand: " " },
        { ...product, brand: "Arca" },
      ],
      "brand",
    ),
    ["Arca", "sotron"],
  );
});

test("filters combine with inclusive price bounds and independent stock selection", () => {
  assert.equal(
    matchesCatalogFilters(product, {
      ...filters,
      brands: ["șotron"],
      materials: ["lemn"],
      age: "3-6 ani",
      minPrice: "25",
      maxPrice: "25",
      stockOnly: true,
    }),
    true,
  );
  for (const changed of [
    { brands: ["other"] },
    { materials: ["metal"] },
    { age: "12+" },
    { minPrice: "26" },
    { maxPrice: "24" },
    { minPrice: "30", maxPrice: "20" },
  ])
    assert.equal(
      matchesCatalogFilters(product, { ...filters, ...changed }),
      false,
    );
  assert.equal(
    matchesCatalogFilters({ ...product, stoc_actual: 0 }, filters),
    true,
  );
  assert.equal(
    matchesCatalogFilters(
      { ...product, stoc_actual: 0 },
      { ...filters, stockOnly: true },
    ),
    false,
  );
});

test("invalid numbers retain the original exclusion behavior", () => {
  assert.equal(
    matchesCatalogFilters({ ...product, pret_engros: NaN }, filters),
    true,
  );
  assert.equal(
    matchesCatalogFilters(
      { ...product, pret_engros: NaN },
      { ...filters, minPrice: "0" },
    ),
    false,
  );
  assert.equal(
    matchesCatalogFilters(product, { ...filters, maxPrice: "invalid" }),
    false,
  );
  assert.equal(
    matchesCatalogFilters(
      { ...product, stoc_actual: NaN },
      { ...filters, stockOnly: true },
    ),
    false,
  );
});

test("sorting returns a new collection without changing inventory order", () => {
  const products = [
    { ...product, id: 1, pret_engros: 40, nume_produs: "Z" },
    { ...product, id: 2, pret_engros: 20, nume_produs: "A" },
  ];
  for (const sort of ["price-up", "name", "new", "unknown"])
    assert.deepEqual(
      [...products]
        .sort((a, b) => compareProducts(a, b, sort))
        .map((p) => p.id),
      [2, 1],
    );
  assert.deepEqual(
    [...products]
      .sort((a, b) => compareProducts(a, b, "price-down"))
      .map((p) => p.id),
    [1, 2],
  );
  assert.deepEqual(
    products.map((p) => p.id),
    [1, 2],
  );
});

test("images, currency and default drafts retain their existing fallbacks", () => {
  assert.deepEqual(
    productImages({ ...product, imagini: ["", "/one.svg", "/two.svg"] }),
    ["/one.svg", "/two.svg"],
  );
  assert.deepEqual(productImages(product), []);
  assert.equal(
    formatPrice(NaN),
    new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: "RON",
    }).format(0),
  );
  const draft = createProductDraft();
  draft.imagini.push("one");
  assert.deepEqual(createProductDraft().imagini, []);
  assert.equal(draft.categorie, "Masini");
  assert.equal(draft.bucati_per_cutie, 1);
  assert.equal(draft.stoc_critic, 10);
});

test("favorites retain numeric IDs and reject malformed JSON on writes", () => {
  assert.deepEqual(parseFavoriteIds('[1,"2",null,3,1]'), [1, 3, 1]);
  assert.deepEqual(parseFavoriteIds(null), []);
  assert.deepEqual(parseFavoriteIds("{}"), []);
  assert.throws(() => parseFavoriteIds("{broken"), SyntaxError);
});
