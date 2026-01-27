import { db } from "../repo/db.ts";
/**
 * Close the SQLite database connection.
 */
export function close() {
  db.close();
}
