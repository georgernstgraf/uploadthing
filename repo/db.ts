import { Database } from "@db/sqlite";
export const db = new Database("uploadthing.db");

db.exec("PRAGMA journal_mode=WAL;");
console.log("SQLite WAL mode enabled");

let shuttingDown = false;

export const setupShutdown = () => {
    const shutdown = (signal: Deno.Signal) => {
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

    Deno.addSignalListener("SIGINT", () => {
        shutdown("SIGINT");
    });

    Deno.addSignalListener("SIGTERM", () => {
        shutdown("SIGTERM");
    });
};

export default db;
