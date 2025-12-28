import { db } from "../repo/db.ts";
export function close() {
  db.close();
}
