import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../lib/auth-client.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

function client(hardening, auth, fetch) {
  const exports = {};
  new Function("require", "exports", "fetch", source)(
    (name) => name === "./supabase"
      ? { supabase: { auth } }
      : { accountHardeningEnabled: hardening },
    exports,
    fetch,
  );
  return exports;
}

test("existing deployment logs in through Supabase without unavailable server config", async () => {
  const result = { data: { user: { id: "test" } }, error: null };
  const api = client(false, {
    signInWithPassword: async (credentials) => {
      assert.deepEqual(credentials, { email: "test@example.com", password: "test-only" });
      return result;
    },
  }, () => assert.fail("unconfigured endpoint must not be used"));
  assert.equal(await api.passwordLogin("test@example.com", "test-only"), result);
});

test("hardened deployment does not fall back when server rejects login", async () => {
  const api = client(true, {
    signInWithPassword: () => assert.fail("must not bypass hardened endpoint"),
  }, async () => ({ ok: false, json: async () => ({ error: "Unavailable" }) }));
  await assert.rejects(api.passwordLogin("test@example.com", "test-only"), /Unavailable/);
});

test("hardened deployment installs only server-issued session", async () => {
  const session = { access_token: "test-access", refresh_token: "test-refresh" };
  const api = client(true, {
    setSession: async (value) => { assert.deepEqual(value, session); return { error: null }; },
  }, async () => ({ ok: true, json: async () => ({ session }) }));
  assert.deepEqual(await api.passwordLogin("test@example.com", "test-only"), { error: null });
});

test("legacy account deletion uses authenticated Edge Function without Next server secrets", async () => {
  const api = client(false, {
    getSession: async () => ({ data: { session: { access_token: "test-access" } } }),
  }, async (url, options) => {
    assert.equal(url, `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`);
    assert.equal(options.headers.Authorization, "Bearer test-access");
    assert.equal(options.body, '{"profileId":2}');
    return { ok: true, json: async () => ({ ok: true }) };
  });
  assert.deepEqual(await api.authPost("/api/admin/accounts/delete", { profileId: 2 }, true), { ok: true });
});

test("hardened account deletion retains its server route and does not fall back on error", async () => {
  const api = client(true, {
    getSession: async () => ({ data: { session: { access_token: "test-access" } } }),
  }, async (url) => {
    assert.equal(url, "/api/admin/accounts/delete");
    return { ok: false, json: async () => ({ error: "History retained" }) };
  });
  await assert.rejects(api.authPost("/api/admin/accounts/delete", { profileId: 2 }, true), /History retained/);
});
