import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { loginErrorCode, loginMessages } from "../lib/login-errors.ts";
import { authJson, createAuthHandler } from "../lib/auth-handler.ts";
import { accountDestination } from "../lib/security-rules.ts";

const source = ts.transpileModule(
  readFileSync(new URL("../lib/auth-server.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

async function login({ error = null, confirmed = true, status = "approved", active = true, profileError = null } = {}) {
  const calls = { queries: 0, signouts: 0 };
  const client = {
    rpc: async () => ({ data: { allowed: true, retryAfter: 0 }, error: null }),
    auth: {
      signInWithPassword: async () => ({ error, data: error ? {} : {
        user: { id: "test-user", email_confirmed_at: confirmed ? "2026-09-01" : null },
        session: { access_token: "private-access", refresh_token: "private-refresh" },
      } }),
      signOut: async () => { calls.signouts++; return { error: null }; },
    },
    from(table) {
      calls.queries++;
      assert.equal(table, "utilizatori");
      return {
        select: () => ({ eq: (column, id) => {
          assert.equal(column, "auth_user_id");
          assert.equal(id, "test-user");
          return { maybeSingle: async () => ({
            data: { rol: "user", status, is_active: active }, error: profileError,
          }) };
        } }),
      };
    },
  };
  const exports = {};
  const modules = {
    "./env-server": { serverEnv: () => ({ url: "https://example.invalid", key: "public", secret: "server", rateSecret: "test", siteUrl: "https://toylogix.eu" }) },
    "@supabase/supabase-js": { createClient: () => client },
    "node:crypto": await import("node:crypto"),
    "./auth-handler": { authJson, createAuthHandler },
    "./security-rules": { accountDestination },
    "./login-errors": { loginErrorCode },
  };
  new Function("require", "exports", source)((name) => {
    assert.ok(modules[name], name);
    return modules[name];
  }, exports);
  const response = await exports.handlePasswordAuth("login", new Request("https://toylogix.eu/api/auth/login", {
    method: "POST",
    headers: { origin: "https://toylogix.eu", "content-type": "application/json" },
    body: JSON.stringify({ email: "test@example.com", password: "test-password" }),
  }));
  return { response, body: await response.json(), calls };
}

test("unconfirmed email and wrong credentials stay distinct without querying profiles", async () => {
  for (const code of ["email_not_confirmed", "invalid_credentials"]) {
    const { body, response, calls } = await login({ error: { code } });
    assert.deepEqual(body, { error: loginMessages[code] });
    assert.equal(response.status, code === "email_not_confirmed" ? 403 : 401);
    assert.equal(calls.queries, 0);
  }
});

test("confirmed pending account is signed out and no tokens are returned", async () => {
  const { body, response, calls } = await login({ status: "pending" });
  assert.equal(response.status, 403);
  assert.deepEqual(body, { error: loginMessages.approval_pending });
  assert.deepEqual(calls, { queries: 1, signouts: 1 });
});

test("unconfirmed session is signed out before any approval lookup", async () => {
  const { body, calls } = await login({ confirmed: false });
  assert.deepEqual(body, { error: loginMessages.email_not_confirmed });
  assert.deepEqual(calls, { queries: 0, signouts: 1 });
});

test("approved account can log in; rejected and disabled accounts stay blocked", async () => {
  const success = await login();
  assert.equal(success.response.status, 200);
  assert.equal(success.body.destination, "/store");
  assert.equal(success.calls.signouts, 0);
  for (const options of [{ status: "rejected" }, { active: false }, { status: "pending", active: false }]) {
    const { response, body, calls } = await login(options);
    assert.equal(response.status, 403);
    assert.equal(body.session, undefined);
    assert.notEqual(body.error, loginMessages.approval_pending);
    assert.equal(calls.signouts, 1);
  }
});

test("service and profile failures do not become incorrect-password errors", async () => {
  for (const options of [{ error: { status: 500 } }, { profileError: { message: "DB unavailable" } }]) {
    const { response, body } = await login(options);
    assert.equal(response.status, 503);
    assert.deepEqual(body, { error: loginMessages.unavailable });
  }
});

test("browser error mapping supports legacy messages and respects explicit codes", () => {
  assert.equal(loginErrorCode({ message: "Email not confirmed" }), "email_not_confirmed");
  assert.equal(loginErrorCode({ message: "Invalid login credentials" }), "invalid_credentials");
  assert.equal(loginErrorCode({ code: "invalid_credentials", message: "Email not confirmed" }), "invalid_credentials");
  assert.equal(loginErrorCode({ status: 429 }), "rate_limited");
  assert.equal(loginErrorCode({ message: "Network error" }), "unavailable");
});
