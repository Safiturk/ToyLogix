// Disposable localhost-only download harness with synthetic inventory, no auth/data access.
// Run: node --experimental-strip-types tests/integration/inventory-download-preview.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { createInventoryReport } from "../../lib/inventory-report.ts";
const buffer = await createInventoryReport([{ id: 1, cod_bara: "0012345678901", nume_produs: "Jucarie test", categorie: "Test", brand: "Test", pret_retail: 40, pret_engros: 23, stoc_actual: 20 }]);
const code = ts.transpileModule(await readFile(new URL("../../lib/inventory-download.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const html = `<!doctype html><meta charset="utf-8"><title>Verificare descarcare Excel</title><h1>Verificare descarcare Excel</h1><p>Date fictive: un produs, 20 de cutii.</p><button id="native">Salveaza Excel</button><button id="fallback">Descarca Excel (alternativ)</button><p id="result" role="status"></p><script type="module">${code}
const originalPicker=window.showSaveFilePicker;
for (const mode of ['native','fallback']) document.getElementById(mode).onclick=async()=>{
  window.showSaveFilePicker=mode==='native'?originalPicker:undefined;
  try { await downloadInventoryReport(async()=>Uint8Array.from(atob('${Buffer.from(buffer).toString("base64")}'), c=>c.charCodeAt(0))); document.getElementById('result').textContent='Operatiune incheiata.'; }
  catch(error) { document.getElementById('result').textContent=error.name+': '+error.message; }
};</script>`;
createServer((_req, res) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); }).listen(3456, "127.0.0.1", () => console.log("Download harness: http://127.0.0.1:3456"));
