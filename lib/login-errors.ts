export const loginMessages = {
  email_not_confirmed: "Vă rugăm să vă confirmați adresa de email înainte de autentificare.",
  approval_pending: "Emailul a fost confirmat. Contul dvs. este în curs de aprobare de către companie.",
  invalid_credentials: "Email sau parolă incorectă.",
  unavailable: "Serviciul nu este disponibil. Încercați mai târziu.",
  rate_limited: "Prea multe încercări. Încercați mai târziu.",
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
