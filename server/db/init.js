// Applies db/schema.sql using the pg driver (no psql needed).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(fs.readFileSync(file, "utf8"));
  console.log("Database ready (schema.sql applied).");
} finally {
  await client.end();
}
