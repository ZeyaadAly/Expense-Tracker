export function readAuthConfig(value: string | undefined, production = process.env.NODE_ENV === "production") {
  const invalid = () => new Error("SUPABASE_URL must be a valid hosted HTTPS origin or a development loopback HTTP origin");
  if (!value?.trim()) throw new Error("SUPABASE_URL is required for V2 authentication");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw invalid(); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback && !production)) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash || /\s|\\/.test(value.trim()) ||
    /YOUR_|PLACEHOLDER/i.test(url.hostname)) throw invalid();
  const issuer = `${url.origin}/auth/v1`;
  return Object.freeze({ issuer, jwksUrl: new URL(`${issuer}/.well-known/jwks.json`), audience: "authenticated", algorithm: "ES256" });
}
