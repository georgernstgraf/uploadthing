import { localDateTimeString } from "../lib/timefunc.ts";
import { userRecordToUserType } from "../lib/user_mapper.ts";
import type { UserType } from "../lib/types.ts";
import type { RepoRegistrationRecord } from "../repo/registrations.ts";
import * as repo from "../repo/repo.ts";

export type ServiceUserRegistrationRecord = {
    ip: string;
    at: string;
};

/**
 * List registration events for an IP with localized timestamps.
 * @param ip IP address to filter registrations by.
 * @returns Registration events with localized timestamps.
 */
export function ofIP(ip: string) {
    const registrations = repo.registrations.getRegistrationsByIP(ip);
    return registrations.map((r) => ({
        name: r.userId.toString(),
        at: localDateTimeString(new Date(r.at)),
    }));
}

/**
 * List registration events for an IP in a time range with resolved users.
 */
export async function ofIPInRange(
    ip: string,
    start: Date,
    end: Date,
): Promise<{
    at: string;
    user: UserType | null;
}[]> {
    const registrations = repo.registrations.byIPInRange(
        ip,
        start,
        end,
    );
    if (registrations.length === 0) return [];

    const userIds = [...new Set(registrations.map((r) => r.userId))];
    const users = await repo.users.getByIds(userIds);
    const usersById = new Map(users.map((user) => [user.id, user]));

    return registrations.map((r: RepoRegistrationRecord) => {
        const user = usersById.get(r.userId) ?? null;
        return {
            at: localDateTimeString(new Date(r.at)),
            user: user ? userRecordToUserType(user) : null,
        };
    });
}

/**
 * Build a per-user map of registration events for today and next day.
 * @returns Map keyed by user ID with registration event history.
 */
export function ofEmail(): Map<number, ServiceUserRegistrationRecord[]> {
    const registrations = repo.registrations.getHistoryEventsRange(
        new Date().toISOString().split("T")[0],
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    );
    const result = new Map<number, ServiceUserRegistrationRecord[]>();
    for (const r of registrations) {
        if (!result.has(r.userId)) {
            result.set(r.userId, []);
        }
        result.get(r.userId)!.push({
            ip: r.ip,
            at: localDateTimeString(new Date(r.at)),
        });
    }
    return result;
}
