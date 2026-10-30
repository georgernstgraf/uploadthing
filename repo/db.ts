import { Database } from "@db/sqlite";
import config from "../lib/config.ts";
import { runMigrations } from "../lib/migrate.ts";

export const db = new Database(config.DATABASE_PATH);

export function vacuumInto(path: string) {
    db.exec(`VACUUM INTO '${path}';`);
}

db.exec("PRAGMA journal_mode=WAL;");
console.log("SQLite WAL mode enabled");

// Migrationen laufen beim App-Start, bevor irgendein Repository-Statement
// vorbereitet wird (die `prepare()`-Aufrufe der Repos setzen existierende
// Tabellen voraus). Idempotent, exklusiv, forward-only — siehe `lib/migrate.ts`.
runMigrations(db);

let shuttingDown = false;

export const shutdownSqlite = (signal: string) => {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    console.log(`Initiating graceful shutdown of SQLite due to ${signal}...`);
    try {
        db.close();
        console.log(`SQLite closed on ${signal}`);
    } catch (error) {
        console.error(`SQLite close failed on ${signal}:`, error);
    }
};

export default db;
