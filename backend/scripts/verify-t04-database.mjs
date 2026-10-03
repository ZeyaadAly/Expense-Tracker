import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "pg";

// Writes are restricted to an explicitly supplied disposable loopback database.
const url = new URL(process.env.DISPOSABLE_DATABASE_URL || "");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
const client = new Client({ connectionString: url.toString() });
await client.connect();
try {
  assert.equal((await client.query("SELECT to_regnamespace('expense_tracker') AS schema")).rows[0].schema, null);
  const root = new URL("../../supabase/", import.meta.url);
  for (const file of ["20261001144302_initial_expense_tracker_schema.sql", "20261003163341_backend_application_role.sql"]) {
    await client.query(readFileSync(new URL(`migrations/${file}`, root), "utf8"));
  }
  const seed = readFileSync(new URL("seed.sql", root), "utf8");
  await client.query(seed);
  await client.query(seed);
  const totals = (await client.query(`SELECT count(*)::int AS count,
    sum(amount) FILTER (WHERE type='income')::text AS income,
    sum(amount) FILTER (WHERE type='expense')::text AS expenses,
    (sum(CASE WHEN type='income' THEN amount ELSE -amount END))::text AS balance
    FROM expense_tracker.transactions`)).rows[0];
  assert.deepEqual(totals, { count: 3, income: "1000.00", expenses: "296.25", balance: "703.75" });
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE expense_tracker_app");
  const insert = `INSERT INTO expense_tracker.transactions
    (id,type,amount,description,category,transaction_date)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`;
  const id = "b06de2ec-1669-42d8-8526-f4a3bca50c9c";
  const valid = [id, "expense", "0.10", "Test transaction", "food", "2026-09-30"];
  const created = (await client.query(insert, valid)).rows[0];
  assert.equal((await client.query("SELECT count(*)::int AS count FROM expense_tracker.transactions WHERE id=$1", [id])).rows[0].count, 1);
  const updated = (await client.query("UPDATE expense_tracker.transactions SET amount='0.20',created_at='2000-01-01',updated_at='2000-01-01' WHERE id=$1 RETURNING *", [id])).rows[0];
  assert.equal(updated.created_at.toISOString(), created.created_at.toISOString());
  assert.ok(updated.updated_at >= created.updated_at);
  assert.notEqual(updated.updated_at.getUTCFullYear(), 2000);
  await client.query("DELETE FROM expense_tracker.transactions WHERE id=$1", [id]);
  async function rejects(query, values, code) {
    await client.query("SAVEPOINT invalid_case");
    await assert.rejects(client.query(query, values), (error) => error.code === code);
    await client.query("ROLLBACK TO SAVEPOINT invalid_case");
  }
  for (const amount of ["0", "-1", "1000000000", "1.234", "NaN", "Infinity"]) {
    await rejects(insert, valid.map((v, i) => i === 2 ? amount : v), "23514");
  }
  for (const [index, value] of [[1,"unknown"],[3,""],[3," padded "],[3,"a".repeat(201)],[4,"salary"],[5,"1899-12-31"],[5,"2999-01-01"]]) {
    await rejects(insert, valid.map((v, i) => i === index ? value : v), "23514");
  }
  await rejects(insert, valid.map((v,i)=>i===3?null:v), "23502");
  await rejects(insert, valid.map((v,i)=>i===5?"2026-02-30":v), "22008");
  await rejects("UPDATE expense_tracker.transactions SET id=$1 WHERE id=$2", [id,"bb664829-eddd-4a27-bddc-076e8c3bf6fe"], "23514");
  await rejects("CREATE TABLE expense_tracker.forbidden(id int)", [], "42501");
  await rejects("TRUNCATE expense_tracker.transactions", [], "42501");
  await client.query(insert, valid);
  await client.query(insert, ["582682be-9dcc-4ae1-a47b-815e386c067e", "expense", "0.20", "Exact money", "food", "2026-09-30"]);
  assert.equal((await client.query("SELECT sum(amount)::text AS total FROM expense_tracker.transactions WHERE description IN ('Test transaction','Exact money')")).rows[0].total,"0.30");
  await client.query("ROLLBACK");
  console.log(JSON.stringify({cleanMigrations:true,repeatableSeed:totals,limitedRoleCRUD:true,constraints:true,timestamps:true,exactMoney:true,deniedDDL:true}));
} finally { await client.end(); }
