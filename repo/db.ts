import { Database } from "@db/sqlite";
export const db = new Database("uploadthing.db");
export function close() {
  db.close();
}
