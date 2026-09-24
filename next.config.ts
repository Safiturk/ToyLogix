import type { NextConfig } from "next";

if (process.env.NEXT_PUBLIC_ACCOUNT_HARDENING_ENABLED === "true") {
  const required = ["SUPABASE_SERVICE_ROLE_KEY", "AUTH_SITE_URL", "AUTH_RATE_LIMIT_SECRET"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length || (process.env.AUTH_RATE_LIMIT_SECRET?.length ?? 0) < 32)
    throw new Error("Account hardening requires all server credentials and a rate-limit secret of at least 32 characters before deployment.");
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
