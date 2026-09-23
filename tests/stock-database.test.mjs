import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const admin = "11111111-1111-4111-8111-111111111111";
const customer = "22222222-2222-4222-8222-222222222222";

test("stock migration and PostgreSQL security/transaction regression", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(await read("./fixtures/legacy-schema.sql"));
    await db.exec(
      await read("../supabase/migrations/202609190001_account_security.sql"),
    );
    await db.exec(
      await read("../supabase/migrations/202609230001_stock_management.sql"),
    );
    const query = async (sql, params = []) =>
      (await db.query(sql, params)).rows;
    const product = async () =>
      (await query("select * from public.produse where id=1"))[0];
    const count = async () =>
      Number(
        (await query("select count(*) n from public.stock_movements"))[0].n,
      );
    const move = async (
      type,
      quantity,
      reason = "Test reason",
      reversal = null,
    ) =>
      (
        await query(
          "select * from public.record_stock_movement(1,$1::public.stock_movement_type,$2::integer,$3::text,null,$4::uuid)",
          [type, quantity, reason, reversal],
        )
      )[0];
    const fail = async (sql, params = [], pattern) => {
      await db.exec("savepoint expected_failure");
      await assert.rejects(() => db.query(sql, params), pattern);
      await db.exec(
        "rollback to savepoint expected_failure; release savepoint expected_failure",
      );
    };
    const failMove = (type, quantity, reason, reversal, pattern) =>
      fail(
        "select public.record_stock_movement(1,$1::public.stock_movement_type,$2::integer,$3::text,null,$4::uuid)",
        [type, quantity, reason, reversal],
        pattern,
      );
    const scenario = async (name, run) =>
      t.test(name, async () => {
        await db.exec("begin");
        try {
          await query("select set_config('request.jwt.claim.sub',$1,true)", [
            admin,
          ]);
          await db.exec("set local role authenticated");
          await run();
        } finally {
          await db.exec("rollback");
        }
      });

    await t.test("existing account security suite still passes", async () => {
      await db.exec(await read("../supabase/tests/account_security.sql"));
    });
    await scenario(
      "legacy stock and threshold survive without fabricated history",
      async () => {
        assert.equal((await product()).opening_stock, 7);
        assert.equal((await product()).stoc_actual, 7);
        assert.equal((await product()).critical_stock_level, 2);
        assert.equal(await count(), 0);
      },
    );
    await scenario(
      "all operation types use signed amounts and authenticated audit fields",
      async () => {
        for (const [type, quantity] of [
          ["stock_in", 5],
          ["stock_out", -3],
          ["return", 2],
          ["count_adjustment", -1],
          ["count_adjustment", 4],
        ]) {
          const row = await move(type, quantity);
          assert.equal(row.created_by, admin);
          assert.equal(row.quantity, quantity);
          assert.ok(row.created_at);
        }
        assert.equal((await product()).stoc_actual, 14);
        assert.equal(await count(), 5);
      },
    );
    await scenario(
      "blank/null reasons, zero, wrong directions and shortages roll back both writes",
      async () => {
        for (const args of [
          ["stock_in", 1, " "],
          ["stock_in", 1, "\t\n"],
          ["stock_in", 1, null],
          ["stock_in", 0, "zero"],
          ["stock_out", 1, "bad sign"],
          ["return", -1, "bad sign"],
          ["stock_in", -1, "bad sign"],
          ["stock_out", -8, "shortage"],
          ["count_adjustment", -8, "shortage"],
          ["stock_in", 2147483647, "overflow"],
        ])
          await failMove(...args, null);
        assert.equal((await product()).stoc_actual, 7);
        assert.equal(await count(), 0);
        await move("stock_out", -7);
        assert.equal((await product()).stoc_actual, 0);
      },
    );
    await scenario(
      "direct stock, nonzero inserts, ledger edits and hard deletes are blocked",
      async () => {
        const row = await move("stock_in", 1);
        for (const sql of [
          "update public.produse set stoc_actual=99 where id=1",
          "update public.produse set opening_stock=99 where id=1",
          "insert into public.produse(nume_produs,stoc_actual) values('Bypass',99)",
          "delete from public.produse where id=1",
          "truncate public.stock_movements",
          "update public.stock_movements set reason='tampered'",
          "delete from public.stock_movements",
        ])
          await fail(sql, [], /permission denied/);
        await fail(
          "insert into public.stock_movements(product_id,movement_type,quantity,reason,created_by) values(1,'stock_in',1,'direct',$1)",
          [admin],
          /permission denied/,
        );
        await db.exec(
          "update public.produse set nume_produs='Renamed',stoc_critic=3 where id=1",
        );
        assert.equal((await product()).stoc_actual, 8);
        assert.equal((await product()).critical_stock_level, 3);
        assert.equal(
          (
            await query(
              "select reason from public.stock_movements where id=$1",
              [row.id],
            )
          )[0].reason,
          "Test reason",
        );
        await db.exec("reset role");
        await fail(
          "update public.produse set stoc_actual=99 where id=1",
          [],
          /STOCK_USE_MOVEMENT/,
        );
        await fail(
          "insert into public.produse(nume_produs,stoc_actual) values('Bypass',99)",
          [],
          /STOCK_USE_MOVEMENT/,
        );
      await fail(
        "update public.stock_movements set reason='tampered'",
        [],
        /STOCK_HISTORY_IMMUTABLE/,
      );
      await fail("truncate public.stock_movements", [], /STOCK_HISTORY_IMMUTABLE/);
        await fail(
          "delete from public.produse where id=1",
          [],
          /foreign key constraint/,
        );
        await fail(
          "delete from auth.users where id=$1",
          [admin],
          /foreign key constraint/,
        );
      },
    );
    await scenario(
      "reversal computes the exact opposite and rejects duplicate/chained/cross-product reversals",
      async () => {
        const original = await move("stock_in", 3);
        const reversal = await move("reversal", 999, "Correction", original.id);
        assert.equal(reversal.quantity, -3);
        assert.equal(reversal.reversal_of, original.id);
        assert.equal((await product()).stoc_actual, 7);
        assert.ok(
          (
            await query(
              "select reversed_at from public.stock_movements where id=$1",
              [original.id],
            )
          )[0].reversed_at,
        );
        await failMove(
          "reversal",
          null,
          "Again",
          original.id,
          /STOCK_ALREADY_REVERSED/,
        );
        await failMove(
          "reversal",
          null,
          "Chain",
          reversal.id,
          /STOCK_INVALID_REVERSAL/,
        );
        const other = (
          await query(
            "insert into public.produse(nume_produs) values('Other') returning id",
          )
        )[0];
        await fail(
          "select public.record_stock_movement($1,'reversal',null,'Wrong product',null,$2)",
          [other.id, original.id],
          /STOCK_INVALID_REVERSAL/,
        );
        assert.equal(await count(), 2);
      },
    );
    await scenario(
      "failed reversal leaves the original unmarked and balance unchanged",
      async () => {
        const incoming = await move("stock_in", 2);
        await move("stock_out", -8);
        await failMove(
          "reversal",
          null,
          "Return delivery",
          incoming.id,
          /STOCK_INSUFFICIENT/,
        );
        assert.equal((await product()).stoc_actual, 1);
        assert.equal(await count(), 2);
        assert.equal(
          (
            await query(
              "select reversed_at from public.stock_movements where id=$1",
              [incoming.id],
            )
          )[0].reversed_at,
          null,
        );
      },
    );
    await scenario(
      "archive preserves history, prevents writes and hides products from customers",
      async () => {
        const row = await move("stock_in", 1);
        await db.exec("update public.produse set is_archived=true where id=1");
        assert.ok((await product()).archived_at);
        assert.equal(await count(), 1);
        await failMove(
          "stock_in",
          1,
          "Archived",
          null,
          /STOCK_PRODUCT_ARCHIVED/,
        );
        await failMove(
          "reversal",
          null,
          "Archived",
          row.id,
          /STOCK_PRODUCT_ARCHIVED/,
        );
        await query("select set_config('request.jwt.claim.sub',$1,true)", [
          customer,
        ]);
        assert.equal((await query("select * from public.produse")).length, 0);
        assert.equal(await count(), 0);
        await failMove(
          "stock_in",
          1,
          "Unauthorized",
          null,
          /STOCK_ADMIN_REQUIRED/,
        );
        await query("select set_config('request.jwt.claim.sub',$1,true)", [
          admin,
        ]);
        await db.exec("update public.produse set is_archived=false where id=1");
        assert.equal((await product()).archived_at, null);
        await move("return", 1);
        assert.equal(await count(), 2);
      },
    );
    await scenario(
      "transaction cancellation rolls back successful movement and stock together",
      async () => {
        await db.exec("savepoint interrupted_operation");
        await move("stock_in", 5);
        await db.exec("rollback to savepoint interrupted_operation");
        assert.equal((await product()).stoc_actual, 7);
        assert.equal(await count(), 0);
      },
    );
    await scenario(
      "archiving timestamps are server managed and customer history stays private",
      async () => {
        await move("stock_in", 1);
        await fail(
          "update public.produse set archived_at=now() where id=1",
          [],
          /permission denied/,
        );
        await query("select set_config('request.jwt.claim.sub',$1,true)", [
          customer,
        ]);
        assert.equal((await query("select * from public.produse")).length, 1);
        assert.equal(await count(), 0);
        assert.equal(
          (
            await query(
              "update public.produse set is_archived=true where id=1 returning id",
            )
          ).length,
          0,
        );
      },
    );
    await scenario(
      "anonymous callers cannot read or mutate the ledger",
      async () => {
        await db.exec("set local role anon");
        await fail(
          "select * from public.stock_movements",
          [],
          /permission denied/,
        );
        await failMove("stock_in", 1, "Anonymous", null, /permission denied/);
      },
    );
  } finally {
    await db.close();
  }
});
