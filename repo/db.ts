import { Database } from "@db/sqlite";
import config from "../lib/config.ts";

export const db = new Database(config.DATABASE_PATH);

export function vacuumInto(path: string) {
    db.exec(`VACUUM INTO '${path}';`);
}

db.exec("PRAGMA journal_mode=WAL;");
console.log("SQLite WAL mode enabled");

let shuttingDown = false;

export const shutdownSqlite = (signal: Deno.Signal) => {
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
