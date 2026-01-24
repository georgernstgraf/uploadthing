import * as userRepo from "../repo/user.ts";
import { UserType } from "../lib/types.ts";
import * as ldapService from "./ldapuser.ts";
import * as ldapcache from "./ldapusercache.ts";
import * as repo from "../repo/repo.ts";
import { LdapUserCacheRecord } from "../repo/ldapusercache.ts";

export function ofIPs(ips: string[]): Map<string, UserType> {
    const result = new Map<string, UserType>();
    const users = userRepo.searchbyips(ips);
    for (const u of users) {
        result.set(u.ip!, u);
    }
    return result;
}
export function getbyip(ip: string): UserType | null {
    const result = userRepo.searchbyip(ip);
    if (!result) return null;
    return result as UserType;
}
export function register(userData: UserType) {
    userRepo.registerip(userData);
}

export function get_registered_ips(ips: string[]): Set<string> {
    const users = userRepo.searchbyips(ips);
    const registered_ips = new Set<string>();
    for (const u of users) {
        if (u.ip) {
            registered_ips.add(u.ip);
        }
    }
    return registered_ips;
}

export async function ofIPsFromRegistrationsInRange(
    ips: string[],
    starttime: string,
    endtime: string,
): Promise<Map<string, UserType>> {
    const result = new Map<string, UserType>();
    const registrations = repo.registrations.latestRegistrationsForIPsInRange(
        ips,
        starttime,
        endtime,
    );
    if (registrations.length === 0) return result;
    const emails = [
        ...new Set(registrations.map((registration) => registration.email)),
    ];
    const cachedUsers = await ldapcache.getUsersByEmails(emails);
    const cachedByEmail = new Map<string, LdapUserCacheRecord>(
        cachedUsers.map((user) => [user.email, user]),
    );
    const missingEmails = emails.filter((email) => !cachedByEmail.has(email));
    const fetchedUsers: UserType[] = [];
    for (const email of missingEmails) {
        try {
            const user = await ldapService.getUserByEmail(email);
            if (user) {
                fetchedUsers.push(user);
            } else {
                fetchedUsers.push({
                    email,
                    name: "not-in-ldap-anymore",
                    klasse: "",
                });
            }
        } catch (e) {
            console.error("LDAP lookup failed for", email, e);
            fetchedUsers.push({
                email,
                name: "not-in-ldap-anymore",
                klasse: "",
            });
        }
    }
    if (fetchedUsers.length > 0) {
        try {
            await ldapcache.registerManyUsers(
                fetchedUsers.filter((user) =>
                    user.name !== "not-in-ldap-anymore"
                ),
            );
        } catch (e) {
            console.error("Failed to update ldapusercache", e);
        }
        for (const user of fetchedUsers) {
            cachedByEmail.set(user.email, {
                email: user.email,
                name: user.name,
                klasse: user.klasse ?? null,
            });
        }
    }
    for (const registration of registrations) {
        const user = cachedByEmail.get(registration.email);
        result.set(registration.ip, {
            ip: registration.ip,
            email: registration.email,
            name: user?.name ?? "not-in-ldap-anymore",
            klasse: user?.klasse ?? "",
        });
    }
    return result;
}
