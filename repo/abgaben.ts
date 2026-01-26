import { db } from "./db.ts";

export type AbgabeRecord = {
    id: number;
    userId: number;
    ip: string;
    filename: string;
    at: Date;
};

const create_stmt = db.prepare(
    "INSERT INTO abgaben (userId, ip, filename, at) VALUES (?, ?, ?, ?)",
);

export function create(
    userId: number,
    ip: string,
    filename: string,
    at: Date,
): AbgabeRecord {
    create_stmt.run(userId, ip, filename, at);
    const id = db.lastInsertRowId as number;
    return { id, userId, ip, filename, at };
}

const getByUser_stmt = db.prepare(
    "SELECT id, userId, ip, filename, at FROM abgaben WHERE userId = ? ORDER BY at DESC",
);

export function getByUserId(userId: number): AbgabeRecord[] {
    return getByUser_stmt.all(userId) as AbgabeRecord[];
}

const getByUserAndRange_stmt = db.prepare(
    `SELECT id, userId, ip, filename, at FROM abgaben
    WHERE userId = ? AND at BETWEEN
    (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc'))) AND
    (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
    ORDER BY at DESC`,
);

export function getByUserIdAndDateRange(
    userId: number,
    start: string,
    end: string,
): AbgabeRecord[] {
    return getByUserAndRange_stmt.all(userId, start, end) as AbgabeRecord[];
}

const getByRange_stmt = db.prepare(
    `SELECT id, userId, ip, filename, at FROM abgaben
    WHERE at BETWEEN
    (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc'))) AND
    (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
    ORDER BY at DESC`,
);

export function getByDateRange(start: string, end: string): AbgabeRecord[] {
    return getByRange_stmt.all(start, end) as AbgabeRecord[];
}

const getByIPAndRange_stmt = db.prepare(
    `SELECT id, userId, ip, filename, at FROM abgaben
    WHERE ip = ? AND at BETWEEN
    (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc'))) AND
    (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, 'utc')))
    ORDER BY at DESC`,
);

export function getByIPAndDateRange(
    ip: string,
    start: Date,
    end: Date,
): AbgabeRecord[] {
    return getByIPAndRange_stmt.all(
        ip,
        start.toISOString(),
        end.toISOString(),
    ) as AbgabeRecord[];
}
