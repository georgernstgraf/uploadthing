import cf from "./config.ts";
export async function get_unterlagen() {
  const files: string[] = [];
  for await (const dirEntry of Deno.readDir(cf.UNTERLAGEN_DIR)) {
    if (!dirEntry.name.startsWith(".")) {
      files.push(dirEntry.name);
    }
  }
  files.sort();
  return files;
}
