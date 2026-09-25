type Environment = Record<string, string | undefined>;
function required(env: Environment, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
function origin(value: string, name: string) {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`Invalid URL: ${name}`); }
  if (parsed.username || parsed.password || (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))))
    throw new Error(`Unsafe URL: ${name}`);
  return parsed.origin;
}
export function readPublicEnv(env: Environment) {
  const url = origin(required(env, "NEXT_PUBLIC_SUPABASE_URL"), "NEXT_PUBLIC_SUPABASE_URL");
  const key = required(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (key.startsWith("sb_secret_")) throw new Error("A server key must never be public");
  if (key.split(".").length === 3) {
    let role: string;
    try { role = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role; }
    catch { throw new Error("Invalid public Supabase key"); }
    if (role !== "anon") throw new Error("Only an anon/publishable key may be public");
  } else if (!key.startsWith("sb_publishable_")) throw new Error("Invalid public Supabase key");
  const hardening = env.NEXT_PUBLIC_ACCOUNT_HARDENING_ENABLED?.trim() || "false";
  if (!["true", "false"].includes(hardening)) throw new Error("Invalid account hardening flag");
  return { url, key, hardening: hardening === "true" };
}
export function readServerEnv(env: Environment, authRequired = false) {
  const publicConfig = readPublicEnv(env);
  for (const name of Object.keys(env)) {
    if (name.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE_ROLE|RESEND|SENDGRID|SMTP|PRIVATE/i.test(name))
      throw new Error(`Server credentials cannot use a public prefix: ${name}`);
  }
  const auth = authRequired || publicConfig.hardening;
  const secret = auth ? required(env, "SUPABASE_SERVICE_ROLE_KEY") : env.SUPABASE_SERVICE_ROLE_KEY;
  const rateSecret = auth ? required(env, "AUTH_RATE_LIMIT_SECRET") : env.AUTH_RATE_LIMIT_SECRET;
  if (rateSecret && rateSecret.length < 32) throw new Error("AUTH_RATE_LIMIT_SECRET must contain at least 32 characters");
  const siteUrl = env.AUTH_SITE_URL ? origin(env.AUTH_SITE_URL, "AUTH_SITE_URL") : undefined;
  if (auth && !siteUrl) throw new Error("Missing environment variable: AUTH_SITE_URL");
  const mailNames = ["RESEND_API_KEY", "NOTIFICATION_FROM", "NOTIFICATION_TO"] as const;
  const configured = mailNames.some((name) => Boolean(env[name]));
  if (configured) {
    for (const name of mailNames) required(env, name);
    for (const name of ["NOTIFICATION_FROM", "NOTIFICATION_TO"])
      if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env[name]!)) throw new Error(`Invalid email address: ${name}`);
  }
  return { ...publicConfig, secret, rateSecret, siteUrl, mail: configured ? {
    apiKey: env.RESEND_API_KEY!, from: env.NOTIFICATION_FROM!, to: env.NOTIFICATION_TO!,
  } : null };
}
