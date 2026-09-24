export interface RegistrationNotification {
  user_id: string;
  email: string;
  name: string | null;
  phone: string | null;
  company: string | null;
}
export interface MailConfig { apiKey: string; from: string; to: string }

export async function sendRegistrationNotification(item: RegistrationNotification, config: MailConfig, request: typeof fetch = fetch) {
  const response = await request("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `registration/${item.user_id}` },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      from: config.from, to: [config.to], subject: "Nou partener ToyLogix B2B",
      text: ["Un partener și-a confirmat adresa de email. Verificați cererea în panoul de administrare.",
        `Nume: ${item.name ?? ""}`, `Email: ${item.email}`, `Telefon: ${item.phone ?? ""}`, `Firmă: ${item.company ?? ""}`].join("\n"),
    }),
  });
  if (!response.ok) throw new Error("Notification provider rejected delivery");
  const result = await response.json();
  if (typeof result.id !== "string" || !result.id) throw new Error("Notification delivery was not acknowledged");
}
