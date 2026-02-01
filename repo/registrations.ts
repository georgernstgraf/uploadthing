import { db } from "./db.ts";

export type RepoRegistrationRecord = {
    id: number;
    ip: string;
    userId: number;
    at: Date;
};

/**
 * Fetch registrations by an IP within a UTC date range.
 * RepoRegistrationRecord: id, ip, userId, at (Date)
 */
export function byIPInRange(
    ip: string,
    start: Date,
    end: Date,
): RepoRegistrationRecord[] {
    const stmt = db.prepare(
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
    const rows = stmt.all(
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

/**
 * Fetch the most recent userId registered for an IP.
 */
export function getLatestRegistrationForIP(ip: string): number | null {
    const stmt = db.prepare(
        `select userId from registrations where ip = ? order by at desc limit 1`,
    );
    const result = stmt.get(ip) as
        | { userId: number }
        | undefined;
    return result?.userId ?? null;
}

/**
 * Insert a registration record for an IP and user.
 */
export function create(ip: string, userId: number, at: Date): void {
    const stmt = db.prepare(
        "INSERT INTO registrations (ip, userId, at) VALUES (?, ?, ?)",
    );
    stmt.run(ip, userId, at.toISOString());
}
