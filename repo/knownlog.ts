import db from "./db.ts";

const select_prep = db.prepare("INSERT INTO ipfact (ip, seen) VALUES (?, ?)");
export function add(ip: string, seen: Date) {
  // insert_prep.run(ip, seen);
}
