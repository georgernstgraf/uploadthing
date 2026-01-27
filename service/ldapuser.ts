import * as repo from "../repo/repo.ts";
import { LdapUserType, UserType } from "../lib/types.ts";
import { registerManyUsers, registerUser } from "./user.ts";
/**
 * Fetch a user from LDAP by exact email and register locally.
 */
export async function getUserByEmail(
    email: string,
): Promise<UserType | null> {
    const result = await repo.ldap.getUserByEmail(email);
    if (!result) {
        return null;
    }
    const user = userFromLdap(result);
    try {
        await registerUser(user);
    } catch (e) {
        console.error("Failed to register user async:", email);
        console.error(e);
        return user;
    }
    return user;
}
/**
 * Search LDAP users by email prefix and register results locally.
 */
export async function searchUserByEmailStart(
    startstring: string,
): Promise<UserType[]> {
    if (startstring.length < 3) {
        throw new Error("startstring must be at least 3 characters");
    }
    const reporesult = await repo.ldap.getUsersMailStartingWith(startstring);
    const result = reporesult.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
            sensitivity: "base",
        })
    ).map(userFromLdap);

    try {
        await registerManyUsers(result);
    } catch (e) {
        console.error(
            "Failed to register many users async, error:",
            startstring,
        );
        console.error(e);
    }
    return result;
}
/**
 * Convert LDAP user data into the local user shape.
 */
function userFromLdap(ldapUser: LdapUserType): UserType {
    return {
        email: ldapUser.mail.toLocaleLowerCase(),
        name: ldapUser.displayName,
        klasse: ldapUser.physicalDeliveryOfficeName || "None",
    };
}
/**
 * Close LDAP service client resources.
 */
export async function close() {
    // await sleep(1);
    await repo.ldap.serviceClientFactory.close();
}
