import test from "node:test";
import assert from "node:assert/strict";
import { readPublicEnv, readServerEnv } from "../lib/env-validation.ts";
import { securityHeaders, contentSecurityPolicy } from "../lib/security-headers.ts";
const env = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test" };
test("public config refuses server credentials and unsafe origins", () => {
  assert.throws(() => readPublicEnv({ ...env, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_private" }));
  const jwt = `e30.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.test`;
  assert.throws(() => readPublicEnv({ ...env, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt }));
  assert.throws(() => readPublicEnv({ ...env, NEXT_PUBLIC_SUPABASE_URL: "http://example.com" }));
  assert.throws(() => readServerEnv({ ...env, NEXT_PUBLIC_RESEND_API_KEY: "secret" }));
  assert.throws(() => readServerEnv({ ...env, NEXT_PUBLIC_ACCOUNT_HARDENING_ENABLED: "true" }));
  assert.throws(() => readServerEnv({ ...env, RESEND_API_KEY: "re_test" }));
  assert.equal(readPublicEnv(env).url, env.NEXT_PUBLIC_SUPABASE_URL);
});
test("production headers deny framing and MIME sniffing and use HSTS", () => {
  const headers = Object.fromEntries(securityHeaders(true).map(({ key, value }) => [key, value]));
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.match(headers["Strict-Transport-Security"], /31536000/);
  assert.equal(securityHeaders(false).some(({ key }) => key === "Strict-Transport-Security"), false);
});
test("production CSP requires per-request nonce and permits only the backend for connections", () => {
  const csp = contentSecurityPolicy("random-nonce", env.NEXT_PUBLIC_SUPABASE_URL, true);
  assert.match(csp, /script-src 'self' 'nonce-random-nonce' 'strict-dynamic';/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(csp, /connect-src 'self' https:\/\/example.supabase.co wss:\/\/example.supabase.co;/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
});
