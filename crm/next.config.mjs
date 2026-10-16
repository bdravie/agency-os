import path from "node:path";
import { fileURLToPath } from "node:url";

// The single .env lives in the repo root. In Codespaces the values come from secrets instead.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));   // never overrides a variable that already exists...
} catch {}
try {
  // ...even an empty one (Codespaces creates empty variables for declared secrets that aren't set), so fill those in from the file.
  const { readFileSync } = await import("node:fs");
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    const value = m[2].replace(/^(["'])(.*)\1$/, "$2");
    if (value && !process.env[m[1]]) process.env[m[1]] = value;
  }
} catch {}

// GitHub Codespaces proxies the app through *.app.github.dev, so server actions must accept it.
// Only active inside a Codespace; locally the default same-origin check applies.
const inCodespace = process.env.CODESPACES === "true";
const allowedOrigins = [];
if (inCodespace) {
  allowedOrigins.push("*.app.github.dev", "*.preview.app.github.dev", "localhost:3000", "127.0.0.1:3000");
  const { CODESPACE_NAME: name, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: domain } = process.env;
  if (name) allowedOrigins.push(`${name}-3000.${domain || "app.github.dev"}`);   // this Codespace's own address, exactly
}

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  experimental: {
    serverActions: {
      bodySizeLimit: "17mb", // uploads: transcripts (2 MB) and training files (up to 5 files of 3 MB); the app enforces its own limits
      allowedOrigins,
    },
  },
};
