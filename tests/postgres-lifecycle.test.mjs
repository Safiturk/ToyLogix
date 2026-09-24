import test from "node:test";
import assert from "node:assert/strict";
import { closeClients, bounded, stopCluster } from "./helpers/postgres-lifecycle.mjs";
import { mkdtemp, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("rollback failure never skips closing clients", async () => {
  let ended = 0;
  await closeClients([{ query: async () => { throw Error("disconnected"); }, end: async () => { ended++; } }]);
  assert.equal(ended, 1);
});
test("cleanup errors are reported after all clients have been closed", async () => {
  let ended = 0;
  await assert.rejects(closeClients([
    { query: async () => {}, end: async () => { throw Error("close failed"); } },
    { query: async () => {}, end: async () => { ended++; } },
  ]), AggregateError);
  assert.equal(ended, 1);
});
test("unresolved work times out instead of hanging", async () => {
  await assert.rejects(bounded(new Promise(() => {}), 10, "test"), /timed out/);
});
test("already exited cluster is cleaned without waiting for another exit event", async () => {
  const directory = await mkdtemp(join(tmpdir(), "toylogix-stock-test-"));
  const pg = { process: { exitCode: 0, signalCode: null } };
  await stopCluster(pg, directory);
  assert.equal(pg.process, undefined);
  await assert.rejects(access(directory));
});
test("cleanup refuses paths outside the disposable cluster", async () => {
  await assert.rejects(stopCluster({}, process.cwd()), /Refusing/);
});
