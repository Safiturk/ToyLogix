import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
  cartTotals,
  lineTotals,
  money,
  paymentNote,
  requestNotice,
  specified,
  type CartLine,
} from "./order-request.ts";

export type OrderPdfData = {
  company: string[][];
  lines: CartLine[];
  barcodes: Record<number, string>;
  date: Date;
};
export type PdfAssets = { font: string; logo: string };
let assetsPromise: Promise<PdfAssets> | undefined;
export function loadPdfAssets(): Promise<PdfAssets> {
  return (assetsPromise ??= (async () => {
    const response = await fetch("/fonts/NotoSans.ttf");
    if (!response.ok)
      throw new Error("Fontul PDF nu poate fi încărcat. Încearcă din nou.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const logo = await new Promise<string>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 780;
        canvas.height = 190;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(
            new Error("Sigla PDF nu poate fi pregătită în acest browser."),
          );
          return;
        }
        context.drawImage(image, 0, 0, 780, 190);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () =>
        reject(
          new Error("Sigla ToyLogix nu poate fi încărcată. Încearcă din nou."),
        );
      image.src = "/toylogix-logo.svg";
    });
    return { font: btoa(binary), logo };
  })().catch((error) => {
    assetsPromise = undefined;
    throw error;
  }));
}
export function createOrderPdf(data: OrderPdfData, assets: PdfAssets) {
  const doc = new jsPDF();
  doc.addFileToVFS("NotoSans.ttf", assets.font);
  doc.addFont("NotoSans.ttf", "NotoSans", "normal");
  doc.setFont("NotoSans", "normal");
  doc.setProperties({
    title: "Cerere de comandă ToyLogix",
    author: "ToyLogix",
  });
  doc.addImage(assets.logo, "PNG", 14, 12, 58, 14.13);
  doc.setFontSize(18);
  doc.setTextColor(83, 48, 153);
  doc.text("Cerere de comandă B2B", 14, 38);
  doc.setFontSize(9);
  doc.setTextColor(70);
  doc.text(
    `Data documentului: ${data.date.toLocaleDateString("ro-RO")}`,
    14,
    45,
  );
  const styles = {
    font: "NotoSans",
    fontStyle: "normal" as const,
    fontSize: 9,
    cellPadding: 2,
    overflow: "linebreak" as const,
  };
  let endY = 50;
  autoTable(doc, {
    startY: endY,
    body: data.company,
    theme: "plain",
    styles,
    margin: { top: 15, bottom: 18 },
    columnStyles: { 0: { cellWidth: 43, textColor: [100, 76, 132] } },
    didDrawPage: (info) => {
      endY = info.cursor?.y ?? endY;
    },
  });
  autoTable(doc, {
    startY: endY + 7,
    margin: { top: 15, bottom: 18 },
    styles: { ...styles, fontSize: 8 },
    headStyles: { fillColor: [101, 70, 200], fontStyle: "normal" },
    alternateRowStyles: { fillColor: [248, 245, 255] },
    head: [
      [
        "Produs",
        "Cod / cod de bare",
        "Cantitate",
        "Ambalare",
        "Preț unitar",
        "Subtotal",
      ],
    ],
    body: data.lines.map((line) => {
      const total = lineTotals(line);
      return [
        line.product.nume_produs,
        specified(data.barcodes[line.product.id]),
        `${total.quantity} buc.`,
        `${line.boxes} cutii\n${line.product.bucati_per_cutie} buc./cutie`,
        money(total.unitCents),
        money(total.cents),
      ];
    }),
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 30 },
      2: { cellWidth: 22 },
      3: { cellWidth: 29 },
      4: { cellWidth: 25 },
      5: { cellWidth: 30 },
    },
    didDrawPage: (info) => {
      endY = info.cursor?.y ?? endY;
    },
  });
  const total = cartTotals(data.lines);
  autoTable(doc, {
    startY: endY + 6,
    theme: "plain",
    margin: { top: 15, bottom: 18 },
    styles,
    body: [
      [
        `Total cutii: ${total.boxes} | Total bucăți: ${total.quantity}\nTotal general estimativ: ${money(total.cents)}`,
      ],
      [requestNotice],
      [
        `Notă privind etapa ulterioară confirmării plății:\n${paymentNote}\nPlata nu este confirmată prin acest document.`,
      ],
    ],
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(
      `ToyLogix · Cerere de comandă · Pagina ${page} / ${pages}`,
      14,
      288,
    );
  }
  return new File(
    [doc.output("arraybuffer")],
    `ToyLogix-cerere-${data.date.toISOString().slice(0, 10)}.pdf`,
    { type: "application/pdf" },
  );
}
export function downloadPdf(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
