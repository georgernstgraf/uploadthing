import { Database } from "@db/sqlite";
export const db = new Database("uploadthing.db");

db.exec("PRAGMA journal_mode=WAL;");
console.log("SQLite WAL mode enabled");

export default db;
