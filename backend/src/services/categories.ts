import type { Pool, PoolClient } from "pg";
import type { CategoryFilters, CategoryInput, CategoryResource } from "../types/category.js";
import { ApiError } from "../utils/api-error.js";

const projection = `id,name,kind,icon,color,status,is_system AS "isSystem"`;
const missing = () => new ApiError(404, "NOT_FOUND", "Category not found.");
const immutable = () => new ApiError(409, "CATEGORY_IMMUTABLE", "System categories cannot be changed.");
const kindConflict = () => new ApiError(409, "CATEGORY_KIND_LOCKED", "This category is in use. Its kind cannot be changed.");

export function createCategoryService(database: Pick<Pool, "query" | "connect">) {
  async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await database.connect();
    let discard = false;
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { discard = true; }
      const dbError = error as { code?: string; constraint?: string };
      if (dbError.code === "23505" && dbError.constraint === "categories_user_name_unique") throw new ApiError(409, "CONFLICT", "A category with this name already exists.");
      throw error;
    } finally { client.release(discard); }
  }
  async function read(client: Pick<Pool, "query">, userId: string, id: string): Promise<CategoryResource> {
    const row = (await client.query<CategoryResource>(`SELECT ${projection} FROM expense_tracker.categories WHERE id=$1 AND (is_system OR user_id=$2)`, [id, userId])).rows[0];
    if (!row) throw missing();
    return row;
  }
  async function lockCustom(client: PoolClient, userId: string, id: string): Promise<CategoryResource> {
    const row = (await client.query<CategoryResource>(`SELECT ${projection} FROM expense_tracker.categories WHERE id=$1 AND (is_system OR user_id=$2) FOR UPDATE`, [id, userId])).rows[0];
    if (!row) throw missing();
    if (row.isSystem) throw immutable();
    return row;
  }
  return {
    async list(userId: string, filters: CategoryFilters): Promise<CategoryResource[]> {
      const result = await database.query<CategoryResource>(
        `SELECT ${projection}
         FROM expense_tracker.categories
         WHERE (is_system = true OR user_id = $1) AND status = $2
           AND ($3::text IS NULL OR kind = $3 OR ($3 IN ('income', 'expense') AND kind = 'both'))
         ORDER BY is_system DESC, name COLLATE "C" ASC, id ASC`,
        [userId, filters.status, filters.kind ?? null],
      );
      return result.rows;
    },
    create: (userId: string, input: CategoryInput) => transaction(async client => {
      const row = (await client.query<{ id: string }>(`INSERT INTO expense_tracker.categories(user_id,name,kind,icon,color)
        VALUES($1,$2,$3,$4,$5) RETURNING id`, [userId, input.name, input.kind, input.icon, input.color])).rows[0];
      return read(client, userId, row.id);
    }),
    update: (userId: string, id: string, input: CategoryInput) => transaction(async client => {
      const current = await lockCustom(client, userId, id);
      if (current.kind !== input.kind) {
        const referenced = (await client.query<{ used: boolean }>(`SELECT
          EXISTS(SELECT 1 FROM expense_tracker.transactions WHERE category_id=$1) OR
          EXISTS(SELECT 1 FROM expense_tracker.recurring_transactions WHERE category_id=$1) OR
          EXISTS(SELECT 1 FROM expense_tracker.budgets WHERE category_id=$1) AS used`, [id])).rows[0].used;
        if (referenced) throw kindConflict();
      }
      await client.query(`UPDATE expense_tracker.categories SET name=$3,kind=$4,icon=$5,color=$6
        WHERE id=$1 AND user_id=$2
          AND (name,kind,icon,color) IS DISTINCT FROM ($3::varchar,$4::varchar,$5::varchar,$6::varchar)`,
      [id, userId, input.name, input.kind, input.icon, input.color]);
      return read(client, userId, id);
    }),
    archive: (userId: string, id: string) => transaction(async client => {
      const current = await lockCustom(client, userId, id);
      if (current.status === "archived") return { category: current, pausedRecurringCount: 0 };
      // Category lock precedes definition and occurrence locks, matching posting.
      const definitions = await client.query<{ status: string }>(`SELECT status FROM expense_tracker.recurring_transactions
        WHERE category_id=$1 AND user_id=$2 ORDER BY id FOR UPDATE`, [id, userId]);
      const pausedRecurringCount = definitions.rows.filter(row => row.status === "active").length;
      // The T15 trigger pauses active definitions in this transaction.
      await client.query("UPDATE expense_tracker.categories SET status='archived' WHERE id=$1 AND user_id=$2", [id, userId]);
      await client.query(`UPDATE expense_tracker.recurring_occurrences o SET status='skipped',processed_at=statement_timestamp(),failure_code=NULL
        WHERE o.user_id=$2 AND o.status IN ('pending','failed') AND o.generated_transaction_id IS NULL
        AND EXISTS (SELECT 1 FROM expense_tracker.recurring_transactions r
          WHERE r.id=o.recurring_transaction_id AND r.category_id=$1 AND r.user_id=$2)`, [id, userId]);
      return { category: await read(client, userId, id), pausedRecurringCount };
    }),
    restore: (userId: string, id: string) => transaction(async client => {
      const current = await lockCustom(client, userId, id);
      if (current.status === "active") return current;
      await client.query("UPDATE expense_tracker.categories SET status='active' WHERE id=$1 AND user_id=$2", [id, userId]);
      return read(client, userId, id);
    }),
  };
}
export type CategoryService = ReturnType<typeof createCategoryService>;
