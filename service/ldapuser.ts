import * as repo from "../repo/repo.ts";

export async function getUserByEmail(startstring: string) {
  if (startstring.length < 3) {
    throw new Error("startstring must be at least 3 characters");
  }
  const result = await repo.ldap.getUsersStartingWith(startstring);
  return result;
}
export const serviceClient = repo.ldap.serviceClient;
