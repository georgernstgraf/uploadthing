import { db } from "./db.ts";

const createStmt = db.prepare(
    "INSERT INTO abgaben (userId, ip, filename, at) VALUES (?, ?, ?, ?)",
);
const deleteOlderThanStmt = db.prepare(
    "DELETE FROM abgaben WHERE at < ?",
);
const getByUserStmt = db.prepare(
    "SELECT id, userId, ip, filename, at FROM abgaben WHERE userId = ? ORDER BY at DESC",
);
const getByUserAndRangeStmt = db.prepare(
    `SELECT id, userId, ip, filename, at FROM abgaben
    WHERE userId = ? AND at BETWEEN ? AND ?
    ORDER BY at DESC`,
);
const getByRangeStmt = db.prepare(
    `SELECT id, userId, ip, filename, at FROM abgaben
    WHERE at BETWEEN ? AND ?`,
);
const getByIPAndRangeStmt = db.prepare(
    `SELECT id, userId, ip, filename, at FROM abgaben
    WHERE ip = ? AND at BETWEEN ? AND ?
    ORDER BY at DESC`,
);

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
    createStmt.run(userId, ip, filename, at.toISOString());
    const id = db.lastInsertRowId as number;
    return { id, userId, ip, filename, at };
}

export function deleteOlderThan(cutoff: Date): number {
    deleteOlderThanStmt.run(cutoff.toISOString());
    return db.changes;
}

/**
 * Fetch submissions for a user.
 */
export function getByUserId(userId: number): RepoAbgabeRecord[] {
    const rows = getByUserStmt.all(userId) as RepoAbgabeRecord[];
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
    const rows = getByUserAndRangeStmt.all(
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
    const rows = getByRangeStmt.all(
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
    const rows = getByIPAndRangeStmt.all(
        ip,
        start.toISOString(),
        end.toISOString(),
    ) as RepoAbgabeRecord[];
    return rows.map((row) => ({
        ...row,
        at: new Date(row.at),
    }));
}
