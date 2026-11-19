// Loads the repo's .env (two folders up) for the command-line scripts, the same way next.config.ts does for the app.
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.env.SUPPORT_DEMO_ROOT ?? path.resolve(process.cwd(), "../.."));
