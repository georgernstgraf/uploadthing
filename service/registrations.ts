import { localAutoString } from "../lib/timefunc.ts";
import { userRecordToUserType } from "../lib/user_mapper.ts";
import type { UserType } from "../lib/types.ts";
import * as repo from "../repo/repo.ts";

/**
 * List registration events for an IP in a time range with resolved users.
 */
export async function byIPInRange(
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

    const result: { at: string; user: UserType | null }[] = [];
    for (const registration of registrations) {
        const user = await repo.users.getById(
            registration.userId,
        );
        result.push({
            at: localAutoString(registration.at),
            user: user ? userRecordToUserType(user) : null,
        });
    }
    return result;
}

/**
 * Get the latest IP address registered for an email.
 * Returns null if no registration found.
 */
export async function getLatestIPForEmail(email: string): Promise<string | null> {
    const user = await repo.users.getByEmail(email);
    if (!user) return null;
    return repo.registrations.getLatestIPForUser(user.id);
}
