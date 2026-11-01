import { userRecordToUserType } from "../lib/user_mapper.ts";
import type { UserType } from "../lib/types.ts";
import * as usersRepo from "../repo/users.ts";
import * as registrationsRepo from "../repo/registrations.ts";
import * as cookiepresentsService from "./cookiepresents.ts";
import { noteAdminActivity } from "./events.ts";

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
 *
 * Die Registrierung ist seit #163 zugleich eine Präsenzaussage: beide
 * Zeilen tragen dasselbe `at`, damit Karte, Gruppe und Sortierung den
 * Anmeldezeitpunkt ohne Rundung treffen. `registrations` bleibt der
 * Audit-Verlauf der ausdrücklichen Anmeldung.
 */
export async function register(userData: UserType, ip: string) {
    const userRecord = await usersRepo.upsert(userData);
    const at = new Date();
    registrationsRepo.create(ip, userRecord.id, at);
    const presence = await cookiepresentsService.recordPresence(
        userRecord.id,
        ip,
        at,
    );

    // Eine neue Präsenzzeile der Anmeldung ist ein Karten-Ereignis (#164):
    // sie kann die Identität dieser IP verschieben oder ein „Unbekannt"-
    // Kärtchen mit einem Namen füllen. Innerhalb des 30-s-Fensters schreibt
    // `recordPresence` keine Zeile — dann gibt es auch nichts zu melden.
    if (presence.inserted) {
        noteAdminActivity("cards");
    }
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
