import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
test("notification queue is private, confirmation-gated and leased for retries", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL("./fixtures/legacy-schema.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/202609190001_account_security.sql", import.meta.url), "utf8"));
    await db.exec("create role service_role nologin bypassrls");
    await db.exec(await readFile(new URL("../supabase/migrations/20260924164012_registration_notifications.sql", import.meta.url), "utf8"));
    await db.exec("insert into auth.users(id,email) values('33333333-3333-4333-8333-333333333333','new@example.invalid')");
    assert.equal((await db.query("select count(*)::int n from public.registration_notifications")).rows[0].n, 1);
    assert.equal((await db.query("select * from public.claim_registration_notifications()")).rows.length, 0);
    await db.exec("update auth.users set email_confirmed_at=now() where id='33333333-3333-4333-8333-333333333333'");
    assert.equal((await db.query("select * from public.claim_registration_notifications()")).rows.length, 1);
    assert.equal((await db.query("select * from public.claim_registration_notifications()")).rows.length, 0);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from public.registration_notifications"), /permission denied/);
    await assert.rejects(db.query("select * from public.claim_registration_notifications()"), /permission denied/);
  } finally { await db.close(); }
});
