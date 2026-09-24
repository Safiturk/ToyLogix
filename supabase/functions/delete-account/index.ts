import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { deletionHandler } from "./handler.ts";

const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

Deno.serve(deletionHandler((token) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ||
    JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default;
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;
  const client = createClient(url, publicKey, {
    auth, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const privileged = createClient(url, secret, { auth });
  return {
    async user(accessToken) {
      const { data, error } = await client.auth.getUser(accessToken);
      return error || !data.user ? null : { id: data.user.id, confirmed: !!data.user.email_confirmed_at };
    },
    async isAdmin() {
      const { data, error } = await client.rpc("toylogix_is_admin");
      return !error && data === true;
    },
    async target(id) {
      return await client.from("utilizatori").select("auth_user_id").eq("id", id).maybeSingle();
    },
    async prepare(id) {
      return await client.rpc("prepare_account_deletion", { p_target_id: id });
    },
    async legacySchema() {
      const { error } = await client.from("utilizatori").select("is_active").limit(0);
      return error?.code === "42703" && error.message.includes("is_active");
    },
    async deleteUnlinked(id) {
      const { data, error } = await client.from("utilizatori").delete()
        .eq("id", id).is("auth_user_id", null).select("id");
      return !error && data?.length === 1;
    },
    async deleteAuth(id) {
      const { error } = await privileged.auth.admin.deleteUser(id);
      return !error;
    },
  };
}));
