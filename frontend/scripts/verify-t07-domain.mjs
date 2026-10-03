// Contract edge cases for the fixture UI's money/date/field helpers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/transactions.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } });
const { formatMoney, displayDate, isCalendarDate, validateTransaction, normalizeAmount } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const valid = { type: "expense", amount: "0.01", category: "food", date: "2026-10-03", description: "Sample" };
const errors = (overrides) => validateTransaction({ ...valid, ...overrides }, "2026-10-03");

for (const amount of ["0.01", "10", "10.5", "10.50", "999999999.99"]) assert.equal(errors({ amount }).amount, undefined);
for (const amount of ["0", "0.00", "-1", "1.234", "010", "1e3", "1,000", " 10", "10 ", "999999999.999", "1000000000", "EGP 10", "NaN", "Infinity", ""]) assert.ok(errors({ amount }).amount, amount);
assert.equal(normalizeAmount("10.5"), "10.50");
assert.equal(formatMoney("999999999999999999999.99"), "999,999,999,999,999,999,999.99");
assert.equal(formatMoney("-150.50"), "−150.50");
assert.equal(formatMoney("0.00"), "0.00");
assert.equal(displayDate("2026-09-30"), "30/09/2026");
for (const date of ["2024-02-29", "2000-02-29", "1900-01-01", "2026-10-03"]) assert.equal(isCalendarDate(date), true);
for (const date of ["1900-02-29", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-10-00", "2026-1-1"]) assert.equal(isCalendarDate(date), false);
assert.ok(errors({ date: "2026-10-04" }).date);
assert.ok(errors({ date: "1899-12-31" }).date);
assert.equal(errors({ description: "😀".repeat(200) }).description, undefined);
assert.ok(errors({ description: "😀".repeat(201) }).description);
assert.ok(errors({ description: "   " }).description);
assert.equal(errors({ description: "  Sample  " }).description, undefined);
assert.ok(errors({ type: "income", category: "food" }).category);
assert.equal(errors({ type: "income", category: "other" }).category, undefined);
console.log("PASS amount syntax/range, exact formatting, calendar boundaries, Unicode length, and category/type validation.");
