export const loginMessages = {
  email_not_confirmed: "Va rugam sa va confirmati adresa de email inainte de autentificare.",
  approval_pending: "Emailul a fost confirmat. Contul dvs. este in curs de aprobare de catre companie.",
  invalid_credentials: "Email sau parola incorecta.",
  unavailable: "Serviciul nu este disponibil. Incercati mai tarziu.",
  rate_limited: "Prea multe incercari. Incercati mai tarziu.",
} as const;

export function loginErrorCode(error: { code?: string; message?: string; status?: number }) {
  if (error.code === "email_not_confirmed") return "email_not_confirmed";
  if (error.code === "invalid_credentials") return "invalid_credentials";
  if (error.status === 429) return "rate_limited";
  // Older Auth responses may omit the machine-readable code.
  if (!error.code) {
    if (error.message === "Email not confirmed") return "email_not_confirmed";
    if (error.message === "Invalid login credentials") return "invalid_credentials";
  }
  return "unavailable";
}
