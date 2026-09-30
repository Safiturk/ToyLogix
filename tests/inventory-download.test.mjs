import test from "node:test";
import assert from "node:assert/strict";
import { downloadInventoryReport } from "../lib/inventory-download.ts";

test("native save opens before generation, writes XLSX bytes and closes", async () => {
  const calls = [];
  globalThis.window = { showSaveFilePicker: async (options) => {
    assert.equal(options.suggestedName, "Inventar_ToyLogix.xlsx");
    calls.push("picker");
    return { createWritable: async () => ({
      write: async (blob) => { assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [80, 75]); calls.push("write"); },
      close: async () => calls.push("close"),
      abort: async () => assert.fail("unexpected abort"),
    }) };
  } };
  try {
    await downloadInventoryReport(async () => { calls.push("generate"); return new Uint8Array([80, 75]); });
    assert.deepEqual(calls, ["picker", "generate", "write", "close"]);
  } finally { delete globalThis.window; }
});

test("canceling save does not generate or download a report", async () => {
  globalThis.window = { showSaveFilePicker: async () => { throw new DOMException("Cancelled", "AbortError"); } };
  try { await downloadInventoryReport(() => assert.fail("must not generate")); }
  finally { delete globalThis.window; }
});

test("unsupported or frame-blocked picker uses a local download without delegated navigation", async () => {
  const originalTimeout = globalThis.setTimeout;
  for (const picker of [undefined, async () => { throw new DOMException("Frame", "SecurityError"); }]) {
    const link = new EventTarget();
    let clicked = false, removed = false;
    link.click = () => {
      assert.match(link.href, /^blob:/);
      assert.equal(link.download, "Inventar_ToyLogix.xlsx");
      assert.equal(link.target, "_self");
      const event = new Event("click");
      let stopped = false;
      event.stopPropagation = () => { stopped = true; };
      link.dispatchEvent(event);
      assert.ok(stopped);
      clicked = true;
    };
    link.remove = () => { removed = true; };
    globalThis.window = { showSaveFilePicker: picker };
    globalThis.document = { createElement: () => link, body: { appendChild: () => {} } };
    globalThis.setTimeout = (cleanup, delay) => { assert.equal(delay, 60000); cleanup(); };
    try {
      await downloadInventoryReport(async () => new Uint8Array([80, 75]));
      assert.ok(clicked && removed);
    } finally {
      delete globalThis.window;
      delete globalThis.document;
      globalThis.setTimeout = originalTimeout;
    }
  }
});
