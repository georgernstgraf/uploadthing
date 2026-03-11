import * as repo from "../repo/repo.ts";
import * as service from "./service.ts";
import { UserType } from "../lib/types.ts";
import { localAdminIpString } from "../lib/timefunc.ts";
import config from "../lib/config.ts";

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
    const seen_ips = repo.ipfact.ips_in_range(start, end); // start, end: Date
    for (const ip of seen_ips) {
        const ip_admin: ServiceIpAdmin = {
            ip,
            seen_count: 0,
            seen_at_desc: [],
            cookie_presents: [],
            registrations: [],
            is_stale: false,
            submissions: [],
            has_submission: false,
        };
        const seen_at_desc = repo.ipfact.getHistoryForIPInRangeDesc(
            ip,
            start,
            end,
        );
        ip_admin.seen_count = seen_at_desc.length;
        ip_admin.seen_at_desc = seen_at_desc.map((dt) =>
            localAdminIpString(new Date(dt))
        );
        ip_admin.cookie_presents = await service.cookiepresents.byIPInRange(
            ip,
            start,
            end,
        );
        ip_admin.registrations = await service.registrations.byIPInRange(
            ip,
            start,
            end,
        );
        if (calculate_stale && seen_at_desc.length > 0) {
            ip_admin.is_stale = seen_at_desc[0].valueOf() < new Date(
                Date.now() - config.admin_stale_minutes * 60 * 1000,
            ).valueOf();
        }
        ip_admin.submissions = service.abgaben.getIPSubmissionsInRange(
            ip,
            start,
            end,
        );
        ip_admin.has_submission = ip_admin.submissions.length > 0;
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
