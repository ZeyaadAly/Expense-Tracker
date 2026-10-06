import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/features/v2/auth-form.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { validateAuthForm, createAuthFormSubmitter } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const values = { name: "Test Name", email: "fixture@example.invalid", password: "fixture-password", confirm: "fixture-password" };
function harness() {
  const calls = []; const service = {};
  for (const name of ["signInWithEmail", "signUpWithEmail", "requestPasswordReset", "updatePassword"]) service[name] = async (...args) => { calls.push([name, ...args]); return { data: { session: name === "signInWithEmail" ? {} : null }, error: null }; };
  return { service, calls, submit: createAuthFormSubmitter(service) };
}
test("T07 login validates before provider and accepts existing short passwords", async () => {
  const h = harness(); assert.equal((await h.submit("login", { email: "bad", password: "" })).kind, "invalid"); assert.equal(h.calls.length, 0);
  assert.equal((await h.submit("login", { ...values, password: "short" })).redirect, true);
  assert.deepEqual(h.calls[0], ["signInWithEmail", values.email, "short"]);
});
test("T07 login rejection and missing-session success never redirect", async () => {
  const h = harness(); h.service.signInWithEmail = async () => ({ data: null, error: { code: "invalid_credentials", message: "Email or password is incorrect." } });
  assert.equal((await h.submit("login", values)).kind, "error"); h.service.signInWithEmail = async () => ({ data: { session: null }, error: null }); assert.equal((await h.submit("login", values)).kind, "error");
});
test("T07 duplicate mutation is ignored while first request is pending", async () => {
  const h = harness(); let finish; let calls = 0;
  h.service.signInWithEmail = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const first = h.submit("login", values); assert.equal((await h.submit("login", values)).kind, "ignored"); assert.equal(calls, 1);
  finish({ data: { session: {} }, error: null }); assert.equal((await first).redirect, true);
});
test("T07 registration rejects mismatch and weak password then returns confirmation success", async () => {
  const h = harness(); assert.equal((await h.submit("register", { ...values, confirm: "different" })).kind, "invalid"); assert.equal(h.calls.length, 0);
  assert.ok(validateAuthForm("register", { ...values, password: "weak", confirm: "weak" }).password);
  assert.deepEqual(await h.submit("register", values), { kind: "success", redirect: false }); assert.deepEqual(h.calls[0], ["signUpWithEmail", values.email, values.password]);
});
test("T07 registration provider errors remain safe typed failures", async () => {
  const h = harness(); h.service.signUpWithEmail = async () => ({ data: null, error: { code: "email_registered", message: "Already registered", field: "email" } }); assert.equal((await h.submit("register", values)).error.field, "email");
});
test("T07 recovery request validates email, stays neutral and propagates safe failures", async () => {
  const h = harness(); assert.equal((await h.submit("forgot-password", { email: "bad" })).kind, "invalid"); assert.equal(h.calls.length, 0);
  assert.deepEqual(await h.submit("forgot-password", values), { kind: "success", redirect: false }); assert.deepEqual(h.calls[0], ["requestPasswordReset", values.email]);
  h.service.requestPasswordReset = async () => ({ data: null, error: { code: "network", message: "Try again" } }); assert.equal((await h.submit("forgot-password", values)).error.code, "network");
});
test("T07 reset requires recovery context and matching passwords before update", async () => {
  const h = harness(); assert.equal((await h.submit("reset-password", values)).error.code, "invalid_recovery"); assert.equal(h.calls.length, 0);
  assert.equal((await h.submit("reset-password", { ...values, confirm: "different" }, true)).kind, "invalid"); assert.equal(h.calls.length, 0);
  assert.deepEqual(await h.submit("reset-password", values, true), { kind: "success", redirect: false }); assert.deepEqual(h.calls[0], ["updatePassword", values.password]);
});
test("T07 expired recovery is rejected and subsequent request can be attempted", async () => {
  const h = harness(); h.service.updatePassword = async () => ({ data: null, error: { code: "invalid_recovery", message: "Request another link" } }); assert.equal((await h.submit("reset-password", values, true)).error.code, "invalid_recovery"); assert.equal((await h.submit("reset-password", values, true)).kind, "error");
});
