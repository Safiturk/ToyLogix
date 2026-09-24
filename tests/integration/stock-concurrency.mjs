// Uses a new local disposable cluster; never connects to .env.local or Supabase.
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import EmbeddedPostgres from "embedded-postgres";

const tempRoot = resolve(tmpdir());
const databaseDir = await mkdtemp(join(tempRoot, "toylogix-stock-test-"));
assert.ok(resolve(databaseDir).startsWith(tempRoot + sep));
const portProbe = createServer();
await new Promise((done) => portProbe.listen(0, "127.0.0.1", done));
const port = portProbe.address().port;
await new Promise((done) => portProbe.close(done));
const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: "postgres",
  password: "local-test-only",
  persistent: false,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
const clients = [];
let started = false;
try {
  await pg.initialise();
  await pg.start();
  started = true;
  for (let index = 0; index < 3; index++) {
    const client = pg.getPgClient("postgres", "127.0.0.1");
    await client.connect();
    clients.push(client);
  }
  const [observer, a, b] = clients;
  for (const path of [
    "../fixtures/legacy-schema.sql",
    "../../supabase/migrations/202609190001_account_security.sql",
    "../../supabase/migrations/202609230001_stock_management.sql",
  ])
    await observer.query(
      await readFile(new URL(path, import.meta.url), "utf8"),
    );
  for (const client of [a, b]) {
    await client.query(
      "select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)",
    );
    await client.query("set role authenticated; set statement_timeout='10s'");
  }
  const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
  const move = (client, type, quantity, reversal = null) =>
    client.query(
      "select * from public.record_stock_movement(1,$1::public.stock_movement_type,$2::integer,'Concurrency test',null,$3::uuid)",
      [type, quantity, reversal],
    );
  const waitForLock = async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const blocked = await observer.query(
        "select cardinality(pg_blocking_pids($1)) > 0 blocked",
        [pid],
      );
      if (blocked.rows[0].blocked) return;
      await delay(20);
    }
    throw new Error("Second connection did not wait on the product row lock");
  };
  const balance = async () =>
    Number(
      (
        await observer.query(
          "select stoc_actual from public.produse where id=1",
        )
      ).rows[0].stoc_actual,
    );
  const ledgerCount = async () =>
    Number(
      (await observer.query("select count(*) n from public.stock_movements"))
        .rows[0].n,
    );
  const compete = async (first, second) => {
    await a.query("begin");
    const initial = await first();
    const pending = second().then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await waitForLock();
    await a.query("commit");
    return { initial, second: await pending };
  };

  const withdrawals = await compete(
    () => move(a, "stock_out", -5),
    () => move(b, "stock_out", -5),
  );
  assert.match(withdrawals.second.error?.message ?? "", /STOCK_INSUFFICIENT/);
  assert.equal(await balance(), 2);
  assert.equal(await ledgerCount(), 1);
  console.log(
    "PASS: competing withdrawals wait; the second sees committed stock and rolls back",
  );

  const receipts = await compete(
    () => move(a, "stock_in", 3),
    () => move(b, "return", 4),
  );
  assert.ok(receipts.second.value);
  assert.equal(await balance(), 9);
  assert.equal(await ledgerCount(), 3);
  console.log("PASS: competing receipts preserve both increments");

  const original = receipts.initial.rows[0].id;
  const reversals = await compete(
    () => move(a, "reversal", null, original),
    () => move(b, "reversal", null, original),
  );
  assert.match(reversals.second.error?.message ?? "", /STOCK_ALREADY_REVERSED/);
  assert.equal(await balance(), 6);
  assert.equal(await ledgerCount(), 4);
  console.log("PASS: competing reversals apply exactly once");

  const archive = await compete(
    () => a.query("update public.produse set is_archived=true where id=1"),
    () => move(b, "stock_in", 1),
  );
  assert.match(archive.second.error?.message ?? "", /STOCK_PRODUCT_ARCHIVED/);
  assert.equal(await balance(), 6);
  assert.equal(await ledgerCount(), 4);
  console.log("PASS: archive and movement serialize on the same row");

  for (const path of [
    "../fixtures/security-auth.sql",
    "../../supabase/migrations/20260923210656_account_hardening.sql",
  ])
    await observer.query(
      await readFile(new URL(path, import.meta.url), "utf8"),
    );
  for (const client of [a, b]) {
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({
        sub: "11111111-1111-4111-8111-111111111111",
        session_id: "11111111-0000-4000-8000-111111111111",
        aal: "aal2",
      }),
    ]);
    await client.query("set role authenticated");
  }
  const codes = (await a.query("select public.rotate_recovery_codes() codes"))
    .rows[0].codes;
  const recover = (client) =>
    client.query("select public.consume_recovery_code($1) accepted", [
      codes[0],
    ]);
  const recovery = await compete(
    () => recover(a),
    () => recover(b),
  );
  assert.equal(recovery.initial.rows[0].accepted, true);
  assert.equal(recovery.second.value.rows[0].accepted, false);
  console.log("PASS: simultaneous recovery code use succeeds exactly once");

  for (const client of [a, b]) await client.query("set role service_role");
  const rate = (client) =>
    client.query("select public.consume_auth_rate_limit($1,1,600) result", [
      "c".repeat(64),
    ]);
  const limited = await compete(
    () => rate(a),
    () => rate(b),
  );
  assert.equal(limited.initial.rows[0].result.allowed, true);
  assert.equal(limited.second.value.rows[0].result.allowed, false);
  console.log("PASS: distributed rate counters serialize across connections");

  await a.query("set role authenticated");
  assert.equal(
    (await a.query("select public.toylogix_is_admin() allowed")).rows[0]
      .allowed,
    true,
  );
  await observer.query("update public.utilizatori set rol='user' where id=1");
  assert.equal(
    (await a.query("select public.toylogix_is_admin() allowed")).rows[0]
      .allowed,
    false,
  );
  await assert.rejects(
    () => a.query("select public.deactivate_account(2,true)"),
    /ADMIN_MFA_REQUIRED/,
  );
  console.log(
    "PASS: committed role revocation rejects the existing connection and unchanged JWT",
  );
} finally {
  await Promise.allSettled(
    clients.map(async (client) => {
      try {
        await client.query("rollback");
      } finally {
        await client.end();
      }
    }),
  );
  if (started) {
    // embedded-postgres waits for the Windows child-process exit event. Keep
    // shutdown bounded so a test cannot leave CI hanging after all assertions.
    await Promise.race([pg.stop(), delay(5000)]);
  }
}
