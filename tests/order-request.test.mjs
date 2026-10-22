import test from "node:test";
import assert from "node:assert/strict";
import {
  cartTotals,
  companyDetails,
  emailMessage,
  lineTotals,
  mailtoLink,
  parseCart,
  validProduct,
  maxCartBoxes,
} from "../lib/order-request.ts";

const product = {
  id: 1,
  nume_produs: "Jucarie sina",
  bucati_per_cutie: 12,
  pret_engros: 19.99,
  stoc_actual: 10000,
};
test("cart caps boxes at stock independently of pack size and repairs stored excess", () => {
  const single = { ...product, stoc_actual: 20, bucati_per_cutie: 1 };
  assert.equal(maxCartBoxes(single), 20);
  assert.equal(parseCart(JSON.stringify([{ product: single, boxes: 21 }]))[0].boxes, 20);
  const packed = { ...single, bucati_per_cutie: 6 };
  assert.equal(maxCartBoxes(packed), 20);
  const lines = parseCart(JSON.stringify([{ product: packed, boxes: 21 }]));
  assert.equal(lines[0].boxes, 20);
  assert.equal(lineTotals(lines[0]).quantity, 120);
  assert.equal(maxCartBoxes({ ...packed, stoc_actual: 1 }), 1);
  for (const stock of [0, -1, null, undefined, Infinity, 1.5]) {
    const unavailable = { ...packed, stoc_actual: stock };
    assert.equal(maxCartBoxes(unavailable), 0);
    assert.deepEqual(parseCart(JSON.stringify([{ product: unavailable, boxes: 1 }])), []);
  }
});
test("10 products / 500 boxes, quantities and money in integer bani", () => {
  const lines = Array.from({ length: 10 }, (_, i) => ({
    product: { ...product, id: i + 1 },
    boxes: 50,
  }));
  assert.deepEqual(cartTotals(lines), {
    boxes: 500,
    quantity: 6000,
    cents: 11994000,
  });
  assert.deepEqual(lineTotals(lines[0]), {
    quantity: 600,
    unitCents: 1999,
    cents: 1199400,
  });
  assert.deepEqual(parseCart(JSON.stringify(lines)), lines);
});
test("stored malformed, duplicate and invalid quantities are rejected", () => {
  assert.deepEqual(parseCart("broken"), []);
  assert.deepEqual(parseCart('{"boxes":5}'), []);
  const line = { product, boxes: 5 };
  assert.deepEqual(
    parseCart(
      JSON.stringify([
        line,
        line,
        { product, boxes: -1 },
        { product, boxes: 1.5 },
      ]),
    ),
    [line],
  );
  assert.equal(validProduct({ ...product, bucati_per_cutie: 0 }), false);
  assert.equal(validProduct({ ...product, pret_engros: null }), false);
  assert.equal(validProduct({ ...product, pret_engros: -1 }), false);
});
test("uses existing account and billing fields including address override", () => {
  const account = {
    nume_firma: "Cont SRL",
    nume_complet: "Stefan Turcanu",
    telefon: "0700123456",
    email: "cont@example.ro",
  };
  const billing = {
    legal_name: "Legal SRL",
    tax_number: "RO12345",
    trade_register: "J40/123/2026",
    billing_email: "facturi@example.ro",
    address_line1: "Str. Florilor 1",
    address_line2: "Etaj 2",
    city: "Iasi",
    region: "Iasi",
    postal_code: "700000",
    country: "Romania",
    delivery_address: "Depozit Brasov",
  };
  const values = companyDetails(account, billing).map(([, value]) => value);
  assert.deepEqual(values, [
    "Legal SRL",
    "RO12345",
    "J40/123/2026",
    "Str. Florilor 1, Etaj 2, Iasi, Iasi, 700000, Romania",
    "Depozit Brasov",
    "0700123456",
    "facturi@example.ro",
    "Stefan Turcanu",
  ]);
  const fallback = companyDetails(account, {
    address_line1: "Adresa contului",
  }).map(([, value]) => value);
  assert.equal(fallback[0], "Cont SRL");
  assert.equal(fallback[4], "Adresa contului");
  assert.equal(fallback[6], account.email);
  assert.ok(
    companyDetails({}, {}).every(([, value]) => value === "Nespecificat"),
  );
});
test("mailto preserves Romanian text and does not inject query parameters", () => {
  const message = emailMessage("Firma & Stefan", [{ product, boxes: 500 }]);
  const link = new URL(mailtoLink("partener+cerere@example.ro", message));
  assert.equal(decodeURIComponent(link.pathname), "partener+cerere@example.ro");
  assert.equal(
    link.searchParams.get("subject"),
    "Cerere de comanda ToyLogix - Firma & Stefan",
  );
  assert.equal(link.searchParams.get("body"), message.body);
  assert.match(message.body, /Total cutii: 500/);
  assert.match(message.body, /Voi atasa PDF-ul/);
  assert.match(message.body, /exclusiv o cerere/);
});
