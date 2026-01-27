import { localDateTimeString } from "../lib/timefunc.ts";
import { userRecordToUserType } from "../lib/user_mapper.ts";
import type { UserType } from "../lib/types.ts";
import * as repo from "../repo/repo.ts";

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

    return registrations.map((r) => {
        const user = usersById.get(r.userId) ?? null;
        return {
            at: localDateTimeString(new Date(r.at)),
            user: user ? userRecordToUserType(user) : null,
        };
    });
}
