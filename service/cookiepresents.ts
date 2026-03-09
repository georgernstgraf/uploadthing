import { localAdminIpString } from "../lib/timefunc.ts";
import type { UserType } from "../lib/types.ts";
import { userRecordToUserType } from "../lib/user_mapper.ts";
import * as repo from "../repo/repo.ts";

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

export async function recordByEmail(email: string, ip: string): Promise<void> {
    const user = await repo.users.getByEmail(email.trim().toLowerCase());
    if (!user) return;
    await repo.cookiepresents.create(ip, user.id, new Date());
}

export async function getLatestUserByIp(ip: string): Promise<UserType | null> {
    const userId = await repo.cookiepresents.getLatestUserIdForIP(ip);
    if (userId === null) return null;

    const user = await repo.users.getById(userId);
    return user ? userRecordToUserType(user) : null;
}
