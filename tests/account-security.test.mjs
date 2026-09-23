import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const admin = "11111111-1111-4111-8111-111111111111";
const customer = "22222222-2222-4222-8222-222222222222";
const sessions = {
  [admin]: "11111111-0000-4000-8000-111111111111",
  [customer]: "22222222-0000-4000-8000-222222222222",
};
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
test("account hardening migration, RLS, audit and MFA recovery", async (t) => {
  const db = new PGlite();
  try {
    for (const file of [
      "./fixtures/legacy-schema.sql",
      "../supabase/migrations/202609190001_account_security.sql",
      "../supabase/migrations/202609230001_stock_management.sql",
      "./fixtures/security-auth.sql",
      "../supabase/migrations/20260923210656_account_hardening.sql",
    ])
      await db.exec(await read(file));
    const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
    const login = async (user, aal = user === admin ? "aal2" : "aal1") => {
      await rows(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [user, JSON.stringify({ sub: user, session_id: sessions[user], aal })],
      );
      await db.exec("set local role authenticated");
    };
    const fail = async (sql, params = [], pattern) => {
      await db.exec("savepoint expected_failure");
      await assert.rejects(() => db.query(sql, params), pattern);
      await db.exec(
        "rollback to savepoint expected_failure; release savepoint expected_failure",
      );
    };
    const scenario = async (name, run) =>
      t.test(name, async () => {
        await db.exec("begin");
        try {
          await login(admin);
          await run();
        } finally {
          await db.exec("rollback");
        }
      });
    await scenario(
      "MFA gates administrators while allowing own profile for enrollment",
      async () => {
        await login(admin, "aal1");
        assert.equal(
          (await rows("select public.toylogix_is_admin() ok"))[0].ok,
          false,
        );
        assert.equal(
          (await rows("select id from public.utilizatori")).length,
          1,
        );
        assert.equal((await rows("select id from public.produse")).length, 0);
        await fail(
          "select public.deactivate_account(2,true)",
          [],
          /ADMIN_MFA_REQUIRED/,
        );
        await login(admin);
        assert.equal(
          (await rows("select public.toylogix_is_admin() ok"))[0].ok,
          true,
        );
        assert.equal(
          (await rows("select id from public.utilizatori")).length,
          2,
        );
      },
    );
    await scenario(
      "customers cannot read another profile/billing, reassign ownership or promote themselves",
      async () => {
        await db.exec("reset role");
        await rows(
          "insert into public.billing_profiles(user_id,legal_name) values($1,'Admin billing'),($2,'Customer billing')",
          [admin, customer],
        );
        await login(customer);
        assert.equal(
          (await rows("select id from public.utilizatori")).length,
          1,
        );
        assert.deepEqual(
          (await rows("select legal_name from public.billing_profiles")).map(
            (x) => x.legal_name,
          ),
          ["Customer billing"],
        );
        await fail(
          "update public.utilizatori set rol='admin' where auth_user_id=auth.uid()",
          [],
          /Cannot change/,
        );
        await fail(
          "update public.billing_profiles set user_id=$1 where user_id=auth.uid()",
          [admin],
          /row-level security/,
        );
        assert.equal(
          (
            await rows(
              "update public.billing_profiles set legal_name='stolen' where user_id=$1 returning user_id",
              [admin],
            )
          ).length,
          0,
        );
        assert.equal((await rows("select * from public.audit_logs")).length, 0);
      },
    );
    await scenario(
      "pending users keep own billing access; rejected/deactivated sessions lose it immediately",
      async () => {
        await db.exec(
          "update public.utilizatori set status='pending' where id=2",
        );
        await login(customer);
        assert.equal((await rows("select id from public.produse")).length, 0);
        await rows("select public.save_my_account($1::jsonb)", [
          JSON.stringify({ nume_complet: "Pending", telefon: "0712345678" }),
        ]);
        assert.equal(
          (await rows("select * from public.billing_profiles")).length,
          1,
        );
        await login(admin);
        await db.exec(
          "update public.utilizatori set status='rejected' where id=2",
        );
        await login(customer);
        assert.equal(
          (await rows("select id from public.utilizatori")).length,
          0,
        );
        assert.equal(
          (await rows("select * from public.billing_profiles")).length,
          0,
        );
        await fail(
          'select public.save_my_account(\'{"nume_complet":"No","telefon":"0712345678"}\')',
        );
        await login(admin);
        await db.exec(
          "update public.utilizatori set status='approved' where id=2; select public.deactivate_account(2,true)",
        );
        await login(customer);
        assert.equal((await rows("select id from public.produse")).length, 0);
      },
    );
    await scenario(
      "role/status/access audit stores actor and old/new values, cannot be edited or truncated",
      async () => {
        await db.exec(
          "update public.utilizatori set rol='admin',status='pending' where id=2; select public.deactivate_account(2,true)",
        );
        const logs = await rows("select * from public.audit_logs order by id");
        assert.deepEqual(
          logs.map((x) => x.action),
          ["role_changed", "approval_changed", "access_changed"],
        );
        assert.ok(
          logs.every(
            (x) =>
              x.actor_id === admin &&
              x.target_user_id === customer &&
              x.created_at,
          ),
        );
        assert.deepEqual(logs[0].old_value, { rol: "user" });
        assert.deepEqual(logs[0].new_value, { rol: "admin" });
        await fail(
          "update public.audit_logs set action='tampered'",
          [],
          /permission denied/,
        );
        await db.exec("reset role");
        await fail("delete from public.audit_logs", [], /AUDIT_IMMUTABLE/);
        await fail("truncate public.audit_logs", [], /AUDIT_IMMUTABLE/);
      },
    );
    await scenario(
      "revoked role, deleted session and removed factor reject unchanged JWT claims",
      async () => {
        await db.exec(
          "reset role; update public.utilizatori set rol='user' where id=1",
        );
        await login(admin);
        assert.equal(
          (await rows("select public.toylogix_is_admin() ok"))[0].ok,
          false,
        );
        await fail(
          "select public.record_stock_movement(1,'stock_in',1,'Revoked')",
          [],
          /STOCK_ADMIN_REQUIRED/,
        );
        await db.exec(
          "reset role; update public.utilizatori set rol='admin' where id=1; delete from auth.mfa_factors",
        );
        await login(admin);
        assert.equal(
          (await rows("select public.toylogix_is_admin() ok"))[0].ok,
          false,
        );
        await db.exec("reset role; delete from auth.sessions");
        await login(customer);
        assert.equal(
          (await rows("select id from public.utilizatori")).length,
          0,
        );
      },
    );
    await scenario(
      "profile deletion preserves Auth/billing and cannot silently recreate access",
      async () => {
        await login(customer);
        await rows("select public.save_my_account($1::jsonb)", [
          JSON.stringify({ nume_complet: "Customer", telefon: "0712345678" }),
        ]);
        await login(admin);
        await db.exec("select public.delete_profile(2)");
        await login(customer);
        assert.equal(
          (await rows("select id from public.utilizatori")).length,
          0,
        );
        await db.exec("reset role");
        assert.equal(
          (await rows("select id from auth.users where id=$1", [customer]))
            .length,
          1,
        );
        assert.equal(
          (
            await rows(
              "select user_id from public.billing_profiles where user_id=$1",
              [customer],
            )
          ).length,
          1,
        );
        await rows(
          "update auth.users set email_confirmed_at=now() where id=$1",
          [customer],
        );
        assert.equal(
          (
            await rows(
              "select id from public.utilizatori where auth_user_id=$1",
              [customer],
            )
          ).length,
          0,
        );
      },
    );
    await scenario(
      "Auth deletion cascades contact/billing but retains audit and forbids deleting stock actors",
      async () => {
        await db.exec("select public.prepare_account_deletion(2)");
        await db.exec("reset role");
        await rows("delete from auth.users where id=$1", [customer]);
        assert.equal(
          (
            await rows(
              "select id from public.utilizatori where auth_user_id=$1",
              [customer],
            )
          ).length,
          0,
        );
        assert.ok(
          (
            await rows(
              "select id from public.audit_logs where target_user_id=$1",
              [customer],
            )
          ).length >= 2,
        );
        await login(admin);
        await db.exec(
          "select public.record_stock_movement(1,'stock_in',1,'Retained history')",
        );
        await db.exec("reset role");
        await fail(
          "delete from auth.users where id=$1",
          [admin],
          /foreign key constraint/,
        );
      },
    );
    await scenario(
      "recovery codes are hashed, rotate, consume once and never elevate an AAL1 session",
      async () => {
        const first = (
          await rows("select public.rotate_recovery_codes() codes")
        )[0].codes;
        assert.equal(new Set(first).size, 10);
        await fail(
          "select * from private.mfa_recovery_codes",
          [],
          /permission denied/,
        );
        const second = (
          await rows("select public.rotate_recovery_codes() codes")
        )[0].codes;
        await login(admin, "aal1");
        assert.equal(
          (
            await rows("select public.consume_recovery_code($1) ok", [first[0]])
          )[0].ok,
          false,
        );
        assert.equal(
          (
            await rows("select public.consume_recovery_code($1) ok", [
              second[0],
            ])
          )[0].ok,
          true,
        );
        assert.equal(
          (
            await rows("select public.consume_recovery_code($1) ok", [
              second[0],
            ])
          )[0].ok,
          false,
        );
        assert.equal(
          (await rows("select public.toylogix_is_admin() ok"))[0].ok,
          false,
        );
        await fail(
          "select public.rotate_recovery_codes()",
          [],
          /ADMIN_MFA_REQUIRED/,
        );
      },
    );
    await scenario(
      "recovery attempts are limited and rate counters are server-only",
      async () => {
        const codes = (
          await rows("select public.rotate_recovery_codes() codes")
        )[0].codes;
        await login(admin, "aal1");
        for (let i = 0; i < 5; i++)
          await rows("select public.consume_recovery_code('invalid')");
        assert.equal(
          (
            await rows("select public.consume_recovery_code($1) ok", [codes[0]])
          )[0].ok,
          false,
        );
        await fail(
          "select public.consume_auth_rate_limit($1,5,60)",
          ["a".repeat(64)],
          /permission denied/,
        );
        await db.exec("set local role service_role");
        for (let i = 0; i < 3; i++)
          assert.equal(
            (
              await rows(
                "select public.consume_auth_rate_limit($1,2,60) result",
                ["a".repeat(64)],
              )
            )[0].result.allowed,
            i < 2,
          );
        await db.exec(
          "reset role; update private.auth_rate_limits set window_started_at=now()-interval '2 minutes'",
        );
        await db.exec("set local role service_role");
        assert.equal(
          (
            await rows(
              "select public.consume_auth_rate_limit($1,2,60) result",
              ["a".repeat(64)],
            )
          )[0].result.allowed,
          true,
        );
      },
    );
    await scenario(
      "anonymous roles cannot execute privileged helpers or read account data",
      async () => {
        await db.exec("set local role anon");
        for (const sql of [
          "select public.toylogix_is_admin()",
          "select public.toylogix_create_profile()",
          "select * from public.audit_logs",
          "select public.rotate_recovery_codes()",
        ])
          await fail(sql, [], /permission denied/);
      },
    );
    await scenario(
      "bans, unconfirmed email and expired sessions deny access without refreshing the JWT",
      async () => {
        for (const change of [
          "update auth.users set banned_until=now()+interval '1 hour' where id='" +
            customer +
            "'",
          "update auth.users set banned_until=null,email_confirmed_at=null where id='" +
            customer +
            "'",
          "update auth.users set email_confirmed_at=now() where id='" +
            customer +
            "'; update auth.sessions set not_after=now()-interval '1 second' where user_id='" +
            customer +
            "'",
        ]) {
          await db.exec("reset role; " + change);
          await login(customer);
          assert.equal(
            (await rows("select id from public.utilizatori")).length,
            0,
          );
          assert.equal((await rows("select id from public.produse")).length, 0);
        }
      },
    );
    await scenario(
      "self lifecycle actions are forbidden and stale rate counters are cleaned in bounded batches",
      async () => {
        for (const sql of [
          "select public.deactivate_account(1,true)",
          "select public.delete_profile(1)",
          "select public.prepare_account_deletion(1)",
        ])
          await fail(sql, [], /ACCOUNT_NOT_FOUND_OR_SELF/);
        await db.exec(
          "reset role; insert into private.auth_rate_limits select lpad(i::text,64,'0'),now()-interval '3 days',1 from generate_series(1,150) i; set local role service_role",
        );
        await rows("select public.consume_auth_rate_limit($1,5,60)", [
          "f".repeat(64),
        ]);
        await db.exec("reset role");
        assert.equal(
          Number(
            (
              await rows(
                "select count(*) n from private.auth_rate_limits where window_started_at<now()-interval '2 days'",
              )
            )[0].n,
          ),
          50,
        );
      },
    );
  } finally {
    await db.close();
  }
});

