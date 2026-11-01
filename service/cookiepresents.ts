import { localAdminIpString } from "../lib/timefunc.ts";
import type { UserType } from "../lib/types.ts";
import { userRecordToUserType } from "../lib/user_mapper.ts";
import * as repo from "../repo/repo.ts";

/**
 * Mindestabstand zwischen zwei Presence-Zeilen für dasselbe Paar
 * (IP, User). Eine Seite erzeugt mehrere Requests; ohne diese Grenze
 * würde jeder davon eine Zeile schreiben.
 */
export const COOKIE_PRESENT_MIN_INTERVAL_MS = 30_000;

export async function byIPInRange(
    ip: string,
    start: Date,
    end: Date,
): Promise<{
    at: string;
    user: UserType | null;
}[]> {
    const records = await repo.cookiepresents.byIPInRange(ip, start, end);
    if (records.length === 0) return [];

    const result: { at: string; user: UserType | null }[] = [];
    for (const record of records) {
        const user = await repo.users.getById(record.userId);
        result.push({
            at: localAdminIpString(record.at),
            user: user ? userRecordToUserType(user) : null,
        });
    }
    return result;
}

/**
 * Ergebnis eines Presence-Schreibversuchs (#163).
 *
 * `inserted` sagt, ob eine Zeile entstanden ist; `identityChanged` sagt,
 * ob dieser Insert die **neueste Identität der IP** verschiebt. Für das
 * Admin-Panel ist seit #164 schon `inserted` das Ereignis: eine neue
 * Präsenz kann ein „Unbekannt"-Kärtchen mit einem Namen füllen.
 * `identityChanged` bleibt als Aussage über die Identität bestehen.
 */
export type PresenceResult = { inserted: boolean; identityChanged: boolean };

/**
 * „Ich bin X" von einer IP ist eine Präsenzaussage.
 *
 * Schreibt höchstens eine Zeile pro (IP, User) je
 * `COOKIE_PRESENT_MIN_INTERVAL_MS` und meldet, ob die Zeile die neueste
 * Identität dieser IP ändert. Die erste Identität einer IP (`previous ===
 * null`) ist ebenfalls ein Wechsel.
 */
export async function recordPresence(
    userId: number,
    ip: string,
    at: Date = new Date(),
): Promise<PresenceResult> {
    const previous = repo.cookiepresents.getLatestUserIdForIP(ip);

    const since = new Date(at.getTime() - COOKIE_PRESENT_MIN_INTERVAL_MS);
    if (repo.cookiepresents.recentByIPAndUser(ip, userId, since)) {
        return { inserted: false, identityChanged: false };
    }

    await repo.cookiepresents.create(ip, userId, at);
    return { inserted: true, identityChanged: previous !== userId };
}

export async function recordByEmail(
    email: string,
    ip: string,
    now: () => Date = () => new Date(),
): Promise<PresenceResult> {
    const user = await repo.users.getByEmail(email.trim().toLowerCase());
    if (!user) return { inserted: false, identityChanged: false };

    return await recordPresence(user.id, ip, now());
}

export async function getLatestUserByIp(ip: string): Promise<UserType | null> {
    const userId = await repo.cookiepresents.getLatestUserIdForIP(ip);
    if (userId === null) return null;

    const user = await repo.users.getById(userId);
    return user ? userRecordToUserType(user) : null;
}
