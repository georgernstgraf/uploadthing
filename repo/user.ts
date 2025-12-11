import { db } from "./db.ts";
import { UserType } from "../lib/lib.ts";

// FIND USER BY IP
const selectbyip_prep = db.prepare(
  "select ip,name,email from user where ip = ?",
);
export function searchbyip(ip: string) {
  const result = selectbyip_prep.get(ip);
  return result; // undefined or usertype
}

// REGISTER USER BY IP
const insert_prep = db.prepare(
  "insert or replace into user (ip,name,email) values (?,?,?)",
);
export function registerip(userData: UserType) {
  insert_prep.run(userData.ip, userData.name, userData.email);
}
