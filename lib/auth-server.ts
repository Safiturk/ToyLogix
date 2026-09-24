import { serverEnv } from "./env-server";
// Server routes only. Never import this module from a Client Component.
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { authJson, createAuthHandler, type AuthBackend } from "./auth-handler";
import { accountDestination, type AuthAction } from "./security-rules";

function configuration() {
  const env = serverEnv(true);
  return { url: env.url, key: env.key, secret: env.secret!, rateSecret: env.rateSecret!, siteUrl: env.siteUrl! };
}

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

export async function handlePasswordAuth(action: AuthAction, request: Request) {
  try {
    const config = configuration();
    const privileged = createClient(config.url, config.secret, {
      auth: authOptions,
    });
    const client = createClient(config.url, config.key, { auth: authOptions });
    const backend: AuthBackend = {
      async limit(key, limit, seconds) {
        const hash = createHmac("sha256", config.rateSecret)
          .update(key)
          .digest("hex");
        const { data, error } = await privileged.rpc(
          "consume_auth_rate_limit",
          { p_key: hash, p_limit: limit, p_seconds: seconds },
        );
        if (error || !data) throw new Error("Rate limiter unavailable");
        return data;
      },
      async login(email, password) {
        const { data, error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error || !data.session || !data.user?.email_confirmed_at)
          return { error: "invalid_credentials" };
        const { data: profile, error: denied } = await client
          .from("utilizatori")
          .select("rol,status,is_active")
          .eq("auth_user_id", data.user.id)
          .maybeSingle();
        if (denied || accountDestination(profile) === "/login") {
          await client.auth.signOut({ scope: "local" });
          return {
            session: { access_token: "", refresh_token: "" },
            profile: null,
          };
        }
        return {
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          },
          profile,
        };
      },
      async signup(email, password, metadata, redirect) {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { data: metadata, emailRedirectTo: redirect },
        });
        if (error) throw error;
        if (data.session) await client.auth.signOut({ scope: "local" });
      },
      async reset(email, redirect) {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: redirect,
        });
        if (error) throw error;
      },
    };
    return createAuthHandler(action, backend, {
      siteUrl: config.siteUrl,
      netlify: process.env.NETLIFY === "true",
    })(request);
  } catch {
    return authJson(
      {
        error:
          "Serviciul de autentificare nu este configurat sau nu este disponibil.",
      },
      503,
    );
  }
}

export async function protectedContext(request: Request) {
  const config = configuration();
  if (request.headers.get("origin") !== config.siteUrl)
    throw new Error("Origin denied");
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new Error("Authentication required");
  const client = createClient(config.url, config.key, {
    auth: authOptions,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at)
    throw new Error("Authentication required");
  return {
    client,
    user: data.user,
    token,
    privileged: createClient(config.url, config.secret, { auth: authOptions }),
  };
}

export async function protectedBody(request: Request) {
  if (
    !request.headers.get("content-type")?.includes("application/json") ||
    Number(request.headers.get("content-length")) > 2048
  )
    throw new Error("Invalid body");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 2048)
    throw new Error("Invalid body");
  const body = JSON.parse(text) as Record<string, unknown>;
  if (!body || Array.isArray(body) || typeof body !== "object")
    throw new Error("Invalid body");
  return body;
}
