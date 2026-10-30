import { userRecordToUserType } from "../lib/user_mapper.ts";
import type { UserType } from "../lib/types.ts";
import * as usersRepo from "../repo/users.ts";
import * as registrationsRepo from "../repo/registrations.ts";
import * as cookiepresentsService from "./cookiepresents.ts";

/**
 * LDAP-Klasse, die Lehrpersonen kennzeichnet. Sie ist die einzige Quelle
 * für Admin-Rechte: eine freigegebene MAC (#147) regelt nur, *von welchem
 * Gerät* sich eine Lehrperson anmelden darf, nicht *ob* sie Admin ist.
 */
export const TEACHER_CLASS = "LehrendeR";

/**
 * Ist dieser User eine Lehrperson? `false` für `null`, für Schüler und für
 * User ohne Klasse.
 */
export function isTeacher(
    user: { klasse?: string | null } | null | undefined,
): boolean {
    return user?.klasse === TEACHER_CLASS;
}

/**
 * Fetch the latest registered user for a single IP.
 */
export async function getRegisteredByIp(ip: string): Promise<UserType | null> {
    return await cookiepresentsService.getLatestUserByIp(ip);
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
