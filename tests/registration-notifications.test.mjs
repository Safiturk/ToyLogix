import test from "node:test";
import assert from "node:assert/strict";
import { sendRegistrationNotification } from "../lib/registration-notifications.ts";
const item = { user_id: "test-user", email: "customer@example.com", name: "Customer", phone: "0700000000", company: "Business" };
const config = { apiKey: "re_test", from: "sender@example.com", to: "admin@example.com" };
test("notification uses server-owned recipients, text-only fields and stable idempotency key", async () => {
  await sendRegistrationNotification(item, config, async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.headers["Idempotency-Key"], "registration/test-user");
    const body = JSON.parse(options.body);
    assert.deepEqual(body.to, [config.to]);
    assert.equal(body.from, config.from);
    assert.equal(body.html, undefined);
    assert.ok(!options.body.includes("password"));
    return Response.json({ id: "accepted-id" });
  });
});
test("provider rejection and missing acknowledgement retain failure for retry", async () => {
  await assert.rejects(sendRegistrationNotification(item, config, async () => new Response("denied", { status: 429 })));
  await assert.rejects(sendRegistrationNotification(item, config, async () => Response.json({})));
});
