import { createClient } from "@supabase/supabase-js";
import { parseAuthLink } from "./security-rules";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Capture only link metadata before Auth removes the tokens from the URL.
export const initialAuthLink = parseAuthLink(
  typeof window === "undefined" ? "http://localhost" : window.location.href,
);
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
