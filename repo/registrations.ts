import { db } from "./db.ts";

export type RepoRegistrationRecord = {
    id: number;
    ip: string;
    userId: number;
    at: Date;
};

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
