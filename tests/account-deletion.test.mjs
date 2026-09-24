import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { deletionHandler } from "../supabase/functions/delete-account/handler.ts";

const missing = { code: "PGRST202", message: "Could not find public.prepare_account_deletion" };
function scenario(overrides = {}) {
  const calls = [];
  const backend = {
    user: async () => ({ id: "admin", confirmed: true }),
    isAdmin: async () => true,
    target: async () => ({ data: { auth_user_id: "customer" }, error: null }),
    prepare: async () => ({ data: null, error: missing }),
    legacySchema: async () => true,
    deleteAuth: async (id) => { calls.push(["auth", id]); return true; },
    deleteUnlinked: async (id) => { calls.push(["profile", id]); return true; },
    ...overrides,
  };
  return { calls, run: (options = {}) => deletionHandler(() => backend)(new Request("https://example.invalid", {
    method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    body: JSON.stringify({ profileId: 2 }), ...options,
  })) };
}

test("legacy deletion removes Auth user only after verified admin checks", async () => {
  const s = scenario();
  assert.deepEqual(await (await s.run()).json(), { ok: true });
  assert.deepEqual(s.calls, [["auth", "customer"]]);
});
test("unlinked legacy profiles are deleted through the caller's RLS", async () => {
  const s = scenario({ target: async () => ({ data: { auth_user_id: null }, error: null }) });
  assert.equal((await s.run()).status, 200);
  assert.deepEqual(s.calls, [["profile", 2]]);
});
test("anonymous, expired, unconfirmed, customer, missing target and self requests cannot delete", async () => {
  for (const overrides of [
    { user: async () => null },
    { user: async () => ({ id: "admin", confirmed: false }) },
    { isAdmin: async () => false },
    { target: async () => ({ data: null, error: null }) },
    { target: async () => ({ data: { auth_user_id: "admin" }, error: null }) },
  ]) {
    const s = scenario(overrides);
    assert.ok((await s.run()).status >= 400);
    assert.deepEqual(s.calls, []);
  }
  const s = scenario();
  assert.equal((await s.run({ headers: { "Content-Type": "application/json" } })).status, 401);
  assert.deepEqual(s.calls, []);
});
test("MFA, retained history, unknown RPC and migration failures never bypass preparation", async () => {
  for (const overrides of [
    { prepare: async () => ({ data: null, error: { code: "42501" } }) },
    { prepare: async () => ({ data: null, error: { code: "P0001", message: "ACCOUNT_HAS_RETAINED_HISTORY" } }) },
    { prepare: async () => ({ data: null, error: { code: "PGRST202", message: "another function" } }) },
    { legacySchema: async () => false },
    { prepare: async () => ({ data: "changed-account", error: null }) },
  ]) {
    const s = scenario(overrides);
    assert.ok((await s.run()).status >= 400);
    assert.deepEqual(s.calls, []);
  }
});
test("hardened preparation is honored and admin revocation blocks the final deletion", async () => {
  const s = scenario({ prepare: async () => ({ data: "customer", error: null }) });
  assert.equal((await s.run()).status, 200);
  let checks = 0;
  const revoked = scenario({ isAdmin: async () => ++checks === 1 });
  assert.equal((await revoked.run()).status, 403);
  assert.deepEqual(revoked.calls, []);
});
test("provider failure does not report success or remove the profile separately", async () => {
  const s = scenario({ deleteAuth: async () => false });
  assert.equal((await s.run()).status, 409);
  assert.deepEqual(s.calls, []);
});
test("malformed, oversized and invalid IDs are rejected before backend access", async () => {
  const s = scenario({ user: async () => assert.fail("must not contact Auth") });
  for (const body of ["{", "null", "[]", '{"profileId":0}', '{"profileId":"2"}'])
    assert.equal((await s.run({ body })).status, 400);
  assert.equal((await s.run({ body: " ".repeat(2049) })).status, 413);
  assert.deepEqual(s.calls, []);
});
test("Auth deletion atomically cascades profile and billing; retention rolls it all back", async () => {
  const db = new PGlite();
  const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
  try {
    await db.exec(read("./fixtures/legacy-schema.sql"));
    await db.exec(read("../supabase/migrations/202609190001_account_security.sql"));
    await db.exec(read("../supabase/migrations/20260924113302_account_delete_cascade.sql"));
    await db.exec("insert into public.billing_profiles(user_id) values ('22222222-2222-4222-8222-222222222222')");
    await db.exec("begin; delete from auth.users where id='22222222-2222-4222-8222-222222222222'");
    assert.equal((await db.query("select count(*)::int as n from public.utilizatori where id=2")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from public.billing_profiles")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from public.utilizatori where id=1")).rows[0].n, 1);
    await db.exec("rollback; create table public.retained_history(owner uuid references auth.users(id) on delete restrict); insert into public.retained_history values ('22222222-2222-4222-8222-222222222222')");
    await assert.rejects(db.exec("delete from auth.users where id='22222222-2222-4222-8222-222222222222'"), /foreign key/);
    assert.equal((await db.query("select count(*)::int as n from public.utilizatori where id=2")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int as n from public.billing_profiles")).rows[0].n, 1);
  } finally { await db.close(); }
});
