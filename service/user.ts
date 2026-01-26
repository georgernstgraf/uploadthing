import { UserType } from "../lib/types.ts";
import * as usersRepo from "../repo/users.ts";
import * as registrationsRepo from "../repo/registrations.ts";
import type { UserRecord } from "../repo/users.ts";

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
    const usersById = new Map<number, UserRecord>(
        userRecords.map((u) => [u.id, u]),
    );

    for (const ip of ips) {
        const userId = registrationsRepo.getLatestRegistrationForIP(ip);
        if (userId !== null) {
            const user = usersById.get(userId);
            if (user) {
                result.set(ip, {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    klasse: user.klasse ?? undefined,
                });
            }
        }
    }

    return result;
}

export async function getRegisteredByIp(ip: string): Promise<UserType | null> {
    const userId = registrationsRepo.getLatestRegistrationForIP(ip);
    if (userId === null) return null;

    const user = await usersRepo.getById(userId);
    if (!user) return null;

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        klasse: user.klasse ?? undefined,
    };
}

export async function register(userData: UserType, ip: string) {
    const userRecord = await usersRepo.upsert(userData);
    registrationsRepo.create(ip, userRecord.id, new Date());
}

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
    const usersById = new Map<number, UserRecord>(
        users.map((u) => [u.id, u]),
    );

    for (const registration of registrations) {
        const user = usersById.get(registration.userId);
        result.set(registration.ip, {
            id: user?.id,
            name: user?.name ?? "not-in-ldap-anymore",
            email: user?.email ?? "",
            klasse: user?.klasse ?? "",
        });
    }
    return result;
}

export async function registerUser(user: UserType) {
    await usersRepo.upsert(user);
}

export async function registerManyUsers(users: UserType[]) {
    await usersRepo.upsertMany(users);
}

export async function getUsersByEmails(
    emails: string[],
): Promise<UserRecord[]> {
    if (emails.length === 0) return [];
    return await usersRepo.getByEmails(emails);
}
