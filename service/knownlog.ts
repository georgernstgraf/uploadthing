import * as repo from "../repo/repo.ts";
export function exists(file: string): boolean {
  if (repo.knownlog.findByName(file)) {
    return true;
  }
  return false;
}
