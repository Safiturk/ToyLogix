import test from "node:test";
import assert from "node:assert/strict";
import {
  accountDestination,
  parseAuthLink,
  isRecoveryLink,
} from "../lib/security-rules.ts";
import { createAuthHandler } from "../lib/auth-handler.ts";

test("approval, role and deactivation have distinct destinations", () => {
  assert.equal(
    accountDestination({ rol: "admin", status: "pending" }),
    "/login",
  );
  assert.equal(accountDestination(null), "/login");
  assert.equal(
    accountDestination({ rol: "admin", status: "approved" }),
    "/account/security",
  );
  assert.equal(
    accountDestination({ rol: "admin", status: "approved" }, true),
    "/admin",
  );
  assert.equal(
    accountDestination({ rol: "user", status: "approved" }),
    "/store",
  );
  assert.equal(
    accountDestination({ rol: "user", status: "pending" }),
    "/account",
  );
  assert.equal(
    accountDestination({ rol: "admin", status: "rejected" }, true),
    "/login",
  );
  assert.equal(
    accountDestination(
      { rol: "admin", status: "approved", is_active: false },
      true,
    ),
    "/login",
  );
});

test("password recovery rejects stale sessions, reused/expired links and old recovery proofs", () => {
  const fresh = parseAuthLink(
    "https://toylogix.eu/update-password#type=recovery&access_token=a&refresh_token=b",
  );
  assert.ok(
    isRecoveryLink(fresh, [{ method: "recovery", timestamp: 9900 }], 10000),
  );
  assert.equal(
    isRecoveryLink(fresh, [{ method: "password", timestamp: 9900 }], 10000),
    false,
  );
  assert.equal(
    isRecoveryLink(fresh, [{ method: "recovery", timestamp: 100 }], 10000),
    false,
  );
  for (const url of [
    "https://toylogix.eu/update-password",
    "https://toylogix.eu/update-password#error_code=otp_expired",
    "https://toylogix.eu/update-password?error=access_denied",
    "https://toylogix.eu/update-password#type=signup&access_token=a&refresh_token=b",
  ])
    assert.equal(
      isRecoveryLink(
        parseAuthLink(url),
        [{ method: "recovery", timestamp: 9900 }],
        10000,
      ),
      false,
    );
});

const req = (body, headers = {}) =>
  new Request("https://toylogix.eu/api/auth/login", {
    method: "POST",
    headers: {
      origin: "https://toylogix.eu",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
const backend = (changes = {}) => ({
  limit: async () => ({ allowed: true, retryAfter: 0 }),
  login: async () => ({
    session: { access_token: "access", refresh_token: "refresh" },
    profile: { rol: "user", status: "approved" },
  }),
  signup: async () => {},
  reset: async () => {},
  ...changes,
});
const options = { siteUrl: "https://toylogix.eu", netlify: true };

test("endpoint rate limits IP and normalized email before authentication and sends Retry-After", async () => {
  const keys = [];
  let invoked = false;
  const handler = createAuthHandler(
    "login",
    backend({
      limit: async (key) => {
        keys.push(key);
        return { allowed: !key.includes(":email:"), retryAfter: 42 };
      },
      login: async () => {
        invoked = true;
      },
    }),
    options,
  );
  const response = await handler(
    req(
      { email: " TEST@EXAMPLE.COM ", password: "secret" },
      { "x-forwarded-for": "spoofed" },
    ),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "42");
  assert.deepEqual(keys, ["login:ip:unknown", "login:email:test@example.com"]);
  assert.equal(invoked, false);
});

test("endpoints fail closed and never fall back to a process-local limiter", async () => {
  const handler = createAuthHandler(
    "login",
    backend({
      limit: async () => {
        throw new Error("DB unavailable");
      },
    }),
    options,
  );
  assert.equal(
    (await handler(req({ email: "test@example.com", password: "secret" })))
      .status,
    503,
  );
  assert.equal(
    (await handler(req({}, { origin: "https://evil.invalid" }))).status,
    403,
  );
  assert.equal((await handler(req({ input: "x".repeat(9000) }))).status, 413);
});

test("blocked login never returns tokens and admin login requires MFA", async () => {
  for (const status of ["rejected", "unknown"]) {
    const response = await createAuthHandler(
      "login",
      backend({
        login: async () => ({
          session: { access_token: "private" },
          profile: { rol: "admin", status },
        }),
      }),
      options,
    )(req({ email: "test@example.com", password: "secret" }));
    assert.equal(response.status, 403);
    assert.equal((await response.text()).includes("private"), false);
  }
  const response = await createAuthHandler(
    "login",
    backend({
      login: async () => ({
        session: { access_token: "a", refresh_token: "r" },
        profile: { rol: "admin", status: "approved" },
      }),
    }),
    options,
  )(req({ email: "test@example.com", password: "secret" }));
  assert.equal((await response.json()).destination, "/account/security");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("registration and reset redirects cannot be controlled by input", async () => {
  const calls = [];
  const adapter = backend({
    signup: async (...args) => calls.push(args),
    reset: async (...args) => calls.push(args),
  });
  const signup = createAuthHandler("signup", adapter, options);
  assert.equal(
    (
      await signup(
        req({
          email: "test@example.com",
          password: "Strong123!",
          name: "Partner",
          phone: "0712345678",
          rol: "admin",
          redirect: "https://evil.invalid",
        }),
      )
    ).status,
    200,
  );
  assert.equal(calls[0][3], "https://toylogix.eu/email-confirmed");
  assert.equal(calls[0][2].rol, undefined);
  await createAuthHandler(
    "reset",
    adapter,
    options,
  )(req({ email: "test@example.com", redirect: "https://evil.invalid" }));
  assert.equal(calls[1][1], "https://toylogix.eu/update-password");
});
