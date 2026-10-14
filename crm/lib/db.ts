import { Pool, type QueryResultRow } from "pg";

// One pool per server process (survives hot reloads in dev). Parameterised queries only.
const g = globalThis as unknown as { _pool?: Pool };

function pool(): Pool {
  if (!g._pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    g._pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  return g._pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool().query<T>(text, params)).rows;
}

export const demoMode = () => ["1", "true", "yes"].includes((process.env.DEMO_MODE ?? "").toLowerCase());
