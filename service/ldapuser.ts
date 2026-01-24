import * as repo from "../repo/repo.ts";
import { LdapUserType, UserType } from "../lib/types.ts";
import { registerManyUsers, registerUser } from "./ldapusercache.ts";
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
function userFromLdap(ldapUser: LdapUserType): UserType {
    return {
        email: ldapUser.mail.toLocaleLowerCase(),
        name: ldapUser.displayName,
        klasse: ldapUser.physicalDeliveryOfficeName || "None",
    };
}
export async function close() {
    // await sleep(1);
    await repo.ldap.serviceClientFactory.close();
}
