import { localDateTimeString } from "../lib/timefunc.ts";
import * as repo from "../repo/repo.ts";

export type UserRegistrationRecord = {
    ip: string;
    at: string;
};

/**
 * List registration events for an IP with localized timestamps.
 */
export function ofIP(ip: string) {
    const registrations = repo.registrations.getRegistrationsByIP(ip);
    return registrations.map((r) => ({
        name: r.userId.toString(),
        at: localDateTimeString(new Date(r.at)),
    }));
}

/**
 * List registration events for an IP in a time range.
 */
export function ofIPInRange(
    ip: string,
    start: Date,
    end: Date,
): { at: string; user: { id: number; name: string; email: string; klasse?: string } }[] {
    const registrations = repo.registrations.getRegistrationsByIPInRange(
        ip,
        start,
        end,
    );
    if (registrations.length === 0) return [];

    return registrations.map((r) => ({
        at: localDateTimeString(new Date(r.at)),
        user: {
            id: r.userId,
            name: r.userId.toString(),
            email: "",
            klasse: "",
        },
    }));
}

/**
 * Build a per-user map of registration events for today and next day.
 */
export function ofEmail(): Map<number, UserRegistrationRecord[]> {
    const registrations = repo.registrations.getHistoryEventsRange(
        new Date().toISOString().split("T")[0],
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    );
    const result = new Map<number, UserRegistrationRecord[]>();
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
