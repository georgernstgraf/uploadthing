import { userRecordToUserType } from "../lib/user_mapper.ts";
import type { UserType } from "../lib/types.ts";
import * as usersRepo from "../repo/users.ts";
import * as registrationsRepo from "../repo/registrations.ts";
import type { RepoUserRecord } from "../repo/users.ts";

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
 * Fetch a user by id for a given IP and timestamp.
 * Prefers forensic registrations when matching an IP and time.
 */
export async function by_id_ip_at(
    userId: number,
    ip: string,
    at: Date,
): Promise<RepoUserRecord | null> {
    const start = new Date(at);
    start.setSeconds(start.getSeconds() - 1);
    const end = new Date(at);
    end.setSeconds(end.getSeconds() + 1);
    const registrations = registrationsRepo.byIPInRange(ip, start, end);
    const matches = registrations.filter((r) => r.userId === userId);
    if (matches.length === 0) return null;
    const targetTime = at.getTime();
    const match = matches.find((r) => r.at.getTime() === targetTime) ??
        matches[0];
    return await usersRepo.getById(match.userId);
}
