export interface InventoryRow {
  id?: number;
  cod_bara: string;
  nume_produs: string;
  categorie: string;
  brand: string;
  pret_retail: number;
  pret_engros: number;
  stoc_actual: number;
}

export async function createInventoryReport(products: InventoryRow[]) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ToyLogix";
  const sheet = workbook.addWorksheet("Inventar", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "Cod Bare", key: "cod_bara", width: 22 },
    { header: "Nume Produs", key: "nume_produs", width: 44 },
    { header: "Categorie", key: "categorie", width: 25 },
    { header: "Brand", key: "brand", width: 24 },
    { header: "Preț Recomandat (RON)", key: "pret_retail", width: 27 },
    { header: "Preț En-gros B2B (RON)", key: "pret_engros", width: 27 },
    { header: "Stoc Actual", key: "stoc_actual", width: 16 },
  ];
  products.forEach((product) =>
    sheet.addRow({
      id: product.id ?? null,
      cod_bara: String(product.cod_bara ?? ""),
      nume_produs: String(product.nume_produs ?? ""),
      categorie: String(product.categorie ?? ""),
      brand: String(product.brand ?? ""),
      pret_retail: Number(product.pret_retail) || 0,
      pret_engros: Number(product.pret_engros) || 0,
      stoc_actual: Number(product.stoc_actual) || 0,
    }),
  );
  sheet.getColumn("cod_bara").numFmt = "@";
  sheet.getColumn("pret_retail").numFmt = "#,##0.00";
  sheet.getColumn("pret_engros").numFmt = "#,##0.00";
  sheet.getRow(1).height = 32;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF6546C8" },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  sheet.autoFilter = { from: "A1", to: `H${sheet.rowCount}` };
  return workbook.xlsx.writeBuffer();
}
