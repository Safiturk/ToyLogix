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
    return "Emailul de confirmare nu a putut fi trimis. Contactează echipa ToyLogix pentru activarea contului.";
  }
  if (code === "user_already_exists" || code === "email_exists") {
    return "Există deja un cont cu această adresă. Încearcă autentificarea sau recuperarea parolei.";
  }
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    error?.status === 429
  ) {
    return "Prea multe încercări. Așteaptă câteva minute înainte de a încerca din nou.";
  }
  if (code === "weak_password") {
    return "Parola nu îndeplinește cerințele de securitate. Alege o parolă mai lungă și mai puternică.";
  }
  if (code === "signup_disabled" || code === "email_provider_disabled") {
    return "Înregistrarea este momentan dezactivată. Contactează echipa ToyLogix.";
  }
  return `Contul nu a putut fi creat. Contactează echipa ToyLogix. Cod: ${code || "registration_unavailable"}.`;
}
