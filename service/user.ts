import * as user from "../repo/user.ts";
import { UserType } from "../lib/lib.ts";

export function getbyip(ip: string): UserType | null {
  const result = user.searchbyip(ip);
  if (!result) return null;
  return result as UserType;
}
export function register(userData: UserType) {
  user.registerip(userData);
}
