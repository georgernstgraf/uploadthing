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

export async function recordByEmail(
    email: string,
    ip: string,
    now: () => Date = () => new Date(),
): Promise<boolean> {
    const user = await repo.users.getByEmail(email.trim().toLowerCase());
    if (!user) return false;

    const at = now();
    const since = new Date(at.getTime() - COOKIE_PRESENT_MIN_INTERVAL_MS);
    if (repo.cookiepresents.recentByIPAndUser(ip, user.id, since)) {
        return false;
    }

    await repo.cookiepresents.create(ip, user.id, at);
    return true;
}

export async function getLatestUserByIp(ip: string): Promise<UserType | null> {
    const userId = await repo.cookiepresents.getLatestUserIdForIP(ip);
    if (userId === null) return null;

    const user = await repo.users.getById(userId);
    return user ? userRecordToUserType(user) : null;
}
