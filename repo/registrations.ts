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
    const registrationsByIPInRange_stmt = db.prepare(
        `SELECT userId, ip, at
        FROM registrations
        WHERE ip = ?
            AND at BETWEEN ? AND ?
        ORDER BY at DESC`,
    );
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

export function byRange(
    start: Date,
    end: Date,
): RepoRegistrationRecord[] {
    const registrationsByRange_stmt = db.prepare(
        `SELECT id, userId, ip, at
        FROM registrations
        WHERE at BETWEEN ? AND ?`,
    );
    const rows = registrationsByRange_stmt.all(
        start.toISOString(),
        end.toISOString(),
    ) as { id: number; userId: number; ip: string; at: string }[];
    return rows.map((row) => ({
        id: row.id,
        ip: row.ip,
        userId: row.userId,
        at: new Date(row.at),
    }));
}

/**
 * Fetch the most recent userId registered for an IP.
 */
export function getLatestRegistrationForIP(ip: string): number | null {
    const latestRegistrationForIP_stmt = db.prepare(
        `select userId from registrations where ip = ? order by at desc limit 1`,
    );
    const result = latestRegistrationForIP_stmt.get(ip) as
        | { userId: number }
        | undefined;
    return result?.userId ?? null;
}

/**
 * Insert a registration record for an IP and user.
 */
export function create(ip: string, userId: number, at: Date): void {
    const create_stmt = db.prepare(
        "INSERT INTO registrations (ip, userId, at) VALUES (?, ?, ?)",
    );
    create_stmt.run(ip, userId, at.toISOString());
}

export function deleteOlderThan(cutoff: Date): number {
    const deleteOlderThan_stmt = db.prepare(
        "DELETE FROM registrations WHERE at < ?",
    );
    deleteOlderThan_stmt.run(cutoff.toISOString());
    return db.changes;
}

/**
 * Fetch the most recent IP registered for a userId.
 */
export function getLatestIPForUser(userId: number): string | null {
    const latestIPForUser_stmt = db.prepare(
        `SELECT ip FROM registrations WHERE userId = ? ORDER BY at DESC LIMIT 1`,
    );
    const result = latestIPForUser_stmt.get(userId) as
        | { ip: string }
        | undefined;
    return result?.ip ?? null;
}
