import { db } from "../repo/db.ts";
import * as knownlog from "../repo/knownlog.ts";
import * as ip from "../repo/ip.ts";
export function close() {
  db.close();
}
export function wipe() {
  knownlog.deleteAll();
  ip.deleteAll();
}
