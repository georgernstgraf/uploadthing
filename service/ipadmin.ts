import * as repo from "../repo/repo.ts";
import { UserType } from "../lib/types.ts";
import { localAdminIpString } from "../lib/timefunc.ts";
import config from "../lib/config.ts";
import { parseDisplayName, userRecordToUserType } from "../lib/user_mapper.ts";

export type ServiceIpAdmin = {
    ip: string;
    seen_count: number;
    report_count: number;
    missed_count: number; // scans where IP was absent from first appearance onward
    first_seen: string; // first time IP was seen in range (displayable)
    last_seen: string; // last time IP was seen in range (displayable)
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

export type ServiceIPDetail = {
    ip: string;
    user_name: string;
    cookie_presents: { at: string; user_name: string; count: number; count_gt_1: boolean }[];
    registrations: { at: string; user_name: string }[];
    submissions: { at: string; filename: string }[];
    seen_at_desc: { at: string; present: boolean }[];
    seen_count: number;
    missed_count: number;
    has_submission: boolean;
};

export type ServiceAdminResult = {
    registered: ServiceIpAdmin[];
    unregistered: ServiceIpAdmin[];
    teacher_ips: ServiceIpAdmin[];
    anomalies: ServiceAdminAnomalies;
    range_first_seen: string; // earliest scan time across all IPs
    range_last_seen: string; // latest scan time across all IPs
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
): Promise<ServiceAdminResult> {
    const seenRows = repo.ipfact.getInRange(start, end);
    const cookieRows = repo.cookiepresents.byRange(start, end);
    const registrationRows = repo.registrations.byRange(start, end);
    const submissionRows = repo.abgaben.getByDateRange(start, end);

    // Get all unique scan timestamps in the range (for missed_count calculation)
    const allScans = repo.ipfact.getUniqueScanTimestamps(start, end);

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

    const ips = new Set<string>([
        ...seenByIp.keys(),
        ...cookieByIp.keys(),
        ...registrationByIp.keys(),
        ...submissionsByIp.keys(),
    ]);
    const rv: ServiceIpAdmin[] = [];

    for (const ip of ips) {
        const seenAtDesc = seenByIp.get(ip) ?? [];
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

        // Calculate missed_count: scans where IP was absent BETWEEN first and last appearance
        let missed_count = 0;
        let first_seen = "";
        let last_seen = "";

        if (seenAtDesc.length > 0 && allScans.length > 0) {
            // seenAtDesc is sorted descending (most recent first)
            // First element = last_seen (most recent), Last element = first_seen (earliest)
            const seenTimesAsc = [...seenAtDesc].sort((a, b) => a.valueOf() - b.valueOf());
            const firstSeenTime = seenTimesAsc[0];
            const lastSeenTime = seenTimesAsc[seenTimesAsc.length - 1];

            first_seen = localAdminIpString(firstSeenTime);
            last_seen = localAdminIpString(lastSeenTime);

            // If the student has submitted work, stop counting missed scans after that point.
            // (A student who leaves after submitting is considered done, not missing.)
            const rawSubmissions = submissionsByIp.get(ip) ?? [];
            const cutoffTime = rawSubmissions.length > 0
                ? rawSubmissions[0].at  // most recent submission (sorted desc)
                : null;

            const scansFromFirstSeen = allScans.filter(
                (scan) => {
                    if (scan.valueOf() < firstSeenTime.valueOf()) return false;
                    if (cutoffTime && scan.valueOf() > cutoffTime.valueOf()) return false;
                    return true;
                }
            );
            const seenTimesSet = new Set(seenAtDesc.map((d) => d.toISOString()));
            missed_count = scansFromFirstSeen.filter((scan) => !seenTimesSet.has(scan.toISOString())).length;
        }

        const ip_admin: ServiceIpAdmin = {
            ip,
            seen_count: seenAtDesc.length,
            report_count: seenAtDesc.length + cookiePresents.length,
            missed_count,
            first_seen,
            last_seen,
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
    // Classify by role: last cookie decides
    const studentIps: ServiceIpAdmin[] = [];
    const teacherIps: ServiceIpAdmin[] = [];
    for (const ip of rv) {
        const primaryUser = ip.cookie_presents[0]?.user ?? null;
        if (primaryUser?.klasse === "LehrendeR") {
            teacherIps.push(ip);
        } else {
            studentIps.push(ip);
        }
    }

    const sortByName = (a: ServiceIpAdmin, b: ServiceIpAdmin) => {
        const aName = parseDisplayName(a.cookie_presents[0]?.user?.name ?? "");
        const bName = parseDisplayName(b.cookie_presents[0]?.user?.name ?? "");
        const cmp = aName.lastname.localeCompare(bName.lastname);
        if (cmp !== 0) return cmp;
        return aName.firstname.localeCompare(bName.firstname);
    };
    studentIps.sort(sortByName);
    teacherIps.sort(sortByName);

    const registered = studentIps.filter((ipf) => ipf.cookie_presents.length > 0);
    const unregistered = studentIps.filter((ipf) => ipf.cookie_presents.length === 0);
    const anomalies = detectAnomalies(rv);

    // Calculate overall range from all scans
    const range_first_seen = allScans.length > 0
        ? localAdminIpString(allScans[0]) // allScans is sorted ascending
        : "";
    const range_last_seen = allScans.length > 0
        ? localAdminIpString(allScans[allScans.length - 1])
        : "";

    return { registered, unregistered, teacher_ips: teacherIps, anomalies, range_first_seen, range_last_seen };
}

export async function getIPDetail(
    ip: string,
    start: Date,
    end: Date,
): Promise<ServiceIPDetail> {
    const seenRows = repo.ipfact.getHistoryForIPInRangeDesc(ip, start, end);
    const cookieRows = repo.cookiepresents.byIPInRange(ip, start, end);
    const registrationRows = repo.registrations.byIPInRange(ip, start, end);
    const submissionRows = repo.abgaben.getByIPAndDateRange(ip, start, end);

    const userIds = new Set<number>();
    for (const row of cookieRows) userIds.add(row.userId);
    for (const row of registrationRows) userIds.add(row.userId);

    const users = await repo.users.getByIds([...userIds]);
    const usersById = new Map<number, string>();
    for (const user of users) {
        usersById.set(user.id, user.name);
    }

    const cookie_presents_map = new Map<string, { user_name: string; count: number }>();
    for (const row of cookieRows) {
        const at = localAdminIpString(row.at);
        const user_name = usersById.get(row.userId) ?? "Unbekannt";
        const existing = cookie_presents_map.get(at);
        if (existing) {
            existing.count++;
        } else {
            cookie_presents_map.set(at, { user_name, count: 1 });
        }
    }
    const cookie_presents = [...cookie_presents_map.entries()].map(([at, { user_name, count }]) => ({
        at,
        user_name,
        count,
        count_gt_1: count > 1,
    }));

    const registrations = registrationRows.map((row) => ({
        at: localAdminIpString(row.at),
        user_name: usersById.get(row.userId) ?? "Unbekannt",
    }));

    const submissions = submissionRows.map((row) => ({
        at: localAdminIpString(row.at),
        filename: row.filename,
    }));

    const roundDownToMinute = (d: Date) => {
        const copy = new Date(d);
        copy.setSeconds(0, 0);
        return copy;
    };

    let seen_at_desc: { at: string; present: boolean }[] = [];
    if (seenRows.length > 0) {
        const sorted = [...seenRows].sort((a, b) => a.valueOf() - b.valueOf());
        const firstMinute = roundDownToMinute(sorted[0]);
        const lastMinute = roundDownToMinute(sorted[sorted.length - 1]);

        const presentSet = new Set(seenRows.map((d) => localAdminIpString(roundDownToMinute(d))));

        const entries: { at: string; present: boolean }[] = [];
        const t = new Date(lastMinute);
        while (t >= firstMinute) {
            const at = localAdminIpString(t);
            entries.push({ at, present: presentSet.has(at) });
            t.setMinutes(t.getMinutes() - 1);
        }
        seen_at_desc = entries;
    }

    let user_name = "Unbekannt";
    if (cookie_presents.length > 0) {
        user_name = cookie_presents[0].user_name;
    } else if (registrations.length > 0) {
        user_name = registrations[0].user_name;
    }

    return {
        ip,
        user_name,
        cookie_presents,
        registrations,
        submissions,
        seen_at_desc,
        seen_count: seenRows.length,
        missed_count: 0,
        has_submission: submissions.length > 0,
    };
}
