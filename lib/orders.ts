export const orderStatuses = {
 pending_review: 'Cerere in curs de verificare', awaiting_payment: 'In asteptarea platii',
 payment_under_review: 'Plata in curs de verificare', payment_confirmed: 'Plata confirmata', cancelled: 'Anulata', rejected: 'Respinsa',
} as const;
export type OrderStatus = keyof typeof orderStatuses;
export type Order = { id: string; code: string; user_id: string; status: OrderStatus; total_cents: number; bank_iban: string; bank_beneficiary: string; bank_name: string; receipt_url: string | null; created_at: string; customer_email: string; company: { account: import('./account').Account; billing: import('./account').Billing } };
export function receiptType(bytes: Uint8Array) {
 if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0,5)) === '%PDF-') return 'application/pdf';
 if ([137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return 'image/png';
 if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
 return null;
}
