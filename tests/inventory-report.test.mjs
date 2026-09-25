import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { createInventoryReport } from "../lib/inventory-report.ts";

test("inventory export preserves barcode text, prices, and Romanian names", async () => {
  const buffer = await createInventoryReport([{
    id: 1,
    cod_bara: "0012345678901",
    nume_produs: "Jucărie educativă",
    categorie: "Știință",
    brand: "Test",
    pret_retail: 29.99,
    pret_engros: 19.99,
    stoc_actual: 12,
  }]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Inventar");
  assert.equal(sheet.getCell("B2").value, "0012345678901");
  assert.equal(sheet.getCell("C2").value, "Jucărie educativă");
  assert.equal(sheet.getCell("G2").value, 19.99);
  assert.equal(sheet.getCell("H2").value, 12);
});

test("ExcelJS conditional formatting can generate identifiers with the patched uuid", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Stock");
  sheet.addRow([12]);
  sheet.addConditionalFormatting({
    ref: "A1",
    rules: [{ type: "dataBar", cfvo: [{ type: "min" }, { type: "max" }] }],
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(buffer);
  assert.equal(restored.getWorksheet("Stock").getCell("A1").value, 12);
  assert.equal(restored.getWorksheet("Stock").conditionalFormattings[0].rules[0].type, "dataBar");
});
