import pg from "pg";
import type { PoolClient } from "pg";
import { databaseConfig } from "./config";

let pool: pg.Pool | undefined;
export function getPool() {
  if (!pool) {
    pool = new pg.Pool(databaseConfig());
    // A dropped idle connection must not crash the function process.
    pool.on("error", () => console.error("PostgreSQL idle connection failed"));
  }
  return pool;
}
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
// Integration tests inject an in-memory adapter; never available through an API route.
export function setPoolForTests(value: pg.Pool) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Database injection is available only in tests.");
  pool = value;
}
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
