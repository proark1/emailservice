import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema/index.js";
import { getConfig } from "../config/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _db: ReturnType<typeof createDb> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

function createDb() {
  const config = getConfig();
  _sql = postgres(config.DATABASE_URL!, { max: 20 });
  return drizzle(_sql, { schema });
}

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export async function runMigrations() {
  const db = getDb();
  const migrationsFolder = path.join(__dirname, "..", "drizzle");
  console.log("Running database migrations...");
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete.");
}

export async function closeDb() {
  if (_sql) await _sql.end();
}

export type Database = ReturnType<typeof getDb>;
