import { localDateTimeString } from "../lib/timefunc.ts";
import * as repo from "../repo/repo.ts";

export type UserRegistrationRecord = {
    ip: string;
    at: string;
};

export function ofIP(ip: string) {
    const registrations = repo.registrations.getRegistrationsByIP(ip);
    return registrations.map((r) => ({
        name: r.userId.toString(),
        at: localDateTimeString(new Date(r.at)),
    }));
}

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
