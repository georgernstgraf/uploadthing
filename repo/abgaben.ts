import { db } from "./db.ts";

export type RepoAbgabeRecord = {
    id: number;
    userId: number;
    ip: string;
    filename: string;
    at: Date;
};

const create_stmt = db.prepare(
    "INSERT INTO abgaben (userId, ip, filename, at) VALUES (?, ?, ?, ?)",
);

/**
 * Insert a submission record.
 */
export function create(
    userId: number,
    ip: string,
    filename: string,
    at: Date,
): RepoAbgabeRecord {
    create_stmt.run(userId, ip, filename, at);
    const id = db.lastInsertRowId as number;
    return { id, userId, ip, filename, at };
}

const getByUser_stmt = db.prepare(
    "SELECT id, userId, ip, filename, at FROM abgaben WHERE userId = ? ORDER BY at DESC",
);

/**
 * Fetch submissions for a user.
 */
export function getByUserId(userId: number): RepoAbgabeRecord[] {
    return getByUser_stmt.all(userId) as RepoAbgabeRecord[];
}

const getByUserAndRange_stmt = db.prepare(
    `SELECT id, userId, ip, filename, at FROM abgaben
    WHERE userId = ? AND at BETWEEN ? AND ?
    ORDER BY at DESC`,
);

/**
 * Fetch submissions for a user within a date range.
 */
export function getByUserIdAndDateRange(
    userId: number,
    start: Date,
    end: Date,
): RepoAbgabeRecord[] {
    return getByUserAndRange_stmt.all(
        userId,
        start.toISOString(),
        end.toISOString(),
    ) as RepoAbgabeRecord[];
}

const getByRange_stmt = db.prepare(
    `SELECT id, userId, ip, filename, at FROM abgaben
    WHERE at BETWEEN ? AND ?
    ORDER BY at DESC`,
);

/**
 * Fetch submissions within a date range.
 */
export function getByDateRange(
    start: Date,
    end: Date,
): RepoAbgabeRecord[] {
    return getByRange_stmt.all(
        start.toISOString(),
        end.toISOString(),
    ) as RepoAbgabeRecord[];
}

const getByIPAndRange_stmt = db.prepare(
    `SELECT id, userId, ip, filename, at FROM abgaben
    WHERE ip = ? AND at BETWEEN ? AND ?
    ORDER BY at DESC`,
);

/**
 * Fetch submissions for an IP within a date range.
 */
export function getByIPAndDateRange(
    ip: string,
    start: Date,
    end: Date,
): RepoAbgabeRecord[] {
    return getByIPAndRange_stmt.all(
        ip,
        start.toISOString(),
        end.toISOString(),
    ) as RepoAbgabeRecord[];
}
