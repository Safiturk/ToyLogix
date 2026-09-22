import { supabase } from "./supabase";
export type Account = {
  id: number;
  auth_user_id: string;
  nume_complet: string;
  email: string;
  telefon: string;
  nume_firma: string | null;
  rol: "admin" | "user";
  status: "pending" | "approved" | "rejected";
};
export const accountColumns =
  "id,auth_user_id,nume_complet,email,telefon,nume_firma,rol,status";
export async function currentAccount(): Promise<Account | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email_confirmed_at) return null;
  const { data, error: failure } = await supabase
    .from("utilizatori")
    .select(accountColumns)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (failure) throw failure;
  return data as Account | null;
}
export async function signOutAccount() {
  await supabase.auth.signOut({ scope: "local" });
  localStorage.removeItem("user_session");
  localStorage.removeItem("admin_authenticated");
  window.dispatchEvent(new Event("toylogix-session"));
}
export const billingFields = [
  ["legal_name", "Denumire legală / Nume pentru factură"],
  ["tax_number", "Cod fiscal / CUI / CIF"],
  ["trade_register", "Nr. Registrul Comerțului"],
  ["billing_email", "Email pentru facturi"],
  ["country", "Țară"],
  ["region", "Județ / Regiune"],
  ["city", "Localitate"],
  ["postal_code", "Cod poștal"],
  ["address_line1", "Stradă, număr"],
  ["address_line2", "Clădire, etaj, apartament (opțional)"],
  ["delivery_address", "Adresă de livrare (dacă diferă)"],
] as const;
export type Billing = Partial<
  Record<(typeof billingFields)[number][0], string>
> & { vat_registered?: boolean };
