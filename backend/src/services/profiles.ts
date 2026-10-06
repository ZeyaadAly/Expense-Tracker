import type { Pool } from "pg";
import type { ProfileInput, ProfileResource } from "../types/profile.js";
import { ApiError } from "../utils/api-error.js";

type ProfileRow = Omit<ProfileResource, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date };
const columns = `user_id AS "userId", display_name AS "displayName", preferred_currency AS "preferredCurrency",
  locale, timezone, created_at AS "createdAt", updated_at AS "updatedAt"`;
const map = (row: ProfileRow): ProfileResource => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
const missing = () => new ApiError(409, "PROFILE_REQUIRED", "Prepare your profile to continue.");

export function createProfileService(database: Pick<Pool, "query">) {
  async function get(userId: string): Promise<ProfileResource> {
    const result = await database.query<ProfileRow>(`SELECT ${columns} FROM expense_tracker.profiles WHERE user_id = $1`, [userId]);
    if (!result.rows[0]) throw missing();
    return map(result.rows[0]);
  }
  return {
    get,
    async ensureProfile(userId: string): Promise<ProfileResource> {
      // Separate SELECT gets a fresh READ COMMITTED snapshot after a concurrent
      // INSERT wins. A single insert/select CTE can miss that just-committed row.
      await database.query(`INSERT INTO expense_tracker.profiles (user_id, display_name, preferred_currency, locale, timezone)
        VALUES ($1, NULL, 'EGP', 'en', 'Africa/Cairo') ON CONFLICT (user_id) DO NOTHING`, [userId]);
      return get(userId);
    },
    async update(userId: string, input: ProfileInput): Promise<ProfileResource> {
      const result = await database.query<ProfileRow>(`UPDATE expense_tracker.profiles SET display_name = $2
        WHERE user_id = $1 AND display_name IS DISTINCT FROM $2 RETURNING ${columns}`, [userId, input.displayName]);
      return result.rows[0] ? map(result.rows[0]) : get(userId);
    },
  };
}
export type ProfileService = ReturnType<typeof createProfileService>;
