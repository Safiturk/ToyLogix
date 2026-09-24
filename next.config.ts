import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (isProduction && (!supabaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
  throw new Error(
    "Production builds require NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

if (process.env.NEXT_PUBLIC_ACCOUNT_HARDENING_ENABLED === "true") {
  const required = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "AUTH_SITE_URL",
    "AUTH_RATE_LIMIT_SECRET",
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (
    missing.length ||
    (process.env.AUTH_RATE_LIMIT_SECRET?.length ?? 0) < 32
  ) {
    throw new Error(
      "Account hardening requires all server credentials and a rate-limit secret of at least 32 characters before deployment.",
    );
  }
}

const supabaseOrigin = (() => {
  try {
    return supabaseUrl ? new URL(supabaseUrl).origin : "";
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL.");
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${supabaseOrigin}`,
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "frame-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
