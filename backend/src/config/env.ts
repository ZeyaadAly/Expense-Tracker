import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function webOrigin(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  const localHttp = url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (
    !(url.protocol === "https:" || localHttp) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an HTTPS origin (or local HTTP origin)`);
  }

  return url.origin;
}

function port(value: string): number {
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  return parsed;
}

function databaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!(["postgres:", "postgresql:"].includes(url.protocol) && url.hostname && url.pathname !== "/")) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  return value;
}

function ownerUserId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("APP_OWNER_USER_ID must be a UUID");
  }
  return value.toLowerCase();
}

export const env = Object.freeze({
  port: port(optional("PORT") ?? "4000"),
  clientOrigin: webOrigin("CLIENT_ORIGIN", optional("CLIENT_ORIGIN") ?? "http://localhost:3000"),
  supabaseUrl: webOrigin("SUPABASE_URL", required("SUPABASE_URL")),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
  databaseUrl: databaseUrl(optional("DATABASE_URL")),
  appOwnerUserId: ownerUserId(optional("APP_OWNER_USER_ID")),
});
