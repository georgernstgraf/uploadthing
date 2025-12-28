import config from "../lib/config.ts";
import * as repo from "../repo/repo.ts";
import * as service from "./service.ts";

const ipRegex = /^(\d+\.\d+\.\d+\.\d+)$/gm;

function eatfiletransaction(file: string): string[] {
  let ips: string[] = [];
  repo.db.transaction((file: string) => {
    repo.knownlog.add(file);
    const filedate = new Date(file.split(".")[0].replace("_", " "));
    const content = Deno.readTextFileSync(`${config.logdir}/${file}`);
    const matches = content.matchAll(ipRegex);
    ips = Array.from(matches, (match) => match[1]);
    repo.ipfact.registerSeenMany(ips, filedate);
  })(file);
  return ips;
}
export function eatfile(file: string) {
  // bailout if we have it already
  if (service.knownlog.exists(file)) {
    throw new Error(`file ${file} already processed`);
  }
  return eatfiletransaction(file);
}

export function ips_with_counts_in_range(
  start_localtime: string,
  end_localtime: string,
) {
  return repo.ipfact.seenStatsForRange(start_localtime, end_localtime);
}
