// Server-only notification delivery. Do not import this module from a Client Component.
type Registration = {
  email: string;
  name: string;
  phone: string;
  company: string;
};

export async function notifyRegistration(registration: Registration) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.REGISTRATION_NOTIFICATION_TO;
  const sender = process.env.REGISTRATION_NOTIFICATION_FROM;
  if (!apiKey || !recipient || !sender) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: sender,
      to: [recipient],
      subject: "Nouă înregistrare partener ToyLogix",
      text: [
        "A fost înregistrată o nouă solicitare de partener.",
        `Nume: ${registration.name}`,
        `Email: ${registration.email}`,
        `Telefon: ${registration.phone}`,
        `Firmă: ${registration.company || "Client direct"}`,
      ].join("\n"),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`Registration notification failed (${response.status}).`);
  }
}
