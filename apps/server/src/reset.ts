import { createDb, resetDatabase } from "./db.js";
import { env } from "./env.js";

/**
 * CLI: reset the demo database back to the seeded defaults.
 *   npm run reset            (from the repo root)
 *
 * Safe to run whether or not the dev server is up (SQLite WAL allows a second
 * connection); the running server picks up the changes on its next query, but
 * reload the browser to refresh the in-memory UI state.
 */
const db = createDb(env.dbFile);
resetDatabase(db);
db.close();
console.log(`[reset] ${env.dbFile} reset to seed defaults.`);
