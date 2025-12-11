import { db } from "./db.ts";

const selectbyip_prep = db.prepare(
  "select ip,name,email from user where ip = ?",
);
export function searchbyip(ip: string) {
  const result = selectbyip_prep.get(ip);
  return result; // undefined or usertype
}
