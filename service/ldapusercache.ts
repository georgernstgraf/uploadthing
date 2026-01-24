import { UserType } from "../lib/types.ts";
import * as repo from "../repo/repo.ts";
import { LdapUserCacheRecord } from "../repo/ldapusercache.ts";
export async function registerUser(user: UserType) {
    await repo.ldapusercache.registerUser(user);
}
export async function registerManyUsers(users: UserType[]) {
    await repo.ldapusercache.registerManyUsers(users);
}

export async function getUsersByEmails(
    emails: string[],
): Promise<LdapUserCacheRecord[]> {
    return await repo.ldapusercache.getUsersByEmails(emails);
}
