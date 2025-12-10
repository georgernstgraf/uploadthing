import * as repo from "../repo/repo.ts";
import { UserType } from "../lib/lib.ts";

export function getbyip(ip: string): UserType | null {
  const result = repo.user.searchbyip(ip);
  if (!result) return null;
  return result as UserType;
}
