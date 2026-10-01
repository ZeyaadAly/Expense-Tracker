import { Pool } from "pg";
import { env } from "../config/env.js";

// One pool is shared by all database operations in this Express process.
export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

pool.on("error", () => {
  console.error("Unexpected idle PostgreSQL client error");
});
