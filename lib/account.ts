import { supabase } from "./supabase";
import { accountHardeningEnabled } from "./auth-rollout";
export type Account = {
  id: number;
  auth_user_id: string;
  nume_complet: string;
  email: string;
  telefon: string;
  nume_firma: string | null;
  rol: "admin" | "user";
  status: "pending" | "approved" | "rejected";
  is_active?: boolean;
};
export const accountColumns: string = accountHardeningEnabled
  ? "id,auth_user_id,nume_complet,email,telefon,nume_firma,rol,status,is_active"
  : "id,auth_user_id,nume_complet,email,telefon,nume_firma,rol,status";
export async function currentAccount(signal?: AbortSignal): Promise<Account | null> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) return null;
  // The stored user ID is only a query hint. Validate it against Auth before
  // returning the live, RLS-protected profile; never authorize from storage.
  let profileQuery = supabase
    .from("utilizatori")
    .select(accountColumns)
    .eq("auth_user_id", session.user.id);
  if (signal) profileQuery = profileQuery.abortSignal(signal);
  const [auth, profile] = await Promise.all([
    // Passing the token avoids holding the session lock during the HTTP call.
    supabase.auth.getUser(session.access_token),
    profileQuery.maybeSingle().overrideTypes<Account | null, { merge: false }>(),
  ]);
  const { user } = auth.data;
  if (auth.error || !user?.email_confirmed_at || user.id !== session.user.id) return null;
  const { data, error: failure } = profile;
  if (failure) throw failure;
  if (data && data.auth_user_id !== user.id) return null;
  return data as Account | null;
}
export async function signOutAccount(scope: "local" | "global" = "local") {
  const { error } = await supabase.auth.signOut({ scope });
  if (error) throw error;
  localStorage.removeItem("user_session");
  localStorage.removeItem("admin_authenticated");
  window.dispatchEvent(new Event("toylogix-session"));
}
export const billingFields = [
  ["legal_name", "Denumire legala / Nume pentru factura"],
  ["tax_number", "Cod fiscal / CUI / CIF"],
  ["trade_register", "Nr. Registrul Comertului"],
  ["billing_email", "Email pentru facturi"],
  ["country", "Tara"],
  ["region", "Judet / Regiune"],
  ["city", "Localitate"],
  ["postal_code", "Cod postal"],
  ["address_line1", "Strada, numar"],
  ["address_line2", "Cladire, etaj, apartament (optional)"],
  ["delivery_address", "Adresa de livrare (daca difera)"],
] as const;
export type Billing = Partial<
  Record<(typeof billingFields)[number][0], string>
> & { vat_registered?: boolean };
