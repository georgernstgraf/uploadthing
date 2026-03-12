import { db } from "./db.ts";

export type RepoAbgabeRecord = {
    id: number;
    userId: number;
    ip: string;
    filename: string;
    at: Date;
};

/**
 * Insert a submission record.
 */
export function create(
    userId: number,
    ip: string,
    filename: string,
    at: Date,
): RepoAbgabeRecord {
    const create_stmt = db.prepare(
        "INSERT INTO abgaben (userId, ip, filename, at) VALUES (?, ?, ?, ?)",
    );
    create_stmt.run(userId, ip, filename, at.toISOString());
    const id = db.lastInsertRowId as number;
    return { id, userId, ip, filename, at };
}

export function deleteOlderThan(cutoff: Date): number {
    const deleteOlderThan_stmt = db.prepare(
        "DELETE FROM abgaben WHERE at < ?",
    );
    deleteOlderThan_stmt.run(cutoff.toISOString());
    return db.changes;
}

/**
 * Fetch submissions for a user.
 */
export function getByUserId(userId: number): RepoAbgabeRecord[] {
    const getByUser_stmt = db.prepare(
        "SELECT id, userId, ip, filename, at FROM abgaben WHERE userId = ? ORDER BY at DESC",
    );
    const rows = getByUser_stmt.all(userId) as RepoAbgabeRecord[];
    return rows.map((row) => ({
        ...row,
        at: new Date(row.at),
    }));
}

/**
 * Fetch submissions for a user within a date range.
 */
export function getByUserIdAndDateRange(
    userId: number,
    start: Date,
    end: Date,
): RepoAbgabeRecord[] {
    const getByUserAndRange_stmt = db.prepare(
        `SELECT id, userId, ip, filename, at FROM abgaben
        WHERE userId = ? AND at BETWEEN ? AND ?
        ORDER BY at DESC`,
    );
    const rows = getByUserAndRange_stmt.all(
        userId,
        start.toISOString(),
        end.toISOString(),
    ) as RepoAbgabeRecord[];
    return rows.map((row) => ({
        ...row,
        at: new Date(row.at),
    }));
}

/**
 * Fetch submissions within a date range.
 */
export function getByDateRange(
    start: Date,
    end: Date,
): RepoAbgabeRecord[] {
    const getByRange_stmt = db.prepare(
        `SELECT id, userId, ip, filename, at FROM abgaben
        WHERE at BETWEEN ? AND ?
        ORDER BY at DESC`,
    );
    const rows = getByRange_stmt.all(
        start.toISOString(),
        end.toISOString(),
    ) as RepoAbgabeRecord[];
    return rows.map((row) => ({
        ...row,
        at: new Date(row.at),
    }));
}

/**
 * Fetch submissions for an IP within a date range.
 */
export function getByIPAndDateRange(
    ip: string,
    start: Date,
    end: Date,
): RepoAbgabeRecord[] {
    const getByIPAndRange_stmt = db.prepare(
        `SELECT id, userId, ip, filename, at FROM abgaben
        WHERE ip = ? AND at BETWEEN ? AND ?
        ORDER BY at DESC`,
    );
    const rows = getByIPAndRange_stmt.all(
        ip,
        start.toISOString(),
        end.toISOString(),
    ) as RepoAbgabeRecord[];
    return rows.map((row) => ({
        ...row,
        at: new Date(row.at),
    }));
}
