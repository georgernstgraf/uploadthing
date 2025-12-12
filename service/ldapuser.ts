import * as repo from "../repo/repo.ts";
import { LdapUserType, UserType } from "../lib/lib.ts";

export async function getUserByEmail(
  email: string,
): Promise<UserType | null> {
  const result = await repo.ldap.getUserByEmail(email);
  if (!result) {
    return null;
  }
  return userFromLdap(result);
}
export async function searchUserByEmailStart(
  startstring: string,
): Promise<UserType[]> {
  if (startstring.length < 3) {
    throw new Error("startstring must be at least 3 characters");
  }
  const result = await repo.ldap.getUsersMailStartingWith(startstring);
  return result.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    })
  ).map(userFromLdap);
}
function userFromLdap(ldapUser: LdapUserType): UserType {
  return {
    email: ldapUser.mail,
    name: ldapUser.displayName,
    klasse: ldapUser.physicalDeliveryOfficeName,
  };
}
export async function close() {
  // await sleep(1);
  await repo.ldap.serviceClientFactory.close();
}
