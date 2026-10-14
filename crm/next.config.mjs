// The single .env lives in the repo root. In Codespaces the values come from secrets instead.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {}

/** @type {import('next').NextConfig} */
export default { poweredByHeader: false };
