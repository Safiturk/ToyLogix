import type { NextConfig } from "next";
import { readServerEnv } from "./lib/env-validation.ts";
import { securityHeaders } from "./lib/security-headers.ts";

readServerEnv(process.env);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL("/storage/v1/object/public/product-images/**", process.env.NEXT_PUBLIC_SUPABASE_URL!)],
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV === "production") }];
  },
};

export default nextConfig;