test("optional invoices isolate owners and retain financial history", async () => {
  const db = new PGlite();
  try {
    for (const file of [
      "./fixtures/legacy-schema.sql",
      "../supabase/migrations/202609190001_account_security.sql",
      "../supabase/migrations/202609230001_stock_management.sql",
      "./fixtures/security-auth.sql",
    ])
      await db.exec(await read(file));
    await db.exec(`create table public.invoices(id bigint primary key,user_id uuid references auth.users(id) on delete cascade);
      insert into public.invoices values(1,'${admin}'),(2,'${customer}');
      grant all on public.invoices to anon,authenticated;`);
    await db.exec(
      await read("../supabase/migrations/20260923210656_account_hardening.sql"),
    );
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [
        customer,
        JSON.stringify({
          sub: customer,
          session_id: sessions[customer],
          aal: "aal1",
        }),
      ],
    );
    await db.exec("set role authenticated");
    assert.deepEqual(
      (await db.query("select id from public.invoices")).rows.map((r) =>
        Number(r.id),
      ),
      [2],
    );
    await assert.rejects(
      () => db.exec("delete from public.invoices"),
      /permission denied/,
    );
    await db.exec("reset role");
    await assert.rejects(
      () => db.query("delete from auth.users where id=$1", [customer]),
      /foreign key constraint/,
    );
    assert.equal(
      (await db.query("select * from public.invoices")).rows.length,
      2,
    );
  } finally {
    await db.close();
  }
});
