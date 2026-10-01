import "dotenv/config";

function readPort(value: string | undefined): number {
  const text = value?.trim() || "4000";
  const port = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  return port;
}

function readClientOrigin(value: string | undefined): string {
  const text = value?.trim() || "http://localhost:3000";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("CLIENT_ORIGIN must be a valid HTTP or HTTPS origin");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("CLIENT_ORIGIN must be a valid HTTP or HTTPS origin");
  }
  return url.origin;
}

function readDatabaseUrl(value: string | undefined): string {
  const text = value?.trim();
  if (!text) {
    throw new Error("DATABASE_URL is required");
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!(["postgres:", "postgresql:"].includes(url.protocol) && url.hostname && url.pathname !== "/")) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  return text;
}

export const env = Object.freeze({
  port: readPort(process.env.PORT),
  clientOrigin: readClientOrigin(process.env.CLIENT_ORIGIN),
  databaseUrl: readDatabaseUrl(process.env.DATABASE_URL),
});
