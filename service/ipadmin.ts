import * as repo from "../repo/repo.ts";
import { UserType } from "../lib/types.ts";
import { ipSlug } from "../lib/slug.ts";
import { localAdminIpString, localDayStart } from "../lib/timefunc.ts";
import { parseDisplayName, userRecordToUserType } from "../lib/user_mapper.ts";
import type { ActivityComponent } from "./events.ts";

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

/**
 * Zeilen einer einzelnen IP im betrachteten Zeitraum — die Eingabe des
 * gemeinsamen Aggregationskerns.
 */
type IpRows = {
    ip: string;
    seenAtDesc: Date[];
    cookieRows: { at: Date; userId: number }[];
    registrationRows: { at: Date; userId: number }[];
    submissionRows: { at: Date; filename: string }[];
};

/**
 * Scan-Zeitachse des betrachteten Zeitraums (`tikscan`, #163).
 * `scans` aufsteigend, `latest` der jüngste Scan im Zeitraum.
 */
type ScanAxis = {
    scans: Date[];
    latest: Date | null;
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
 * Gemeinsamer Aggregationskern pro IP: `for_range` und `for_ip` bauen den
 * Karten-Eintrag ausschließlich hier, damit es keine zweite Wahrheit gibt.
 *
 * Async, weil die Nutzer zu den Cookie-/Registrierungszeilen geladen werden.
 * `usersById` ist ein Cache über den ganzen Aufruf — `for_range` füllt ihn
 * vorab für alle IPs, `for_ip` lädt nur die fehlenden.
 *
 * `missed_count` zählt Scans aus `tikscan` (auch leere) zwischen erster
 * Sichtung und jüngster Abgabe, in denen die IP fehlte. `is_stale` bezieht
 * sich auf den **letzten Scan des Zeitraums**, nicht auf die Wanduhr: vorher
 * gesehen, dort nicht mehr da, und nicht nach der Abgabe gegangen.
 */
async function aggregateIp(
    rows: IpRows,
    usersById: Map<number, UserType>,
    start: Date,
    axis: ScanAxis,
): Promise<ServiceIpAdmin> {
    const missingUserIds = new Set<number>();
    for (const row of [...rows.cookieRows, ...rows.registrationRows]) {
        if (!usersById.has(row.userId)) {
            missingUserIds.add(row.userId);
        }
    }
    if (missingUserIds.size > 0) {
        const users = await repo.users.getByIds([...missingUserIds]);
        for (const user of users) {
            usersById.set(user.id, userRecordToUserType(user));
        }
    }

    const seenAtDesc = [...rows.seenAtDesc].sort(
        (a, b) => b.valueOf() - a.valueOf(),
    );
    const cookieAtDesc = [...rows.cookieRows].sort(
        (a, b) => b.at.valueOf() - a.at.valueOf(),
    );
    const registrationAtDesc = [...rows.registrationRows].sort(
        (a, b) => b.at.valueOf() - a.at.valueOf(),
    );
    const submissionAtDesc = [...rows.submissionRows].sort(
        (a, b) => b.at.valueOf() - a.at.valueOf(),
    );

    const cookiePresents = cookieAtDesc.map((record) => ({
        at: localAdminIpString(record.at),
        user: usersById.get(record.userId) ?? null,
    }));
    const registrations = registrationAtDesc.map((record) => ({
        at: localAdminIpString(record.at),
        user: usersById.get(record.userId) ?? null,
    }));
    const submissions = submissionAtDesc.map((submission) => ({
        at: localAdminIpString(submission.at),
        filename: submission.filename,
    }));

    // missed_count: Scans, in denen die IP zwischen erster Sichtung und der
    // jüngsten Abgabe fehlte. Leere Scans stehen in `tikscan` und zählen mit.
    let missed_count = 0;
    let first_seen = "";
    let last_seen = "";

    if (seenAtDesc.length > 0) {
        // seenAtDesc ist absteigend sortiert.
        const newestSeen = seenAtDesc[0];
        const oldestSeen = seenAtDesc[seenAtDesc.length - 1];

        first_seen = localAdminIpString(oldestSeen);
        last_seen = localAdminIpString(newestSeen);

        // Nach der letzten Abgabe zählt nichts mehr: wer abgegeben hat und
        // dann geht, ist fertig, nicht fehlend.
        const cutoffTime = submissionAtDesc[0]?.at ?? null;
        const seenTimesSet = new Set(
            seenAtDesc.map((date) => date.toISOString()),
        );

        missed_count = axis.scans.filter((scan) => {
            if (scan.valueOf() < oldestSeen.valueOf()) return false;
            if (cutoffTime && scan.valueOf() > cutoffTime.valueOf()) {
                return false;
            }
            return !seenTimesSet.has(scan.toISOString());
        }).length;
    }

    const latest = axis.latest;
    const presentAtLatest = latest ? repo.ipfact.existsAt(rows.ip, latest) : false;
    const seenBefore = latest
        ? repo.ipfact.existsBefore(rows.ip, latest, start)
        : false;
    const lastSubmission = submissionAtDesc[0]?.at ?? null;
    const submittedThenLeft = latest != null && lastSubmission != null &&
        latest > lastSubmission;
    const is_stale = Boolean(
        latest && seenBefore && !presentAtLatest && !submittedThenLeft,
    );

    return {
        ip: rows.ip,
        seen_count: seenAtDesc.length,
        report_count: seenAtDesc.length + cookiePresents.length,
        missed_count,
        first_seen,
        last_seen,
        seen_at_desc: seenAtDesc.map((date) => localAdminIpString(date)),
        cookie_presents: cookiePresents,
        registrations,
        is_stale,
        submissions,
        has_submission: submissions.length > 0,
    };
}

/**
 * Aggregate admin data for all IPs seen in a time range.
 */
export async function for_range(
    start: Date,
    end: Date,
): Promise<ServiceAdminResult> {
    const seenRows = repo.ipfact.getInRange(start, end);
    const cookieRows = repo.cookiepresents.byRange(start, end);
    const registrationRows = repo.registrations.byRange(start, end);
    const submissionRows = repo.abgaben.getByDateRange(start, end);

    // Scan-Zeitachse des Zeitraums (auch leere Scans).
    const axis: ScanAxis = {
        scans: repo.ipfact.scansInRange(start, end),
        latest: repo.ipfact.latestScan(start, end),
    };

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

    // Nutzer einmal für alle IPs laden; der Kern findet sie im Cache.
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
        rv.push(await aggregateIp({
            ip,
            seenAtDesc: seenByIp.get(ip) ?? [],
            cookieRows: cookieByIp.get(ip) ?? [],
            registrationRows: registrationByIp.get(ip) ?? [],
            submissionRows: submissionsByIp.get(ip) ?? [],
        }, usersById, start, axis));
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
    const range_first_seen = axis.scans.length > 0
        ? localAdminIpString(axis.scans[0]) // axis.scans is sorted ascending
        : "";
    const range_last_seen = axis.scans.length > 0
        ? localAdminIpString(axis.scans[axis.scans.length - 1])
        : "";

    return { registered, unregistered, teacher_ips: teacherIps, anomalies, range_first_seen, range_last_seen };
}

/**
 * Karten-Eintrag für genau eine IP im Zeitraum (#163).
 *
 * Gleicher Kern wie `for_range`, aber ohne Klassifikation, Sortierung und
 * Anomalien. `null`, wenn die IP im Zeitraum weder gesehen wurde noch
 * Cookie-Präsenz, Registrierung oder Abgabe hat.
 */
export async function for_ip(
    ip: string,
    start: Date,
    end: Date,
): Promise<ServiceIpAdmin | null> {
    const seenAtDesc = repo.ipfact.getHistoryForIPInRangeDesc(ip, start, end);
    const cookieRows = repo.cookiepresents.byIPInRange(ip, start, end);
    const registrationRows = repo.registrations.byIPInRange(ip, start, end);
    const submissionRows = repo.abgaben.getByIPAndDateRange(ip, start, end);

    if (
        seenAtDesc.length === 0 && cookieRows.length === 0 &&
        registrationRows.length === 0 && submissionRows.length === 0
    ) {
        return null;
    }

    const axis: ScanAxis = {
        scans: repo.ipfact.scansInRange(start, end),
        latest: repo.ipfact.latestScan(start, end),
    };

    return await aggregateIp({
        ip,
        seenAtDesc,
        cookieRows,
        registrationRows,
        submissionRows,
    }, new Map<number, UserType>(), start, axis);
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

/**
 * Was ein abgeschlossener Scan am Forensik-Panel ändert (#163).
 *
 * Bezug ist der vorige Scan `P` aus `tikscan`; das Tagesfenster beginnt
 * um Mitternacht (Europe/Vienna). Nur **Übergänge** werden ein Ereignis:
 *
 * - bei diesem Scan da, bei `P` nicht → `card-<ip>`; zusätzlich `cards`,
 *   wenn die IP seit Tagesbeginn noch nie gesehen wurde — dann gibt es
 *   noch kein Kärtchen, das man einzeln tauschen könnte.
 * - bei `P` da, bei diesem Scan nicht → `card-<ip>` („nicht anwesend").
 * - bei beiden abwesend → nichts. Ein Kärtchen, das schon vorher weg war,
 *   ist kein neues Ereignis.
 *
 * Ein fehlgeschlagener Abruf schreibt keinen Scan und ruft diese Funktion
 * deshalb gar nicht erst auf.
 */
export function scanDelta(at: Date): ActivityComponent[] {
    const present = repo.ipfact.ipsAt(at);
    const presentSet = new Set(present);
    const previous = repo.ipfact.previousScan(at);
    const before = previous ? repo.ipfact.ipsAt(previous) : [];
    const beforeSet = new Set(before);
    // Sichtungen vor diesem Scan, aber im laufenden Tag: diese IPs haben
    // bereits ein Kärtchen.
    const seenToday = new Set(repo.ipfact.ipsBetween(localDayStart(at), at));

    const changed = new Set<string>();
    let needsCards = false;

    for (const ip of present) {
        if (beforeSet.has(ip)) {
            continue;
        }
        changed.add(ip);
        if (!seenToday.has(ip)) {
            needsCards = true;
        }
    }

    for (const ip of before) {
        if (!presentSet.has(ip)) {
            changed.add(ip);
        }
    }

    const cards = [...changed]
        .sort()
        .map((ip) => `card-${ipSlug(ip)}` as const);

    // `cards` zuerst, dann die Einzelkärtchen alphabetisch: derselbe
    // Batch ist damit reproduzierbar und in Tests vergleichbar.
    return needsCards ? ["cards", ...cards] : cards;
}
