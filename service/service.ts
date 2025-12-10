import * as ip from "./ip.ts";
import * as knownlog from "./knownlog.ts";
import * as ldap from "./ldapuser.ts";
import * as repo from "../repo/repo.ts";

function wipedb() {
  repo.knownlog.deleteAll();
  repo.ip.deleteAll();
}
function closedb() {
  repo.db.close();
}
function closeldap() {
  ldap.unbind_client();
}
export { closedb, closeldap, ip, knownlog, ldap, wipedb };
