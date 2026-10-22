export const isRomanianPhone = (value: string) => /^0[0-9]{9}$/.test(value);
export const isEmailAddress = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const hasPasswordComplexity = (value: string) =>
  /\p{Lu}/u.test(value) && /[0-9]/.test(value) && /[\p{P}\p{S}]/u.test(value);

export function registrationErrorMessage(
  error: { code?: string; message: string; status?: number } | null,
) {
  const code = error?.code;
  if (error?.message.toLowerCase().includes("sending confirmation email")) {
    return "Emailul de confirmare nu a putut fi trimis. Contacteaza echipa ToyLogix pentru activarea contului.";
  }
  if (code === "user_already_exists" || code === "email_exists") {
    return "Exista deja un cont cu aceasta adresa. Incearca autentificarea sau recuperarea parolei.";
  }
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    error?.status === 429
  ) {
    return "Prea multe incercari. Asteapta cateva minute inainte de a incerca din nou.";
  }
  if (code === "weak_password") {
    return "Parola nu indeplineste cerintele de securitate. Alege o parola mai lunga si mai puternica.";
  }
  if (code === "signup_disabled" || code === "email_provider_disabled") {
    return "Inregistrarea este momentan dezactivata. Contacteaza echipa ToyLogix.";
  }
  return `Contul nu a putut fi creat. Contacteaza echipa ToyLogix. Cod: ${code || "registration_unavailable"}.`;
}
