import pg from "pg";

// Return bigint (int8) columns as JS numbers — cent amounts stay far below 2^53.
pg.types.setTypeParser(20, v => Number(v));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  max: 10
});

export const query = (text, params) => pool.query(text, params);

/** Run fn(client) inside a transaction; commits on success, rolls back on error. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
