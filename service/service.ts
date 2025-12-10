import * as ip from "./ip.ts";
import * as knownlog from "./knownlog.ts";
import * as repo from "../repo/repo.ts";

function wipedb() {
  repo.knownlog.deleteAll();
  repo.ip.deleteAll();
}
export { ip, knownlog, wipedb };
