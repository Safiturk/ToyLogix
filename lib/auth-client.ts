import { supabase } from "./supabase";
import { accountHardeningEnabled } from "./auth-rollout";

export async function authPost(
  path: string,
  body: Record<string, unknown>,
  authenticated = false,
) {
  if (!accountHardeningEnabled && !authenticated) {
    const email = String(body.email ?? "");
    if (path === "/api/auth/reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      return { ok: true };
    }
    if (path === "/api/auth/signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: String(body.password ?? ""),
        options: {
          emailRedirectTo: `${window.location.origin}/email-confirmed`,
          data: {
            nume_complet: body.name,
            telefon: body.phone,
            nume_firma: body.company,
          },
        },
      });
      if (error) throw error;
      if (data.session) await supabase.auth.signOut({ scope: "local" });
      return { ok: true, needsEmailConfirmation: true };
    }
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authenticated) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Autentificarea este necesară.");
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  // The pre-hardening deployment has no Next server secrets. Perform full
  // account deletion in Supabase's authenticated server environment instead.
  let endpoint = path;
  if (!accountHardeningEnabled && authenticated && path === "/api/admin/accounts/delete") {
    endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`;
    headers.apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Operațiunea nu a fost confirmată.");
  return data;
}

export async function passwordLogin(email: string, password: string) {
  if (!accountHardeningEnabled)
    return supabase.auth.signInWithPassword({ email, password });
  const data = await authPost("/api/auth/login", { email, password });
  return supabase.auth.setSession(data.session);
}
