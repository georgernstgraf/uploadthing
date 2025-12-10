import db from "./db.ts";

const insert_prep = db.prepare("INSERT INTO ipfact (ip, seen) VALUES (?, ?)");
export function insert(ip: string, seen: Date) {
  insert_prep.run(ip, seen);
}
export function deleteAll() {
  db.exec("DELETE FROM ipfact");
}
