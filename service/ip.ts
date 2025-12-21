import config from "../lib/config.ts";
import * as repo from "../repo/repo.ts";
import * as service from "./service.ts";

const ipRegex = /Host:\s+(\d+\.\d+\.\d+\.\d+)\s+\(([^)]*)\)\s+Status:\s+Up/;

const eatfiletransaction = repo.db.db.transaction((file: string) => {
  repo.knownlog.add(file);
  const filedate = new Date(file.split(".")[0].replace("_", " "));
  const content = Deno.readTextFileSync(`${config.logdir}/${file}`);
  content.split("\n").forEach((line) => {
    const match = line.match(ipRegex);
    if (!match) {
      return; // stick to my pattern ;)
    }
    const ipAddress = match?.[1]; // "192.168.21.59"
    console.log(ipAddress);
    repo.ip.registerSeen(ipAddress, filedate);
  });
});

export function eatfile(file: string) {
  // bailout if we have it already
  if (service.knownlog.exists(file)) {
    throw new Error(`file ${file} already processed`);
  }
  eatfiletransaction(file);
}
