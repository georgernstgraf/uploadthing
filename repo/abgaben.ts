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
    const stmt = db.prepare(
        "INSERT INTO abgaben (userId, ip, filename, at) VALUES (?, ?, ?, ?)",
    );
    stmt.run(userId, ip, filename, at.toISOString());
    const id = db.lastInsertRowId as number;
    return { id, userId, ip, filename, at };
}

/**
 * Fetch submissions for a user.
 */
export function getByUserId(userId: number): RepoAbgabeRecord[] {
    const stmt = db.prepare(
        "SELECT id, userId, ip, filename, at FROM abgaben WHERE userId = ? ORDER BY at DESC",
    );
    const rows = stmt.all(userId) as RepoAbgabeRecord[];
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
    const stmt = db.prepare(
        `SELECT id, userId, ip, filename, at FROM abgaben
        WHERE userId = ? AND at BETWEEN ? AND ?
        ORDER BY at DESC`,
    );
    const rows = stmt.all(
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
    const stmt = db.prepare(
        `SELECT id, userId, ip, filename, at FROM abgaben
        WHERE at BETWEEN ? AND ?
        ORDER BY at DESC`,
    );
    const rows = stmt.all(
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
    const stmt = db.prepare(
        `SELECT id, userId, ip, filename, at FROM abgaben
        WHERE ip = ? AND at BETWEEN ? AND ?
        ORDER BY at DESC`,
    );
    const rows = stmt.all(
        ip,
        start.toISOString(),
        end.toISOString(),
    ) as RepoAbgabeRecord[];
    return rows.map((row) => ({
        ...row,
        at: new Date(row.at),
    }));
}
