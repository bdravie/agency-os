import path from "node:path";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants.js";
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

// The running CRM serves from .next, and replacing that folder while it runs breaks every open page. So only the update command may change it:
// it builds in .next-build and swaps the folder in once the new version has passed its checks (scripts/update-crm.sh). npm run dev has its own folder.
function outputFolder(phase) {
  const chosen = process.env.NEXT_DIST_DIR;
  if (phase === PHASE_PRODUCTION_BUILD && (!chosen || chosen === ".next")) {
    throw new Error("To put a change live, run: bash scripts/update-crm.sh (in the Mac's Terminal app). A plain build would overwrite the running CRM. To only try a build, set NEXT_DIST_DIR=.next-container.");
  }
  if (phase === PHASE_DEVELOPMENT_SERVER && (!chosen || chosen === ".next")) return ".next-dev";
  return chosen || ".next";
}

/** @type {(phase: string) => import('next').NextConfig} */
export default (phase) => ({
  distDir: outputFolder(phase),
  typescript: { tsconfigPath: process.env.NEXT_DIST_DIR === ".next-build" ? "tsconfig.build.json" : "tsconfig.json" },   // the live folder's old route types must not fail a new build
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  experimental: {
    serverActions: {
      bodySizeLimit: "17mb", // uploads: transcripts (2 MB) and training files (up to 5 files of 3 MB); the app enforces its own limits
      allowedOrigins,
    },
  },
});
