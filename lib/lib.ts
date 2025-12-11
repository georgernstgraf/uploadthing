import config from "./config.ts";
export async function get_unterlagen() {
  const files: string[] = [];
  for await (const dirEntry of Deno.readDir(config.UNTERLAGEN_DIR)) {
    if (!dirEntry.name.startsWith(".")) {
      files.push(dirEntry.name);
    }
  }
  files.sort();
  return files;
}
export type UserType = {
  ip?: string;
  name: string;
  email: string;
};
export type LdapUserType = {
  displayName: string;
  mail: string;
};
export function sleep(s: number) {
  return new Promise((resolve) => setTimeout(resolve, s * 1000));
}
