import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const admin = "11111111-1111-4111-8111-111111111111";
const customer = "22222222-2222-4222-8222-222222222222";
test("standalone admin restoration provides inventory and immutable private audit", async () => {
  const db = new PGlite();
  try {
    await db.exec(await read("./fixtures/legacy-schema.sql"));
    await db.exec("create role service_role nologin");
    await db.exec(await read("../supabase/migrations/202609190001_account_security.sql"));
    await db.exec(await read("../supabase/migrations/202609230001_stock_management.sql"));
    const migration = await read("../supabase/migrations/20260929214926_restore_admin_audit_inventory.sql");
    await db.exec(migration);
    await db.exec(migration); // retries preserve history and do not duplicate triggers.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select * from public.inventory_products")).rows.length, 1);
    const stats = (await db.query("select public.admin_inventory_stats() stats")).rows[0].stats;
    assert.equal(stats.products, 1);
    assert.equal(stats.stock, 7);
    await db.exec("update public.utilizatori set status='pending' where id=2");
    const audit = (await db.query("select * from public.audit_logs")).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actor_id, admin);
    assert.equal(audit[0].target_user_id, customer);
    assert.equal(audit[0].action, "approval_changed");
    assert.deepEqual(audit[0].old_value, { status: "approved" });
    assert.deepEqual(audit[0].new_value, { status: "pending" });
    await assert.rejects(db.query("insert into public.audit_logs(action) values ('forged')"), /permission denied/);
    await assert.rejects(db.query("delete from public.audit_logs"), /permission denied/);
    await db.exec("update public.utilizatori set status='approved' where id=2");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [customer]);
    assert.equal((await db.query("select * from public.audit_logs")).rows.length, 0);
    await assert.rejects(db.query("select public.admin_inventory_stats()"), /ADMIN_REQUIRED/);
    await db.exec("reset role");
    await assert.rejects(db.query("update public.audit_logs set action='changed'"), /AUDIT_IMMUTABLE/);
    await assert.rejects(db.query("truncate public.audit_logs"), /AUDIT_IMMUTABLE/);
    await db.exec("set role anon");
    for (const sql of ["select * from public.audit_logs", "select * from public.inventory_products", "select public.admin_inventory_stats()", "select private.audit_profile()"])
      await assert.rejects(db.query(sql), /permission denied/);
  } finally {
    await db.close();
  }
});
