import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
const require = createRequire(import.meta.url);
const urls = { "@supabase/supabase-js": pathToFileURL(require.resolve("@supabase/supabase-js")).href };
async function load(name) {
  let source = readFileSync(new URL(`../src/lib/auth/${name}.ts`, import.meta.url), "utf8");
  for (const [specifier, url] of Object.entries(urls)) source = source.replaceAll(`"${specifier}"`, JSON.stringify(url));
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  urls[`./${name}`] = url;
  return import(url);
}
const errors = await load("errors");
const client = await load("supabase-client");
const { createAuthService, authRedirect } = await load("auth-service");
const config = { url: "https://test.supabase.co", key: "sb_publishable_fixture" };
test("official SDK restores its persisted session across client recreation", async () => {
  const saved = new Map(); const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  const session = { access_token: "fixture-token", refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 900, expires_at: Math.floor(Date.now() / 1000) + 900, user: { id: "fixture", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() } };
  storage.setItem("t06-fixture", JSON.stringify(session));
  for (let i = 0; i < 2; i++) {
    const sdk = createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "t06-fixture", storage }, global: { fetch: async () => { throw new Error("Unexpected network request"); } } });
    const service = createAuthService(() => sdk);
    assert.equal((await service.getAccessToken()).data, session.access_token);
    assert.equal((await service.getSession()).data.user.id, "fixture");
    sdk.auth.stopAutoRefresh();
  }
});
function harness() {
  const calls = []; let session = null; let callback; let unsubscribed = false;
  const auth = {
    signUp: async (...args) => { calls.push(["signup", ...args]); return { data: { user: { id: "fixture" }, session: null }, error: null }; },
    signInWithPassword: async (...args) => { calls.push(["signin", ...args]); session = { access_token: "fixture-token" }; callback?.("SIGNED_IN", session); return { data: { session, user: { id: "fixture" } }, error: null }; },
    signOut: async (...args) => { calls.push(["signout", ...args]); session = null; callback?.("SIGNED_OUT", null); return { error: null }; },
    resetPasswordForEmail: async (...args) => { calls.push(["reset", ...args]); return { data: {}, error: null }; },
    updateUser: async (...args) => { calls.push(["update", ...args]); return { data: { user: { id: "fixture" } }, error: null }; },
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user: session ? { id: "fixture" } : null }, error: null }),
    onAuthStateChange: (cb) => { callback = cb; return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } }; },
  };
  return { auth, calls, service: createAuthService(() => ({ auth }), () => "http://localhost:3000"), emit: (...args) => callback(...args), get unsubscribed() { return unsubscribed; } };
}
test("config rejects missing values, credentials, placeholders and private/legacy keys", () => {
  assert.deepEqual(client.validateAuthConfig(config.url, config.key), config);
  for (const [url, key] of [[undefined, config.key], [config.url, undefined], ["https://YOUR_PROJECT_REF.supabase.co", config.key], ["http://test.supabase.co", config.key], ["https://user:password@test.supabase.co", config.key], ["https://test.supabase.co/path", config.key], [config.url, "sb_secret_fixture"], [config.url, "eyJfixture"]]) assert.throws(() => client.validateAuthConfig(url, key), errors.AuthConfigurationError);
});
test("client is lazy, singleton, browser-only and uses provider session options", () => {
  let initialized = 0; let options;
  const value = {};
  const get = client.createBrowserClientGetter(() => config, () => true, (url, key, opts) => { initialized++; options = opts; assert.equal(url, config.url); assert.equal(key, config.key); return value; });
  assert.equal(initialized, 0); assert.equal(get(), value); assert.equal(get(), value); assert.equal(initialized, 1);
  assert.deepEqual(options.auth, { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" });
  assert.throws(client.createBrowserClientGetter(() => config, () => false), errors.AuthConfigurationError);
});
test("signup honors confirmation and does not provision profiles or metadata", async () => {
  const h = harness(); const result = await h.service.signUpWithEmail("fixture@example.invalid", "fixture-password");
  assert.equal(result.data.confirmationRequired, true); assert.equal(result.data.session, null);
  assert.deepEqual(h.calls[0], ["signup", { email: "fixture@example.invalid", password: "fixture-password", options: { emailRedirectTo: "http://localhost:3000/v2/login" } }]);
});
test("signin, user/session/token reads and local signout follow provider state", async () => {
  const h = harness(); assert.equal((await h.service.getSession()).data, null); assert.equal((await h.service.getAccessToken()).data, null);
  await h.service.signInWithEmail("fixture@example.invalid", "fixture-password");
  assert.deepEqual(h.calls[0], ["signin", { email: "fixture@example.invalid", password: "fixture-password" }]);
  assert.ok((await h.service.getSession()).data); assert.ok((await h.service.getUser()).data); assert.equal((await h.service.getAccessToken()).data, "fixture-token");
  await h.service.signOut(); assert.deepEqual(h.calls[1], ["signout", { scope: "local" }]); assert.equal((await h.service.getSession()).data, null);
});
test("reset redirects are exact and password update uses active provider context", async () => {
  const h = harness(); await h.service.requestPasswordReset("fixture@example.invalid"); await h.service.updatePassword("new-fixture-password");
  assert.deepEqual(h.calls, [["reset", "fixture@example.invalid", { redirectTo: "http://localhost:3000/v2/reset-password" }], ["update", { password: "new-fixture-password" }]]);
  assert.equal(authRedirect("https://expensetracker-inky-mu.vercel.app", "/v2/reset-password"), "https://expensetracker-inky-mu.vercel.app/v2/reset-password");
  for (const origin of ["https://evil.invalid", "http://localhost:3000.evil.invalid", "https://preview.vercel.app"]) assert.throws(() => authRedirect(origin, "/v2/login"));
});
test("subscription delivers all events outside lock and cancels queued callbacks", async () => {
  const h = harness(); const events = []; const result = h.service.subscribe((event, session) => events.push([event, session]));
  for (const event of ["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "PASSWORD_RECOVERY", "SIGNED_OUT"]) h.emit(event, null);
  assert.equal(events.length, 0); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(events.length, 5);
  h.emit("SIGNED_IN", null); result.data(); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(events.length, 5); assert.equal(h.unsubscribed, true);
});
test("provider errors are normalized and raw messages never escape", async () => {
  for (const [code, expected] of [["invalid_credentials", "invalid_credentials"], ["email_exists", "email_registered"], ["weak_password", "weak_password"], ["email_not_confirmed", "confirmation_required"], ["otp_expired", "invalid_recovery"], ["unknown", "unexpected"]]) {
    const result = errors.normalizeAuthError({ code, message: "private-provider-detail", stack: "private-stack" }); assert.equal(result.code, expected); assert.ok(!JSON.stringify(result).includes("private"));
  }
  assert.equal(errors.normalizeAuthError(new TypeError("fetch failed")).code, "network"); assert.equal(errors.normalizeAuthError({ status: 429 }).code, "rate_limited");
  const h = harness(); h.auth.updateUser = async () => ({ data: null, error: { code: "session_not_found" } }); assert.equal((await h.service.updatePassword("fixture")).error.code, "invalid_recovery");
});
test("missing config and rejected provider requests fail as typed results", async () => {
  const service = createAuthService(() => { throw new errors.AuthConfigurationError(); });
  assert.equal((await service.getSession()).error.code, "configuration"); assert.equal(service.subscribe(() => {}).error.code, "configuration");
  const h = harness(); h.auth.getSession = async () => { throw new TypeError("private network detail"); }; assert.equal((await h.service.getAccessToken()).error.code, "network");
});
