import { db } from "./db.ts";

export type RepoRegistrationRecord = {
    id: number;
    ip: string;
    userId: number;
    at: Date;
};

const select_event_stmt = db.prepare(
    `select id, ip, userId,
  strftime('%Y-%m-%dT%H:%M:%f', datetime(at, 'localtime')) as at
  from registrations 
  where at 
  between (select strftime('%Y-%m-%dT%H:%M:%fZ',datetime(?, 'utc'))) 
  and (select strftime('%Y-%m-%dT%H:%M:%fZ',datetime(?, 'utc'))) order by at`,
);

/**
 * Fetch registration events between two local time strings.
 */
export function getHistoryEventsRange(
    start: string,
    end: string,
): RepoRegistrationRecord[] {
    return select_event_stmt.all(start, end) as RepoRegistrationRecord[];
}

const registrationsByIP_prepared = db.prepare(
    `select userId, at from registrations where ip = ? order by at desc`,
);

/**
 * Fetch all registrations for an IP ordered by most recent.
 */
export function getRegistrationsByIP(ip: string): RepoRegistrationRecord[] {
    return registrationsByIP_prepared.all(ip) as RepoRegistrationRecord[];
}

const registrationsByIPInRange_stmt = db.prepare(
    `WITH combined_registrations AS (
        SELECT userId, ip, at FROM registrations
        UNION ALL
        SELECT userId, ip, at FROM forensic_registrations
    )
    SELECT userId, ip,
        strftime('%Y-%m-%dT%H:%M:%f', datetime(at, 'localtime')) as at
    FROM combined_registrations
    WHERE ip = ?
        AND at BETWEEN
        (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
        AND (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
    ORDER BY at DESC`,
);

/**
 * Fetch registrations by an IP within a UTC date range.
 */
export function byIPInRange(
    ip: string,
    start: Date,
    end: Date,
): RepoRegistrationRecord[] {
    return registrationsByIPInRange_stmt.all(
        ip,
        start.toISOString(),
        end.toISOString(),
    ) as RepoRegistrationRecord[];
}

/**
 * Fetch registrations by IP and resolve user records.
 */

export type RepoLatestRegistrationRecord = {
    ip: string;
    userId: number;
    at: string;
};

const getLastRegistrationForIPInRange_stmt = db.prepare(`
    WITH combined_registrations AS (
        SELECT userId, ip, at FROM registrations
        UNION ALL
        SELECT userId, ip, at FROM forensic_registrations
    )
    SELECT userId
    FROM combined_registrations
    WHERE ip = ?
        AND at BETWEEN (
            SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc'))
        ) AND (
            SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc'))
        )
    ORDER BY at DESC
    LIMIT 1
`);
/**
 * Get latest registered userId for an IP within a UTC range.
 */
export function lastRegistrationForIP_in_timerange(
    ip: string,
    start: Date,
    end: Date,
): number | null {
    // number -> userId
    const result = getLastRegistrationForIPInRange_stmt.get(
        ip,
        start.toISOString(),
        end.toISOString(),
    ) as { userId: number } | undefined;
    return result?.userId ?? null;
}

/**
 * Fetch latest registrations per IP within a UTC range.
 */
export function latestRegistrationsForIPsInRange(
    ips: string[],
    start: string,
    end: string,
): RepoLatestRegistrationRecord[] {
    if (ips.length === 0) return [];
    const placeholders = ips.map(() => "?").join(",");
    const query = `
        select r.ip, r.userId, r.at
        from registrations r
        join (
            select ip, max(at) as max_at
            from registrations
            where ip in (${placeholders})
              and at between
                (select strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
                and (select strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
            group by ip
        ) latest on r.ip = latest.ip and r.at = latest.max_at
    `;
    const stmt = db.prepare(query);
    return stmt.all(...ips, start, end) as RepoLatestRegistrationRecord[];
}

const latestRegistrationForIP_stmt = db.prepare(
    `select userId from registrations where ip = ? order by at desc limit 1`,
);

/**
 * Fetch the most recent userId registered for an IP.
 */
export function getLatestRegistrationForIP(ip: string): number | null {
    const result = latestRegistrationForIP_stmt.get(ip) as
        | { userId: number }
        | undefined;
    return result?.userId ?? null;
}

const create_stmt = db.prepare(
    "INSERT INTO registrations (ip, userId, at) VALUES (?, ?, ?)",
);

/**
 * Insert a registration record for an IP and user.
 */
export function create(ip: string, userId: number, at: Date): void {
    create_stmt.run(ip, userId, at);
}
