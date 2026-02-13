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
    SELECT userId, ip, at
    FROM combined_registrations
    WHERE ip = ?
        AND at BETWEEN ? AND ?
    ORDER BY at DESC`,
);

/**
 * Fetch registrations by an IP within a UTC date range.
 * RepoRegistrationRecord: id, ip, userId, at (Date)
 */
export function byIPInRange(
    ip: string,
    start: Date,
    end: Date,
): RepoRegistrationRecord[] {
    const rows = registrationsByIPInRange_stmt.all(
        ip,
        start.toISOString(),
        end.toISOString(),
    ) as { userId: number; ip: string; at: string }[];
    return rows.map((row) => ({
        id: 0,
        ip: row.ip,
        userId: row.userId,
        at: new Date(row.at),
    }));
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
    create_stmt.run(ip, userId, at.toISOString());
}

const latestIPForUser_stmt = db.prepare(
    `SELECT ip FROM registrations WHERE userId = ? ORDER BY at DESC LIMIT 1`,
);

/**
 * Fetch the most recent IP registered for a userId.
 */
export function getLatestIPForUser(userId: number): string | null {
    const result = latestIPForUser_stmt.get(userId) as
        | { ip: string }
        | undefined;
    return result?.ip ?? null;
}
