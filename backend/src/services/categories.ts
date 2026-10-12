import type { Pool } from "pg";
import type { CategoryFilters, CategoryResource } from "../types/category.js";

export function createCategoryService(database: Pick<Pool, "query">) {
  return {
    async list(userId: string, filters: CategoryFilters): Promise<CategoryResource[]> {
      const result = await database.query<CategoryResource>(
        `SELECT id, name, kind, icon, color, status, is_system AS "isSystem"
         FROM expense_tracker.categories
         WHERE (is_system = true OR user_id = $1) AND status = $2
           AND ($3::text IS NULL OR kind = $3 OR ($3 IN ('income', 'expense') AND kind = 'both'))
         ORDER BY is_system DESC, name COLLATE "C" ASC, id ASC`,
        [userId, filters.status, filters.kind ?? null],
      );
      return result.rows;
    },
  };
}
export type CategoryService = ReturnType<typeof createCategoryService>;
