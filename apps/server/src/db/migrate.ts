import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db, sqlite, DB_FILE } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, "./migrations");

console.log(`[migrate] db: ${DB_FILE}`);
console.log(`[migrate] folder: ${migrationsFolder}`);
migrate(db, { migrationsFolder });
sqlite.close();
console.log("[migrate] done");
