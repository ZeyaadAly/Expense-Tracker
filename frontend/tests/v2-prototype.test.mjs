import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString("base64")}`;
const moneyUrl = moduleUrl(
  readFileSync(new URL("../src/features/v2/money.ts", import.meta.url), "utf8"),
);
const money = await import(moneyUrl);
const periods = await import(
  moduleUrl(
    readFileSync(
      new URL("../src/features/v2/periods.ts", import.meta.url),
      "utf8",
    ).replace('"./money"', JSON.stringify(moneyUrl)),
  )
);
const fixtures = await import(
  moduleUrl(
    readFileSync(
      new URL("../src/features/v2/fixtures/index.ts", import.meta.url),
      "utf8",
    ).replace('"../money"', JSON.stringify(moneyUrl)),
  )
);
test("V2 fixture money stays exact at maximum values and repeated cent additions", () => {
  assert.equal(money.decimal(money.cents("999999999.99")), "999999999.99");
  assert.equal(
    money.decimal(money.cents("0.10") + money.cents("0.20")),
    "0.30",
  );
  assert.equal(money.decimal(money.cents("-150.00")), "-150.00");
  assert.equal(money.percent("31500.00", "30000.00"), "105.00");
});
test("V2 prototype rejects ambiguous amounts and negative zero", () => {
  for (const value of [
    "01",
    "1e3",
    " 1",
    "1,000",
    "1.001",
    "1000000000",
    "-1",
    "0",
  ])
    assert.equal(money.validMoney(value), false, value);
  assert.equal(money.validMoney("-0.00", true, true), false);
  assert.equal(money.validMoney("-999999999.99", true, true), true);
  assert.equal(money.validMoney("0.00", false, true), true);
});
test("V2 October ledger reconciles dashboard and category budget fixtures", () => {
  const rows = periods.periodRows(fixtures.transactions, {
    from: "2026-10-01",
    to: "2026-10-06",
  });
  assert.deepEqual(periods.totals(rows), {
    income: "20000.00",
    expense: "11900.00",
    savings: "8100.00",
  });
  for (const budget of fixtures.budgets)
    assert.equal(
      periods.totals(rows.filter((row) => row.category === budget.name))
        .expense,
      budget.spent,
    );
  assert.equal(fixtures.transfers.length, 1); // transfers never enter actual totals
});
test("V2 custom periods include date boundaries and exclude other records", () => {
  const bounds = periods.periodBounds("Custom", {
    from: "2026-10-03",
    to: "2026-10-03",
  });
  assert(
    periods
      .periodRows(fixtures.transactions, bounds)
      .every((row) => row.date === "2026-10-03"),
  );
  assert.deepEqual(
    periods.totals(
      periods.periodRows(fixtures.transactions, {
        from: "2027-01-01",
        to: "2027-01-31",
      }),
    ),
    { income: "0.00", expense: "0.00", savings: "0.00" },
  );
});
test("V2 fixture opening balances reconcile assets and debt with all posted history", () => {
  for (const account of fixtures.accounts) {
    const activity = fixtures.transactions
      .filter((t) => t.account === account.name)
      .reduce(
        (sum, t) =>
          sum +
          money.cents(t.amount) *
            (t.type === "income" ? BigInt(1) : -BigInt(1)),
        BigInt(0),
      );
    const transfers = fixtures.transfers.reduce(
      (sum, t) =>
        sum +
        (t.destination === account.name ? money.cents(t.amount) : BigInt(0)) -
        (t.source === account.name ? money.cents(t.amount) : BigInt(0)),
      BigInt(0),
    );
    assert.equal(
      money.decimal(
        money.cents(fixtures.openingBalances[account.id]) +
          (activity + transfers) *
            (account.type === "credit_card" ? -BigInt(1) : BigInt(1)),
      ),
      account.balance,
    );
  }
});
