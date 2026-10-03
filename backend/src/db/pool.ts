import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { env } from "../config/env.js";

// TLS options belong here: URL SSL parameters can override pg's ssl object.
const databaseUrl = new URL(env.databaseUrl);
for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) {
  if (databaseUrl.searchParams.has(key)) {
    throw new Error("Configure database TLS using DATABASE_SSL_CA_FILE, not URL SSL parameters");
  }
}

// One pool is shared by all database operations in this Express process.
export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: {
    rejectUnauthorized: true,
    ...(env.databaseSslCaFile
      ? { ca: readFileSync(env.databaseSslCaFile, "utf8") }
      : {}),
  },
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

pool.on("error", () => {
  console.error("Unexpected idle PostgreSQL client error");
});
