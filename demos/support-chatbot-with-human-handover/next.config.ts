import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Settings live in the repo's own .env (ANTHROPIC_API_KEY, SHEETS_WEBHOOK_URL ...), two folders up,
// so the demo never needs a second copy of the key. SUPPORT_DEMO_ROOT points elsewhere if the demo is copied out.
// forceReload (the 4th argument) matters: Next has already loaded this folder's env files by now and
// caches the result, so without it the repo's .env is silently skipped and the chat runs in offline mode.
loadEnvConfig(process.env.SUPPORT_DEMO_ROOT ?? path.resolve(process.cwd(), "../.."), process.env.NODE_ENV !== "production", console, true);

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
