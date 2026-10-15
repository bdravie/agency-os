import path from "node:path";
import { fileURLToPath } from "node:url";

// The single .env lives in the repo root. In Codespaces the values come from secrets instead.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {}

// GitHub Codespaces proxies the app through *.app.github.dev, so server actions must accept it.
// Only active inside a Codespace; locally the default same-origin check applies.
const inCodespace = process.env.CODESPACES === "true";

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  experimental: {
    serverActions: {
      bodySizeLimit: "17mb", // uploads: transcripts (2 MB) and training files (up to 5 files of 3 MB); the app enforces its own limits
      allowedOrigins: inCodespace ? ["*.app.github.dev"] : [],
    },
  },
};
