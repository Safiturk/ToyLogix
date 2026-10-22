import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function loadModule(path, dependencies) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

function accountFixture({ session = { user: { id: 'verified-id' }, access_token: 'token' }, user = { id: 'verified-id', email_confirmed_at: 'confirmed' }, profile = { auth_user_id: 'verified-id', status: 'approved' }, failure = null } = {}) {
  let releaseAuth;
  const authReady = new Promise((resolve) => { releaseAuth = resolve; });
  const calls = [];
  const query = {
    select() { return this; }, eq() { return this; },
    abortSignal(signal) { calls.push(signal); return this; },
    maybeSingle() { return this; },
    overrideTypes() { calls.push('profile'); return Promise.resolve({ data: profile, error: failure }); },
  };
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async (token) => { calls.push(token); await authReady; return { data: { user }, error: null }; },
    },
    from: () => query,
  };
  const { currentAccount } = loadModule('../lib/account.ts', {
    './supabase': { supabase }, './auth-rollout': { accountHardeningEnabled: false },
  });
  return { currentAccount, releaseAuth, calls, profile };
}

test('profile request starts before Auth completes, but access waits for verification', async () => {
  const f = accountFixture();
  const signal = new AbortController().signal;
  let resolved = false;
  const result = f.currentAccount(signal).then((value) => { resolved = true; return value; });
  await new Promise(setImmediate);
  assert.deepEqual(f.calls, [signal, 'token', 'profile']);
  assert.equal(resolved, false);
  f.releaseAuth();
  assert.deepEqual(await result, f.profile);
});

test('signed-out visitors do not make Auth or profile network requests', async () => {
  const f = accountFixture({ session: null });
  assert.equal(await f.currentAccount(), null);
  assert.deepEqual(f.calls, []);
});

for (const [name, options] of [
  ['unconfirmed email', { user: { id: 'verified-id' } }],
  ['forged stored identity', { user: { id: 'different', email_confirmed_at: 'confirmed' } }],
  ['mismatched profile', { profile: { auth_user_id: 'different' } }],
]) {
  test(`access rejects ${name}`, async () => {
    const f = accountFixture(options);
    f.releaseAuth();
    assert.equal(await f.currentAccount(), null);
  });
}

test('profile failures propagate instead of returning a stored account', async () => {
  const f = accountFixture({ failure: new Error('offline') });
  f.releaseAuth();
  await assert.rejects(f.currentAccount(), /offline/);
});

test('initial auth event does not duplicate access checks and sign-out invalidates pending work', async () => {
  let effect, authEvent, release;
  const pending = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const states = [], redirects = [];
  const previousWindow = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const { default: AccessGate } = loadModule('../app/components/AccessGate.tsx', {
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    react: { useState: (initial) => [initial, (value) => states.push(value)], useEffect: (fn) => { effect = fn; } },
    'next/navigation': { useRouter: () => ({ replace: (path) => redirects.push(path) }) },
    '@/lib/account': { currentAccount: () => { calls++; return pending; } },
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: (fn) => {
      authEvent = fn;
      return { data: { subscription: { unsubscribe() {} } } };
    } } } },
  });
  let cleanup;
  try {
    AccessGate({ children: null });
    cleanup = effect();
    authEvent('INITIAL_SESSION');
    await new Promise(setImmediate);
    assert.equal(calls, 1);
    authEvent('SIGNED_OUT');
    release({ status: 'approved', rol: 'user' });
    await new Promise(setImmediate);
    assert.deepEqual(redirects, ['/login']);
    assert.ok(!states.includes(true), 'stale response cannot grant access after sign-out');
  } finally {
    cleanup?.();
    globalThis.window = previousWindow;
  }
});

test('a stalled check leaves loading after 12 seconds and ignores late success', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let effect, release, signal;
  const pending = new Promise((resolve) => { release = resolve; });
  const states = [];
  const previousWindow = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const { default: AccessGate } = loadModule('../app/components/AccessGate.tsx', {
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    react: { useState: (initial) => [initial, (value) => states.push(value)], useEffect: (fn) => { effect = fn; } },
    'next/navigation': { useRouter: () => ({ replace() { assert.fail('timeout must not redirect'); } }) },
    '@/lib/account': { currentAccount: (value) => { signal = value; return pending; } },
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } },
  });
  let cleanup;
  try {
    AccessGate({ children: null });
    cleanup = effect();
    t.mock.timers.tick(12000);
    assert.equal(signal.aborted, true);
    assert.deepEqual(states, [false, true]);
    release({ status: 'approved', rol: 'user' });
    await new Promise(setImmediate);
    assert.deepEqual(states, [false, true], 'late response cannot reopen the gate');
  } finally {
    cleanup?.();
    globalThis.window = previousWindow;
  }
});
