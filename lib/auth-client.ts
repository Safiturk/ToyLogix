import { supabase } from "./supabase";

export async function authPost(
  path: string,
  body: Record<string, unknown>,
  authenticated = false,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authenticated) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Autentificarea este necesară.");
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await fetch(path, {
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
  const data = await authPost("/api/auth/login", { email, password });
  return supabase.auth.setSession(data.session);
}
