import { createClient } from "@supabase/supabase-js";
import { parseAuthLink } from "./security-rules";
import { readPublicEnv } from "./env-validation";

const { url: supabaseUrl, key: supabaseAnonKey } = readPublicEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_ACCOUNT_HARDENING_ENABLED: process.env.NEXT_PUBLIC_ACCOUNT_HARDENING_ENABLED,
});

// Capture only link metadata before Auth removes the tokens from the URL.
export const initialAuthLink = parseAuthLink(
  typeof window === "undefined" ? "http://localhost" : window.location.href,
);
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
