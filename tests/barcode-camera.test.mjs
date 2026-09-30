import test from "node:test";
import assert from "node:assert/strict";
import { NotFoundException, ChecksumException, FormatException } from "@zxing/library";
import { startBarcodeCamera } from "../lib/barcode-camera.ts";

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture(t, decode = () => { throw new NotFoundException(); }) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const video = { readyState: 0, videoWidth: 0, videoHeight: 0, srcObject: null, play: async () => {} };
  const track = { stop: t.mock.fn() };
  const stream = { getTracks: () => [track] };
  const reader = { decode: t.mock.fn(decode), reset: t.mock.fn() };
  const success = t.mock.fn();
  const error = t.mock.fn();
  const start = (acquire = async () => stream) => {
    const stop = startBarcodeCamera(video, reader, success, error, acquire);
    t.after(stop);
    return stop;
  };
  const ready = () => Object.assign(video, { readyState: 2, videoWidth: 640, videoHeight: 480 });
  return { video, track, stream, reader, success, error, start, ready };
}

test("waits for usable frames, skips zero-sized frames, resumes and delivers one result", async (t) => {
  const f = fixture(t);
  f.start();
  await flush();
  t.mock.timers.tick(150);
  assert.equal(f.reader.decode.mock.callCount(), 0);
  f.ready();
  t.mock.timers.tick(150);
  assert.equal(f.reader.decode.mock.callCount(), 1);
  f.video.videoWidth = 0;
  t.mock.timers.tick(150);
  assert.equal(f.reader.decode.mock.callCount(), 1);
  f.ready();
  f.reader.decode.mock.mockImplementation(() => ({ getText: () => "5941234567890" }));
  t.mock.timers.tick(150);
  t.mock.timers.tick(1000);
  assert.equal(f.success.mock.callCount(), 1);
  assert.equal(f.success.mock.calls[0].arguments[0], "5941234567890");
  assert.equal(f.video.srcObject, null);
  assert.equal(f.track.stop.mock.callCount(), 1);
  assert.equal(f.error.mock.callCount(), 0);
});

test("retries transient canvas and barcode errors and recreates canvas on resize", async (t) => {
  const errors = [new DOMException("zero width", "IndexSizeError"), new NotFoundException(), new ChecksumException(), new FormatException()];
  const f = fixture(t, () => { throw errors.shift() ?? new NotFoundException(); });
  f.ready();
  f.start();
  await flush();
  for (let i = 0; i < 3; i++) t.mock.timers.tick(150);
  const resets = f.reader.reset.mock.callCount();
  f.video.videoWidth = 1280;
  t.mock.timers.tick(150);
  assert.equal(f.reader.reset.mock.callCount(), resets + 1);
  assert.equal(f.reader.decode.mock.callCount(), 5);
  assert.equal(f.error.mock.callCount(), 0);
});

test("closing during camera permission stops the late stream without touching a new session", async (t) => {
  const f = fixture(t);
  let resolve;
  const stop = f.start(() => new Promise((done) => { resolve = done; }));
  stop();
  const newerStream = {};
  f.video.srcObject = newerStream;
  resolve(f.stream);
  await flush();
  assert.equal(f.track.stop.mock.callCount(), 1);
  assert.equal(f.video.srcObject, newerStream);
  assert.equal(f.reader.decode.mock.callCount(), 0);
  assert.equal(f.error.mock.callCount(), 0);
});

test("closing during playback prevents decoding and ignores late play rejection", async (t) => {
  const f = fixture(t);
  let reject;
  f.video.play = () => new Promise((_, fail) => { reject = fail; });
  const stop = f.start();
  await flush();
  stop();
  reject(new DOMException("closed", "AbortError"));
  await flush();
  assert.equal(f.reader.decode.mock.callCount(), 0);
  assert.equal(f.error.mock.callCount(), 0);
  assert.equal(f.video.srcObject, null);
});

test("permission and unexpected decoding failures are reported", async (t) => {
  const f = fixture(t, () => { throw new Error("decoder failed"); });
  f.ready();
  f.start();
  await flush();
  assert.equal(f.error.mock.callCount(), 1);
  assert.equal(f.video.srcObject, null);
  assert.equal(f.track.stop.mock.callCount(), 1);
  f.start(async () => { throw new DOMException("denied", "NotAllowedError"); });
  await flush();
  assert.equal(f.error.mock.callCount(), 2);
});
