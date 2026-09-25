import type { Account, Billing } from "./account.ts";
import type { ProductCard } from "./catalog.ts";

export type CartLine = { product: ProductCard; boxes: number };
export const MAX_BOXES = 100000;
export const requestNotice =
  "Acest document reprezintă exclusiv o cerere de comandă, nu o comandă confirmată sau o dovadă de plată. Confirmarea finală, disponibilitatea, prețurile și informațiile de plată vor fi verificate separat de ToyLogix.";
export const paymentNote =
  "Plata confirmată, comanda este pregătită pentru livrare.";
export const specified = (value?: string | null) =>
  value?.trim() || "Nespecificat";
export const money = (cents: number) =>
  new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" }).format(
    cents / 100,
  );
export function validProduct(p: ProductCard) {
  return (
    Number.isSafeInteger(p.id) &&
    p.id > 0 &&
    typeof p.nume_produs === "string" &&
    Number.isSafeInteger(p.bucati_per_cutie) &&
    p.bucati_per_cutie > 0 &&
    Number.isFinite(p.pret_engros) &&
    p.pret_engros >= 0 &&
    p.pret_engros <= 1000000
  );
}
export function parseCart(raw: string | null): CartLine[] {
  try {
    const data: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(data)) return [];
    const seen = new Set<number>();
    return data.filter((line): line is CartLine => {
      if (
        !line?.product ||
        !validProduct(line.product) ||
        !Number.isInteger(line.boxes) ||
        line.boxes < 1 ||
        line.boxes > MAX_BOXES ||
        seen.has(line.product.id)
      )
        return false;
      seen.add(line.product.id);
      return true;
    });
  } catch {
    return [];
  }
}
export function lineTotals(line: CartLine) {
  const quantity = line.boxes * line.product.bucati_per_cutie;
  const unitCents = Math.round(line.product.pret_engros * 100);
  return { quantity, unitCents, cents: quantity * unitCents };
}
export function cartTotals(lines: CartLine[]) {
  return lines.reduce(
    (total, line) => {
      const row = lineTotals(line);
      return {
        boxes: total.boxes + line.boxes,
        quantity: total.quantity + row.quantity,
        cents: total.cents + row.cents,
      };
    },
    { boxes: 0, quantity: 0, cents: 0 },
  );
}
export function companyDetails(account: Account, billing: Billing) {
  const address = [
    billing.address_line1,
    billing.address_line2,
    billing.city,
    billing.region,
    billing.postal_code,
    billing.country,
  ]
    .filter((v) => v?.trim())
    .join(", ");
  return [
    [
      "Denumire companie",
      specified(billing.legal_name?.trim() || account.nume_firma),
    ],
    ["Cod fiscal / CUI", specified(billing.tax_number)],
    ["Registrul Comerțului", specified(billing.trade_register)],
    ["Adresă de facturare", specified(address)],
    // The account form explicitly defines delivery_address as an override when different.
    [
      "Adresă de livrare",
      specified(billing.delivery_address?.trim() || address),
    ],
    ["Telefon", specified(account.telefon)],
    ["E-mail", specified(billing.billing_email?.trim() || account.email)],
    ["Persoană de contact", specified(account.nume_complet)],
  ];
}
export function emailMessage(company: string, lines: CartLine[]) {
  const totals = cartTotals(lines);
  return {
    subject: `Cerere de comandă ToyLogix - ${company}`,
    body: `Bună ziua,\n\nVă transmit cererea de comandă pentru ${company}.\n\n${lines.map((l) => `${l.product.nume_produs}: ${l.boxes} cutii × ${l.product.bucati_per_cutie} buc. = ${lineTotals(l).quantity} buc.; ${money(lineTotals(l).cents)}`).join("\n")}\n\nTotal cutii: ${totals.boxes}\nTotal bucăți: ${totals.quantity}\nTotal general estimativ: ${money(totals.cents)}\n\nVoi atașa PDF-ul cererii la acest e-mail.\n${requestNotice}\n\nVă rog să confirmați cererea și detaliile de plată.\nVă mulțumesc!`,
  };
}
export function mailtoLink(
  recipient: string,
  message: ReturnType<typeof emailMessage>,
) {
  return `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
}
