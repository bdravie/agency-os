import { Pool, type PoolClient, type QueryResultRow } from "pg";

// One pool per server process (survives hot reloads in dev). Parameterised queries only.
const g = globalThis as unknown as { _pool?: Pool };

function pool(): Pool {
  if (!g._pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    // `sslmode=require` is already treated as verify-full by pg; say so explicitly to avoid its deprecation warning.
    const url = process.env.DATABASE_URL.replace(/sslmode=(require|prefer|verify-ca)/, "sslmode=verify-full");
    // Neon's free tier suspends after a few idle minutes and the Mac sleeps, so pooled connections die without notice. Without
    // these limits a query waits on a dead socket for ever and every page hangs after login (seen 16 Nov 2026). A query that
    // times out passes its error to release(), which destroys that connection, so the next request opens a fresh one.
    g._pool = new Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 10_000,   // give up opening a connection after 10 s instead of waiting for ever
      query_timeout: 60_000,             // a query with no answer in 60 s fails, and its connection is thrown away
      idleTimeoutMillis: 60_000,         // close idle connections before Neon suspends under them
      keepAlive: true,
    });
    // A dropped idle connection (ECONNRESET, ETIMEDOUT) is reported here; the pool has already removed it. Without a listener
    // it surfaces as an uncaught exception in the server log.
    g._pool.on("error", (err) => console.error("Database connection dropped:", (err as NodeJS.ErrnoException).code ?? err.message));
  }
  return g._pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool().query<T>(text, params)).rows;
}

export const demoMode = () => ["1", "true", "yes"].includes((process.env.DEMO_MODE ?? "").toLowerCase());

/** Run several statements as one all-or-nothing transaction. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    // If ROLLBACK fails too, the connection is dead: destroy it rather than hand it back to the pool.
    await client.query("ROLLBACK").catch((e: Error) => { broken = e; });
    throw err;
  } finally {
    client.release(broken);
  }
}
