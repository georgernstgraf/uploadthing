import { userRecordToUserType } from "../lib/user_mapper.ts";
import type { UserType } from "../lib/types.ts";
import * as usersRepo from "../repo/users.ts";
import * as registrationsRepo from "../repo/registrations.ts";
import type { RepoUserRecord } from "../repo/users.ts";

/**
 * Resolve users for IPs using registrations in a time range.
 */
export async function ofIPs_in_timerange(
    ips: string[],
    startDateTime: Date,
    endDateTime: Date,
): Promise<Map<string, UserType>> {
    const result = new Map<string, UserType>(); // ip -> UserType
    const userIds = new Set<number>();

    for (const ip of ips) {
        const userId = registrationsRepo
            .lastRegistrationForIP_in_timerange(
                ip,
                startDateTime,
                endDateTime,
            );
        if (userId !== null) {
            userIds.add(userId);
        }
    }

    const userRecords = userIds.size > 0
        ? await usersRepo.getByIds([...userIds])
        : [];
    const usersById = new Map<number, RepoUserRecord>(
        userRecords.map((u) => [u.id, u]),
    );

    for (const ip of ips) {
        const userId = registrationsRepo.getLatestRegistrationForIP(ip);
        if (userId !== null) {
            const user = usersById.get(userId);
            if (user) {
                result.set(ip, userRecordToUserType(user));
            }
        }
    }

    return result;
}

/**
 * Fetch the latest registered user for a single IP.
 */
export async function getRegisteredByIp(ip: string): Promise<UserType | null> {
    const userId = registrationsRepo.getLatestRegistrationForIP(ip);
    if (userId === null) return null;

    const user = await usersRepo.getById(userId);
    if (!user) return null;

    return userRecordToUserType(user);
}

/**
 * Upsert user data and create a registration entry for an IP.
 */
export async function register(userData: UserType, ip: string) {
    const userRecord = await usersRepo.upsert(userData);
    registrationsRepo.create(ip, userRecord.id, new Date());
}

/**
 * Return the subset of IPs that have a registration.
 */
export function get_registered_ips(ips: string[]): Set<string> {
    const result = new Set<string>();
    for (const ip of ips) {
        const userId = registrationsRepo.getLatestRegistrationForIP(ip);
        if (userId !== null) {
            result.add(ip);
        }
    }
    return result;
}

/**
 * Build IP-to-user map from latest registrations in a time range.
 */
export async function ofIPsFromRegistrationsInRange(
    ips: string[],
    starttime: string,
    endtime: string,
): Promise<Map<string, UserType>> {
    const result = new Map<string, UserType>();
    const registrations = registrationsRepo.latestRegistrationsForIPsInRange(
        ips,
        starttime,
        endtime,
    );
    if (registrations.length === 0) return result;

    const userIds = [
        ...new Set(registrations.map((registration) => registration.userId)),
    ];
    const users = await usersRepo.getByIds(userIds);
    const usersById = new Map<number, RepoUserRecord>(
        users.map((u) => [u.id, u]),
    );

    for (const registration of registrations) {
        const user = usersById.get(registration.userId);
        if (!user) {
            result.set(registration.ip, {
                name: "not-in-ldap-anymore",
                email: "",
                klasse: "",
            });
            continue;
        }
        result.set(registration.ip, userRecordToUserType(user));
    }
    return result;
}

/**
 * Upsert a single user record.
 */
export async function registerUser(user: UserType) {
    await usersRepo.upsert(user);
}

/**
 * Upsert many users in a batch transaction.
 */
export async function registerManyUsers(users: UserType[]) {
    await usersRepo.upsertMany(users);
}

/**
 * Fetch users by a list of emails.
 */
export async function getUsersByEmails(
    emails: string[],
): Promise<RepoUserRecord[]> {
    if (emails.length === 0) return [];
    return await usersRepo.getByEmails(emails);
}

/**
 * Fetch a single user by normalized email.
 */
export async function getUserByEmail(
    email: string,
): Promise<UserType | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await usersRepo.getByEmail(normalizedEmail);
    if (!user) return null;

    return userRecordToUserType(user);
}
