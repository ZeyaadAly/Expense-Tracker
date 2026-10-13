import { pool } from "./pool.js";

export async function isDatabaseReachable(): Promise<boolean> {
  try {
    const result = await pool.query<{ role: string }>("SELECT current_user AS role");
    return result.rows[0]?.role === "expense_tracker_app";
  } catch {
    return false;
  }
}
