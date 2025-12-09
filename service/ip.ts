import config from "../config.ts";
import * as repo from "../repo/repo.ts";
export function eatfile(file: string) {
  const ipRegex = /Host:\s+(\d+\.\d+\.\d+\.\d+)\s+\(([^)]*)\)\s+Status:\s+Up/;
  const filedate = new Date(file.split(".")[0].replace("_", " "));
  const content = Deno.readTextFileSync(`${config.logdir}/${file}`);
  content.split("\n").forEach((line) => {
    const match = line.match(ipRegex);
    if (!match) {
      return; // stick to my pattern ;)
    }
    const ipAddress = match?.[1]; // "192.168.21.59"
    console.log(ipAddress);
    repo.ip.insert(ipAddress, filedate);
  });
  return `serwus ${file}, ${filedate}`;
}
