import * as repo from "../repo/repo.ts";
import { UserType } from "../lib/types.ts";
import { localAdminIpString } from "../lib/timefunc.ts";
import config from "../lib/config.ts";
import { userRecordToUserType } from "../lib/user_mapper.ts";

export type ServiceIpAdmin = {
    ip: string;
    seen_count: number;
    seen_at_desc: string[]; // displayable times
    cookie_presents: { at: string; user: UserType | null }[]; // sorted desc by at
    registrations: { at: string; user: UserType | null }[]; // sorted desc by at
    is_stale: boolean;
    submissions: { at: string; filename: string }[];
    has_submission: boolean;
};

export type ServiceIpAnomaly = {
    ip: string;
    users: UserType[];
};

export type ServiceUserAnomaly = {
    user: UserType;
    ips: string[];
};

export type ServiceAdminAnomalies = {
    by_ip: ServiceIpAnomaly[];
    by_user: ServiceUserAnomaly[];
};

function detectAnomalies(
    registered: ServiceIpAdmin[],
): ServiceAdminAnomalies {
    const ipAnomalies: ServiceIpAnomaly[] = [];
    const userToIps = new Map<number, { user: UserType; ips: Set<string> }>();

    for (const entry of registered) {
        const usersById = new Map<number, UserType>();
        const observations = [...entry.cookie_presents, ...entry.registrations];

        for (const observation of observations) {
            const user = observation.user;
            if (!user?.id) continue;

            usersById.set(user.id, user);

            const existing = userToIps.get(user.id);
            if (existing) {
                existing.ips.add(entry.ip);
            } else {
                userToIps.set(user.id, {
                    user,
                    ips: new Set([entry.ip]),
                });
            }
        }

        if (usersById.size > 1) {
            ipAnomalies.push({
                ip: entry.ip,
                users: [...usersById.values()].sort((a, b) =>
                    a.name.localeCompare(b.name)
                ),
            });
        }
    }

    const userAnomalies = [...userToIps.values()]
        .filter((entry) => entry.ips.size > 1)
        .map((entry) => ({
            user: entry.user,
            ips: [...entry.ips].sort(),
        }))
        .sort((a, b) => a.user.name.localeCompare(b.user.name));

    ipAnomalies.sort((a, b) => a.ip.localeCompare(b.ip));

    return {
        by_ip: ipAnomalies,
        by_user: userAnomalies,
    };
}

/**
 * Aggregate admin data for all IPs seen in a time range.
 */
export async function for_range(
    start: Date,
    end: Date,
    calculate_stale: boolean,
): Promise<{
    registered: ServiceIpAdmin[];
    unregistered: ServiceIpAdmin[];
    anomalies: ServiceAdminAnomalies;
}> {
    const rv: ServiceIpAdmin[] = [];
    const seenRows = repo.ipfact.getInRange(start, end);
    const cookieRows = repo.cookiepresents.byRange(start, end);
    const registrationRows = repo.registrations.byRange(start, end);
    const submissionRows = repo.abgaben.getByDateRange(start, end);

    const seenByIp = new Map<string, Date[]>();
    const cookieByIp = new Map<string, { at: Date; userId: number }[]>();
    const registrationByIp = new Map<string, { at: Date; userId: number }[]>();
    const submissionsByIp = new Map<string, { at: Date; filename: string }[]>();
    const userIds = new Set<number>();

    for (const row of seenRows) {
        const existing = seenByIp.get(row.ip);
        if (existing) {
            existing.push(row.seen);
        } else {
            seenByIp.set(row.ip, [row.seen]);
        }
    }

    for (const row of cookieRows) {
        userIds.add(row.userId);
        const existing = cookieByIp.get(row.ip);
        if (existing) {
            existing.push({ at: row.at, userId: row.userId });
        } else {
            cookieByIp.set(row.ip, [{ at: row.at, userId: row.userId }]);
        }
    }

    for (const row of registrationRows) {
        userIds.add(row.userId);
        const existing = registrationByIp.get(row.ip);
        if (existing) {
            existing.push({ at: row.at, userId: row.userId });
        } else {
            registrationByIp.set(row.ip, [{ at: row.at, userId: row.userId }]);
        }
    }

    for (const row of submissionRows) {
        const existing = submissionsByIp.get(row.ip);
        if (existing) {
            existing.push({ at: row.at, filename: row.filename });
        } else {
            submissionsByIp.set(row.ip, [{ at: row.at, filename: row.filename }]);
        }
    }

    for (const seenAtDesc of seenByIp.values()) {
        seenAtDesc.sort((a, b) => b.valueOf() - a.valueOf());
    }

    for (const records of cookieByIp.values()) {
        records.sort((a, b) => b.at.valueOf() - a.at.valueOf());
    }

    for (const records of registrationByIp.values()) {
        records.sort((a, b) => b.at.valueOf() - a.at.valueOf());
    }

    for (const submissions of submissionsByIp.values()) {
        submissions.sort((a, b) => b.at.valueOf() - a.at.valueOf());
    }

    const users = await repo.users.getByIds([...userIds]);
    const usersById = new Map<number, UserType>();
    for (const user of users) {
        usersById.set(user.id, userRecordToUserType(user));
    }

    for (const [ip, seenAtDesc] of seenByIp.entries()) {
        const cookiePresents = (cookieByIp.get(ip) ?? []).map((record) => ({
            at: localAdminIpString(record.at),
            user: usersById.get(record.userId) ?? null,
        }));
        const registrations = (registrationByIp.get(ip) ?? []).map((record) => ({
            at: localAdminIpString(record.at),
            user: usersById.get(record.userId) ?? null,
        }));
        const submissions = (submissionsByIp.get(ip) ?? []).map((submission) => ({
            at: localAdminIpString(submission.at),
            filename: submission.filename,
        }));

        const ip_admin: ServiceIpAdmin = {
            ip,
            seen_count: seenAtDesc.length,
            seen_at_desc: seenAtDesc.map((dt) => localAdminIpString(dt)),
            cookie_presents: cookiePresents,
            registrations,
            is_stale: false,
            submissions,
            has_submission: submissions.length > 0,
        };

        if (calculate_stale && seenAtDesc.length > 0) {
            ip_admin.is_stale = seenAtDesc[0].valueOf() < new Date(
                Date.now() - config.admin_stale_minutes * 60 * 1000,
            ).valueOf();
        }

        rv.push(ip_admin);
    }
    rv.sort((a, b) => {
        const left = a.seen_at_desc[0] ?? "";
        const right = b.seen_at_desc[0] ?? "";
        return right.localeCompare(left);
    });
    const registered = rv.filter((ipf) => ipf.cookie_presents.length > 0);
    const unregistered = rv.filter((ipf) => ipf.cookie_presents.length === 0);
    const anomalies = detectAnomalies(registered);
    return { registered, unregistered, anomalies };
}
