import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Resolve from this module so both src/ and dist/ load backend/.env.
// Deployment environment variables retain precedence over the local file.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

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
  const invalidUrlMessage =
    "DATABASE_URL must be a valid PostgreSQL URL: postgres://USER:PASSWORD@HOST:PORT/DATABASE or postgresql://USER:PASSWORD@HOST:PORT/DATABASE. Percent-encode reserved password characters.";
  const text = value?.trim();
  if (!text) {
    throw new Error("DATABASE_URL is required");
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(invalidUrlMessage);
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname ||
    url.pathname === "/" ||
    url.hash ||
    /\s/.test(text) ||
    (url.port && (Number(url.port) < 1 || Number(url.port) > 65535))
  ) {
    throw new Error(invalidUrlMessage);
  }
  return text;
}

export const env = Object.freeze({
  port: readPort(process.env.PORT),
  clientOrigin: readClientOrigin(process.env.CLIENT_ORIGIN),
  databaseUrl: readDatabaseUrl(process.env.DATABASE_URL),
});
