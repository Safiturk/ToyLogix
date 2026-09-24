import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join, resolve, sep } from "node:path";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const run = promisify(execFile);
export async function bounded(operation, ms, label) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}

export async function closeClients(clients) {
  const results = await Promise.allSettled(clients.map(async (client) => {
    try { await bounded(client.query("rollback"), 2000, "rollback"); }
    catch { /* A failed/disconnected client still needs end(). */ }
    finally { await bounded(client.end(), 3000, "client.end"); }
  }));
  const errors = results.filter((result) => result.status === "rejected");
  if (errors.length) throw new AggregateError(errors.map((result) => result.reason), "Client cleanup failed");
}

export async function stopCluster(pg, databaseDir) {
  const directory = resolve(databaseDir);
  if (!directory.startsWith(resolve(tmpdir()) + sep) || !directory.split(sep).at(-1).startsWith("toylogix-stock-test-"))
    throw new Error("Refusing to remove a directory outside the disposable test cluster");
  const child = pg.process;
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((done) => child.once("exit", done));
    try {
      // pg_ctl supports graceful shutdown on Windows; SIGINT/taskkill does not.
      await run(join(dirname(child.spawnfile), process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl"),
        ["-D", directory, "stop", "-m", "fast", "-w", "-t", "10"],
        { timeout: 12000, windowsHide: true });
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) {
        if (process.platform === "win32") await run("taskkill", ["/pid", String(child.pid), "/t", "/f"], { timeout: 5000, windowsHide: true });
        else child.kill("SIGKILL");
      }
      await bounded(exited, 5000, "postgres exit");
      throw new Error("Postgres required forced termination", { cause: error });
    }
    await bounded(exited, 5000, "postgres exit");
  }
  // The dependency's exit hook must not wait a second time on an exited child.
  pg.process = undefined;
  await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
